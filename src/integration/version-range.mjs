/**
 * Dependency-free SemVer range reasoning shared by the theme's peer check and
 * its `init --update` repair path.
 *
 * This is a deliberately small subset, not a replacement for npm's `semver`:
 * it understands full and partial versions, `x`/`*`, caret, tilde, exact
 * comparators, and comparator sets joined by whitespace. An unsupported range
 * is marked unreadable and fails open, so this code cannot block a build on a
 * syntax it does not understand.
 *
 * It lives in `.mjs` because `cli.mjs` runs directly in Node before the user
 * installs any project dependencies; `verify-peers.ts` imports the same code
 * from the Astro integration. Keeping one implementation prevents the two
 * checks from drifting apart.
 */

/** @typedef {{ major: number, minor: number, patch: number, prerelease: string[] }} Version */
/** @typedef {{ version: Version, inclusive: boolean }} Bound */
/** @typedef {{ version: Version, precision: number }} PartialVersion */

const NUMERIC = "(?:0|[1-9]\\d*)";
const IDENTIFIER = "[0-9A-Za-z-]+";
const SEMVER_RE = new RegExp(
	`^v?(${NUMERIC})\\.(${NUMERIC})\\.(${NUMERIC})(?:-(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?(?:\\+(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?$`,
);
const PARTIAL_RE = new RegExp(
	`^v?(${NUMERIC}|[xX*])(?:\\.(${NUMERIC}|[xX*]))?(?:\\.(${NUMERIC}|[xX*]))?(?:-(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?(?:\\+(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?$`,
);
const EMPTY_TUPLES = new Set();

/** A version with the inclusivity of the comparison that produced it. */
class BoundValue {
	/**
	 * @param {Version} version
	 * @param {boolean} inclusive
	 */
	constructor(version, inclusive) {
		this.version = version;
		this.inclusive = inclusive;
	}
}

/**
 * A contiguous range. A null bound means unbounded in that direction;
 * `prereleaseTuples` records the release tuples explicitly named by a
 * prerelease comparator, as required by npm's prerelease matching rule.
 */
class Interval {
	/**
	 * @param {Bound | null} low
	 * @param {Bound | null} high
	 * @param {Set<string>} [prereleaseTuples]
	 * @param {boolean} [unreadable]
	 */
	constructor(low, high, prereleaseTuples = new Set(), unreadable = false) {
		this.low = low;
		this.high = high;
		this.prereleaseTuples = prereleaseTuples;
		this.unreadable = unreadable;
	}
}

/** A known range that admits every release version. */
const UNBOUNDED = new Interval(null, null);
/** An unsupported range: keep it distinct so callers can fail open. */
const UNREADABLE = new Interval(null, null, new Set(), true);

/** @param {Version} version */
function tupleKey(version) {
	return `${version.major}.${version.minor}.${version.patch}`;
}

/** @param {string[]} identifiers */
function validPrereleaseIdentifiers(identifiers) {
	return identifiers.every(
		(identifier) =>
			!/^\d+$/.test(identifier) || identifier === "0" || identifier[0] !== "0",
	);
}

/**
 * Reads a strict SemVer version, preserving prerelease identifiers while
 * ignoring valid build metadata for precedence.
 *
 * @param {unknown} raw
 * @returns {Version | null}
 */
export function parseVersion(raw) {
	if (typeof raw !== "string") return null;
	const match = SEMVER_RE.exec(raw.trim());
	if (!match) return null;

	const [major, minor, patch] = match.slice(1, 4).map(Number);
	if (![major, minor, patch].every(Number.isSafeInteger)) return null;

	const prerelease = match[4] ? match[4].split(".") : [];
	if (!validPrereleaseIdentifiers(prerelease)) return null;

	return { major, minor, patch, prerelease };
}

/**
 * Parses a range version, accepting omitted or wildcard components. A
 * prerelease/build suffix is accepted only with all three numeric components.
 *
 * @param {string} raw
 * @returns {PartialVersion | null}
 */
