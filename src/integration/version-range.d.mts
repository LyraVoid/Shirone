/** A SemVer version, including prerelease identifiers; build metadata is ignored. */
export interface Version {
	major: number;
	minor: number;
	patch: number;
	prerelease: string[];
}

/** A version with the inclusivity of the comparison that produced it. */
export interface Bound {
	version: Version;
	inclusive: boolean;
}

/** A contiguous supported range. */
export interface Interval {
	low: Bound | null;
	high: Bound | null;
	/** Release tuples explicitly named by prerelease comparators. */
	prereleaseTuples: ReadonlySet<string>;
	/** True when the input used syntax outside this parser's supported subset. */
	unreadable: boolean;
}

/** Reads a strict SemVer version, or returns null when it is invalid. */
export function parseVersion(raw: unknown): Version | null;

/** Reads a supported simple range into an interval. */
export function parseInterval(range: unknown): Interval;

/** Intersects two intervals, including the prerelease gate. */
export function intersectIntervals(a: Interval, b: Interval): Interval;

/** Whether an interval contains no SemVer version at all. */
export function intervalIsEmpty(interval: Interval): boolean;

/** Whether some version can satisfy both ranges at once. */
export function rangesIntersect(
	declared: string | undefined,
	required: string | undefined,
): boolean;

/** Whether `version` falls inside `range`. */
export function versionSatisfies(
	version: string | null,
	range: string | undefined,
): boolean;