function parsePartialVersion(raw) {
	const match = PARTIAL_RE.exec(raw);
	if (!match) return null;

	const parts = match.slice(1, 4);
	const values = [];
	let precision = 0;
	let wildcardSeen = false;
	for (const part of parts) {
		if (part === undefined || /^[xX*]$/.test(part)) {
			wildcardSeen = true;
			values.push(0);
			continue;
		}
		if (wildcardSeen) return null;
		const value = Number(part);
		if (!Number.isSafeInteger(value)) return null;
		precision += 1;
		values.push(value);
	}

	const prerelease = match[4] ? match[4].split(".") : [];
	if (
		((match[4] !== undefined || match[5] !== undefined) && precision !== 3) ||
		!validPrereleaseIdentifiers(prerelease)
	) {
		return null;
	}

	return {
		version: {
			major: values[0],
			minor: values[1],
			patch: values[2],
			prerelease,
		},
		precision,
	};
}

/** @param {Version} a @param {Version} b */
function compareRelease(a, b) {
	for (const part of ["major", "minor", "patch"]) {
		if (a[part] !== b[part]) return a[part] < b[part] ? -1 : 1;
	}
	return 0;
}

/** Compare two prerelease identifiers under SemVer precedence. */
function comparePrereleaseIdentifier(a, b) {
	const aNumeric = /^\d+$/.test(a);
	const bNumeric = /^\d+$/.test(b);
	if (aNumeric && bNumeric) {
		if (a.length !== b.length) return a.length < b.length ? -1 : 1;
		return a === b ? 0 : a < b ? -1 : 1;
	}
	if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
	return a === b ? 0 : a < b ? -1 : 1;
}

/** Compare full SemVer precedence; build metadata is intentionally absent. */
function compareVersions(a, b) {
	const releaseOrder = compareRelease(a, b);
	if (releaseOrder !== 0) return releaseOrder;

	const aPre = a.prerelease;
	const bPre = b.prerelease;
	if (aPre.length === 0 || bPre.length === 0) {
		if (aPre.length === bPre.length) return 0;
		return aPre.length === 0 ? 1 : -1;
	}

	const commonLength = Math.min(aPre.length, bPre.length);
	for (let index = 0; index < commonLength; index += 1) {
		const order = comparePrereleaseIdentifier(aPre[index], bPre[index]);
		if (order !== 0) return order;
	}
	if (aPre.length === bPre.length) return 0;
	return aPre.length < bPre.length ? -1 : 1;
}

/** @param {number} major @param {number} minor @param {number} patch */
function releaseVersion(major, minor, patch) {
	return { major, minor, patch, prerelease: [] };
}

/** Increment the next release component without exceeding safe integers. */
function nextReleaseBoundary(version, component) {
	if (component === "major") {
		if (version.major >= Number.MAX_SAFE_INTEGER) return null;
		return releaseVersion(version.major + 1, 0, 0);
	}
	if (component === "minor") {
		if (version.minor >= Number.MAX_SAFE_INTEGER) return null;
		return releaseVersion(version.major, version.minor + 1, 0);
	}
	if (version.patch < Number.MAX_SAFE_INTEGER)
		return releaseVersion(version.major, version.minor, version.patch + 1);
	if (version.minor < Number.MAX_SAFE_INTEGER)
		return releaseVersion(version.major, version.minor + 1, 0);
	if (version.major < Number.MAX_SAFE_INTEGER)
		return releaseVersion(version.major + 1, 0, 0);
	return null;
}

/**
 * The next wildcard boundary for a partial version: `7` → `8.0.0`,
 * `7.3`/`7.3.x` → `7.4.0`.
 * @param {PartialVersion} parsed
 */
function partialUpperBoundary(parsed) {
	return nextReleaseBoundary(
		parsed.version,
		parsed.precision <= 1 ? "major" : "minor",
	);
}

/** The prerelease tuple explicitly named by a range version, if any. */
function namedPrereleaseTuple(version) {
	return version.prerelease.length > 0
		? new Set([tupleKey(version)])
		: new Set();
}

/** `^x.y.z` and the valid partial forms `^x.y` / `^x`. */
function caretInterval(parsed) {
	if (parsed.precision === 0) return UNBOUNDED;
	const { version, precision } = parsed;
	let upper;
	if (version.major > 0) {
		upper = nextReleaseBoundary(version, "major");
	} else if (version.minor > 0) {
		upper = nextReleaseBoundary(version, "minor");
	} else if (precision === 1) {
		// `^0` and `^0.x` cover the whole 0.x line.
		upper = releaseVersion(1, 0, 0);
	} else if (precision === 2) {
		// `^0.0` and `^0.0.x` stop before 0.1.0.
		upper = releaseVersion(0, 1, 0);
	} else {
		// `^0.0.3` stops before 0.0.4; `^0.0.0` before 0.0.1.
		upper = nextReleaseBoundary(version, "patch");
	}

	return new Interval(
		new BoundValue(version, true),
		upper ? new BoundValue(upper, false) : null,
		namedPrereleaseTuple(version),
	);
}

/** `~x.y.z` and its partial forms (`~x.y`, `~x`). */
function tildeInterval(parsed) {
	if (parsed.precision === 0) return UNBOUNDED;
	const { version } = parsed;
	const upper = partialUpperBoundary(parsed);
	return new Interval(
		new BoundValue(version, true),
		upper ? new BoundValue(upper, false) : null,
		namedPrereleaseTuple(version),
	);
}

/** A bare exact, partial, or wildcard version. */
function fixedOrPartialInterval(parsed) {
	if (parsed.precision === 0) return UNBOUNDED;
	if (parsed.precision === 3) {
		return new Interval(
			new BoundValue(parsed.version, true),
			new BoundValue(parsed.version, true),
			namedPrereleaseTuple(parsed.version),
		);
	}

	const upper = partialUpperBoundary(parsed);
	return new Interval(
		new BoundValue(parsed.version, true),
		upper ? new BoundValue(upper, false) : null,
	);
}

/**
 * Parse one comparator. Partial comparators use npm-style boundaries: `>7.3`
 * starts at 7.4.0, while `<=7.3` stops before 7.4.0.
 */
function comparisonInterval(operator, parsed) {
	if (parsed.precision === 0) return UNBOUNDED;

	if (parsed.precision === 3) {
		const version = parsed.version;
		const prereleases = namedPrereleaseTuple(version);
		if (operator === "=") {
			return new Interval(
				new BoundValue(version, true),
				new BoundValue(version, true),
				prereleases,
			);
		}
		if (operator === ">=" || operator === ">") {
			return new Interval(
				new BoundValue(version, operator === ">="),
				null,
				prereleases,
			);
		}
		return new Interval(
			null,
			new BoundValue(version, operator === "<="),
			prereleases,
		);
	}

	const lower = new BoundValue(parsed.version, true);
	const upperVersion = partialUpperBoundary(parsed);
	if (operator === ">=") return new Interval(lower, null);
	if (operator === ">") {
		return new Interval(
			upperVersion ? new BoundValue(upperVersion, true) : lower,
			null,
		);
	}
	if (operator === "<")
		return new Interval(null, new BoundValue(parsed.version, false));
	if (operator === "<=") {
		return new Interval(
			null,
			upperVersion ? new BoundValue(upperVersion, false) : null,
		);
	}
	return new Interval(
		lower,
		upperVersion ? new BoundValue(upperVersion, false) : null,
	);
}

/** Intersect only the inclusive/exclusive bounds, without prerelease metadata. */
function intersectBounds(a, b) {
	let low;
	if (a.low && b.low) {
		const compared = compareVersions(a.low.version, b.low.version);
		low =
			compared === 0
				? new BoundValue(a.low.version, a.low.inclusive && b.low.inclusive)
				: compared > 0
					? a.low
					: b.low;
	} else {
		low = a.low ?? b.low;
	}

	let high;
	if (a.high && b.high) {
		const compared = compareVersions(a.high.version, b.high.version);
		high =
			compared === 0
				? new BoundValue(a.high.version, a.high.inclusive && b.high.inclusive)
				: compared < 0
					? a.high
					: b.high;
	} else {
		high = a.high ?? b.high;
	}
	return { low, high };
}

/**
 * Reads a comparator set such as `>=7.0.0 <8.0.0` as a conjunction. A
 * comparator that cannot be parsed makes the whole set unreadable rather than
 * silently dropping one of its bounds.
 * @param {string} text
 * @returns {Interval | null}
 */
function comparatorSet(text) {
	const parts = text.split(/\s+/).filter(Boolean);
	let bounds = { low: null, high: null };
	const prereleaseTuples = new Set();

	for (let index = 0; index < parts.length; index += 1) {
		const part = parts[index];
		let operator;
		let versionText;
		const separatedOperator = /^(>=|<=|>|<|=)$/.exec(part);
		if (separatedOperator) {
			operator = separatedOperator[1];
			versionText = parts[index + 1];
			index += 1;
		} else {
			const combined = /^(>=|<=|>|<|=)(.*)$/.exec(part);
			if (!combined) return null;
			operator = combined[1];
			versionText = combined[2];
		}
		if (!versionText) return null;

		const parsed = parsePartialVersion(versionText);
		if (!parsed) return null;
		const comparator = comparisonInterval(operator, parsed);
		for (const tuple of comparator.prereleaseTuples)
			prereleaseTuples.add(tuple);
		bounds = intersectBounds(bounds, comparator);
	}

	return new Interval(bounds.low, bounds.high, prereleaseTuples);
}

/**
 * Reads one supported range into a contiguous interval. OR ranges, aliases,
 * workspace/file references, tags, hyphen ranges, and other unknown syntax
 * return an unreadable unbounded interval so callers can fail open.
 *
 * @param {unknown} range
 * @returns {Interval}
 */
export function parseInterval(range) {
	if (typeof range !== "string") return UNREADABLE;
	const text = range.trim();
	if (
		text === "" ||
		text === "latest" ||
		text.startsWith("workspace:") ||
		text.startsWith("file:") ||
		text.startsWith("link:") ||
		text.startsWith("npm:") ||
		text.includes("||")
	) {
		return UNREADABLE;
	}
	if (text === "*" || /^[xX]$/.test(text)) return UNBOUNDED;

	if (text.startsWith("^")) {
		const parsed = parsePartialVersion(text.slice(1).trim());
		return parsed ? caretInterval(parsed) : UNREADABLE;
	}
	if (text.startsWith("~")) {
		const parsed = parsePartialVersion(text.slice(1).trim());
		return parsed ? tildeInterval(parsed) : UNREADABLE;
	}
	if (/^(>=|<=|>|<|=)/.test(text)) {
		return comparatorSet(text) ?? UNREADABLE;
	}

	const parsed = parsePartialVersion(text);
	return parsed ? fixedOrPartialInterval(parsed) : UNREADABLE;
}

/**
 * Intersects two intervals. A prerelease tuple is retained only when both
 * ranges explicitly name it; release versions are unaffected by that gate.
 *
 * @param {Interval} a
 * @param {Interval} b
 * @returns {Interval}
 */
export function intersectIntervals(a, b) {
	const bounds = intersectBounds(a, b);
	const prereleaseTuples = new Set(
		[...(a.prereleaseTuples ?? EMPTY_TUPLES)].filter((tuple) =>
			(b.prereleaseTuples ?? EMPTY_TUPLES).has(tuple),
		),
	);
	return new Interval(
		bounds.low,
		bounds.high,
		prereleaseTuples,
		a.unreadable || b.unreadable,
	);
}

/** Whether the inclusive/exclusive endpoints themselves cross. */
function hasCrossedBounds(interval) {
	if (!interval.low || !interval.high) return false;
	const compared = compareVersions(interval.low.version, interval.high.version);
	return (
		compared > 0 ||
		(compared === 0 && !(interval.low.inclusive && interval.high.inclusive))
	);
}

/** Does the interval contain at least one release version? */
function containsRelease(interval) {
	let candidate;
	if (!interval.low) {
		candidate = releaseVersion(0, 0, 0);
	} else if (interval.low.version.prerelease.length > 0) {
		candidate = releaseVersion(
			interval.low.version.major,
			interval.low.version.minor,
			interval.low.version.patch,
		);
	} else if (interval.low.inclusive) {
		candidate = interval.low.version;
	} else {
		candidate = nextReleaseBoundary(interval.low.version, "patch");
	}
	return (
		candidate !== null &&
		candidate !== undefined &&
		withinBounds(candidate, interval)
	);
}

/** A version just above an exclusive prerelease bound, if one is needed. */
function afterPrerelease(version) {
	// SemVer's prerelease ordering has no immediate successor: appending `.0`
	// yields a valid version above the bound and below any later identifier
	// that admits an intervening version (for example beta.1 < beta.1.0 < beta.2).
	return { ...version, prerelease: [...version.prerelease, "0"] };
}

/** Does an explicitly named prerelease tuple contribute any version? */
function containsPrerelease(interval) {
	for (const tuple of interval.prereleaseTuples ?? EMPTY_TUPLES) {
		const [major, minor, patch] = tuple.split(".").map(Number);
		const core = releaseVersion(major, minor, patch);
		let candidate = { ...core, prerelease: ["0"] };

		if (interval.low) {
			const compared = compareRelease(core, interval.low.version);
			if (compared < 0) continue;
			if (compared === 0) {
				// Prereleases precede their release, so a release lower bound at
				// this tuple excludes every prerelease of the tuple.
				if (interval.low.version.prerelease.length === 0) continue;
				candidate = interval.low.inclusive
					? interval.low.version
					: afterPrerelease(interval.low.version);
			}
		}

		if (withinBounds(candidate, interval)) return true;
	}
	return false;
}

/** Whether a version falls between the bounds, including full SemVer order. */
function withinBounds(version, interval) {
	if (interval.low) {
		const compared = compareVersions(version, interval.low.version);
		if (compared < 0 || (compared === 0 && !interval.low.inclusive))
			return false;
	}
	if (interval.high) {
		const compared = compareVersions(version, interval.high.version);
		if (compared > 0 || (compared === 0 && !interval.high.inclusive))
			return false;
	}
	return true;
}

/** Whether an interval contains no SemVer version under its prerelease gate. */
export function intervalIsEmpty(interval) {
	if (interval.unreadable) return false;
	if (hasCrossedBounds(interval)) return true;
	return !containsRelease(interval) && !containsPrerelease(interval);
}

/**
 * Whether some version can satisfy both ranges at once. Unsupported syntax
 * fails open; a supported prerelease-only interval is checked against its
 * explicitly named prerelease tuple as well as its bounds.
 *
 * @param {string | undefined} declared
 * @param {string | undefined} required
 * @returns {boolean}
 */
export function rangesIntersect(declared, required) {
	const declaredInterval = parseInterval(declared);
	const requiredInterval = parseInterval(required);
	if (declaredInterval.unreadable || requiredInterval.unreadable) return true;
	return !intervalIsEmpty(
		intersectIntervals(declaredInterval, requiredInterval),
	);
}

/**
 * Whether a concrete installed version falls inside a supported range. An
 * unreadable version is not evidence either way; an unreadable range fails open
 * for releases but still rejects prereleases, matching npm's `semver` rule.
 *
 * @param {string | null} version
 * @param {string | undefined} range
 * @returns {boolean}
 */
export function versionSatisfies(version, range) {
	const parsed = parseVersion(version);
	if (!parsed) return true;

	const interval = parseInterval(range);
	if (interval.unreadable) return parsed.prerelease.length === 0;
	if (!withinBounds(parsed, interval)) return false;
	if (
		parsed.prerelease.length > 0 &&
		!interval.prereleaseTuples.has(tupleKey(parsed))
	) {
		return false;
	}
	return true;
}
