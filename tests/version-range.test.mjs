import assert from "node:assert/strict";
import test from "node:test";
import {
	intervalIsEmpty,
	parseInterval,
	parseVersion,
	rangesIntersect,
	versionSatisfies,
} from "../src/integration/version-range.mjs";

/**
 * `init --update` rewrites a declared range when, and only when, it shares no
 * version with what the theme asks for. That decision is now a single call to
 * `rangesIntersect` in `cli.mjs`, so this table *is* the repair path's
 * behaviour: the same engine drives `verify-peers.ts`, which is what makes
 * "run `shirones init --update` to fix this" a true statement.
 */
const BUMP_TABLE = [
	// [declared, required, should the project be rewritten]
	// A pinned version below the theme's floor.
	["5.0.0", "^7.3.5", true],
	["7.0.0", "^7.3.5", true],
	// A caret that *starts* below the floor still reaches it, so it is left
	// alone — the same situation as `^7.3.0`, and rewriting it would be churn.
	["^7.0.0", "^7.3.5", false],
	// A one-sided comparator the theme can never satisfy — the case the floor
	// comparison missed, because it only ever looked at `7.3.5` and saw "equal".
	["<7.3.5", "^7.3.5", true],
	["<=7.3.4", "^7.3.5", true],
	// A 0.x caret above the requirement: higher floor, disjoint range.
	["^0.36.0", "^0.35.5", true],
	// A whole major above, with both full and partial range spellings.
	["8.0.0", "^7.3.5", true],
	["^8", "^7.3.5", true],
	// The partial tilde stays within the 7.3 minor and overlaps the requirement.
	["~7.3", "^7.3.5", false],
	// A comparator set whose upper bound excludes the whole requirement.
	[">=7.0.0 <7.3.5", "^7.3.5", true],
	// Nothing to do: the deployment still admits a version the theme supports.
	["^7.3.5", "^7.3.5", false],
	["^7.4.0", "^7.3.5", false],
	["~7.3.9", "^7.3.5", false],
	// `^7.3.0` intersects `^7.3.5` at 7.3.5 and above, so a *floor* comparison
	// rewriting it here is the churn the audit flagged — it must be left alone.
	["^7.3.0", "^7.3.5", false],
	// A comparator set that does cover the requirement.
	[">=7.3.5 <8.0.0", "^7.3.5", false],
	// Unreadable ranges are "no constraint", never a rewrite.
	["latest", "^7.3.5", false],
	["*", "^7.3.5", false],
	["", "^7.3.5", false],
	["workspace:^", "^7.3.5", false],
	[undefined, "^7.3.5", false],
];

for (const [declared, required, shouldRewrite] of BUMP_TABLE) {
	test(`init --update ${shouldRewrite ? "rewrites" : "leaves"} ${declared ?? "no range"} for ${required}`, () => {
		assert.equal(
			!rangesIntersect(declared, required),
			shouldRewrite,
			`theme needs ${required}, project declares ${declared}`,
		);
	});
}

test("a range the engine cannot read counts as unbounded in both directions", () => {
	for (const range of [
		"latest",
		"*",
		"",
		undefined,
		42,
		"workspace:^",
		"^7 || ^8",
	]) {
		assert.equal(intervalIsEmpty(parseInterval(range)), false, String(range));
	}
});

test("an installed version is checked against the range itself", () => {
	assert.equal(versionSatisfies("7.4.2", "^7.3.5"), true);
	assert.equal(versionSatisfies("7.3.5", "^7.3.5"), true);
	assert.equal(versionSatisfies("7.3.4", "^7.3.5"), false);
	assert.equal(versionSatisfies("8.0.0", "^7.3.5"), false);
	// 0.x carets do not cross a minor boundary in either direction.
	assert.equal(versionSatisfies("0.35.9", "^0.35.5"), true);
	assert.equal(versionSatisfies("0.36.0", "^0.35.5"), false);
	// An unreadable version is not evidence either way.
	assert.equal(versionSatisfies("not-a-version", "^7.3.5"), true);
	assert.equal(versionSatisfies(null, "^7.3.5"), true);
});

test("installed versions require strict x.y.z SemVer and preserve prerelease identifiers", () => {
	assert.deepEqual(parseVersion("7.3.5"), {
		major: 7,
		minor: 3,
		patch: 5,
		prerelease: [],
	});
	assert.deepEqual(parseVersion("v7.3.5-beta.1+build.7"), {
		major: 7,
		minor: 3,
		patch: 5,
		prerelease: ["beta", "1"],
	});
	assert.equal(parseVersion("7.3"), null);
	assert.equal(parseVersion("7"), null);
	assert.equal(parseVersion("7.03.5"), null);
	assert.equal(parseVersion("7.3.5-beta.01"), null);
	assert.deepEqual(parseVersion("7.3.5+build.1"), {
		major: 7,
		minor: 3,
		patch: 5,
		prerelease: [],
	});
	assert.equal(parseVersion("latest"), null);
	assert.equal(parseVersion("^7.3.5"), null);
	assert.equal(parseVersion(undefined), null);
	assert.equal(parseVersion(42), null);
});

test("the two 0.x caret rules hold", () => {
	// `^0.2.3` stops before `0.3.0`, and `^0.0.3` before `0.0.4`. Ignoring
	// either rule makes a 0.x range look compatible when it is not.
	assert.equal(versionSatisfies("0.2.9", "^0.2.3"), true);
	assert.equal(versionSatisfies("0.3.0", "^0.2.3"), false);
	assert.equal(versionSatisfies("0.0.3", "^0.0.3"), true);
	assert.equal(versionSatisfies("0.0.4", "^0.0.3"), false);
});

test("a prerelease version is rejected unless the range names a prerelease", () => {
	// Verified against npm's `semver` before writing these: it rejects every
	// prerelease against a range that names none, including one whose release
	// tuple is inside the range.
	assert.equal(versionSatisfies("7.4.0-beta.1", "^7.3.5"), false);
	assert.equal(versionSatisfies("7.3.5-beta.1", "^7.3.5"), false);
	assert.equal(versionSatisfies("7.3.6-beta.1", "^7.3.5"), false);
	assert.equal(versionSatisfies("8.0.0-beta.1", "^7.3.5"), false);
	assert.equal(versionSatisfies("0.35.9-beta.1", "^0.35.5"), false);
	// The equivalent release versions pass, so this is the prerelease rule
	// doing the work and not a mis-parse of the version.
	assert.equal(versionSatisfies("7.4.0", "^7.3.5"), true);
	assert.equal(versionSatisfies("7.3.6", "^7.3.5"), true);
	assert.equal(versionSatisfies("0.35.9", "^0.35.5"), true);
});

test("build metadata does not affect precedence", () => {
	// `+build` is semver *build metadata*, not a prerelease. Answering it like
	// one rejects a version that plainly satisfies the range, which is what the
	// `[-+]` regex this replaces did to `7.3.6+build.1` against `^7.3.5`.
	assert.equal(versionSatisfies("7.3.6+build.1", "^7.3.5"), true);
	assert.equal(versionSatisfies("7.4.0+build.1", "^7.3.5"), true);
	assert.equal(versionSatisfies("7.3.5+build.1", "^7.3.5"), true);
	// Still bounded by the range itself, so metadata cannot smuggle a version
	// across an exclusive upper bound.
	assert.equal(versionSatisfies("8.0.0+build.1", "^7.3.5"), false);
	assert.equal(
		versionSatisfies("7.3.6+build.1", ">=7.3.6-beta.1 <8.0.0"),
		true,
	);
	// A prerelease *before* the build metadata is still a prerelease.
	assert.equal(versionSatisfies("7.3.6-beta.1+build.1", "^7.3.5"), false);
});

test("a range that names a prerelease admits a matching one", () => {
	assert.equal(versionSatisfies("7.3.6-beta.1", ">=7.3.6-beta.1 <8.0.0"), true);
	assert.equal(versionSatisfies("7.3.6-beta.1", "^7.3.5"), false);
	// Build metadata is not a prerelease.
	assert.equal(
		versionSatisfies("7.3.6+build.1", ">=7.3.6-beta.1 <8.0.0"),
		true,
	);
});

test("an unparseable range fails open for a release version only", () => {
	// A range the engine cannot read produces no interval, so a *release*
	// version is accepted — refusing to reason about a manifest nobody wrote
	// would block a build the user cannot act on.
	for (const range of [undefined, "", "*", "latest", "workspace:^", 42]) {
		assert.equal(versionSatisfies("7.3.6", range), true, String(range));
	}
	// A prerelease is rejected regardless, matching npm's `semver`: it returns
	// false for `7.3.6-beta.1` against `*`, `""`, `x` and `>=0.0.0` alike.
	for (const range of ["*", "", "x", ">=0.0.0", 42]) {
		assert.equal(versionSatisfies("7.3.6-beta.1", range), false, String(range));
	}
});

test("an unreadable installed version is not evidence either way", () => {
	// `null` and non-strings mean "no version installed", which is a different
	// question from "an unusable one" and is answered by the absent case.
	assert.equal(versionSatisfies(null, "^7.3.5"), true);
	assert.equal(versionSatisfies(undefined, "^7.3.5"), true);
	assert.equal(versionSatisfies(42, "^7.3.5"), true);
});

test("caret and tilde ranges accept partial versions without becoming unbounded", () => {
	assert.equal(versionSatisfies("8.0.0", "^8"), true);
	assert.equal(versionSatisfies("8.9.9", "^8"), true);
	assert.equal(versionSatisfies("9.0.0", "^8"), false);
	assert.equal(versionSatisfies("7.3.9", "~7.3"), true);
	assert.equal(versionSatisfies("7.4.0", "~7.3"), false);
	assert.equal(rangesIntersect("^8", "^7.3.5"), false);
	assert.equal(rangesIntersect("~7.3", "^8.0.0"), false);
	assert.equal(rangesIntersect("^7", "^7.3.5"), true);
	assert.equal(rangesIntersect("^7.3", "^7.3.5"), true);
	assert.equal(rangesIntersect("7.x", "^7.3.5"), true);
	assert.equal(rangesIntersect("7.3.x", "^7.4.0"), false);
});

test("partial 0.x caret and tilde ranges keep npm's major/minor boundaries", () => {
	assert.equal(versionSatisfies("0.9.9", "^0"), true);
	assert.equal(versionSatisfies("1.0.0", "^0"), false);
	assert.equal(versionSatisfies("0.0.9", "^0.0"), true);
	assert.equal(versionSatisfies("0.1.0", "^0.0"), false);
	assert.equal(versionSatisfies("0.0.4", "^0.0.3"), false);
	assert.equal(versionSatisfies("0.3.9", "~0.3"), true);
	assert.equal(versionSatisfies("0.4.0", "~0.3"), false);
	assert.equal(versionSatisfies("9.4.0", "^x"), true);
	assert.equal(versionSatisfies("9.4.0", "~*"), true);
});

test("comparator sets preserve prerelease bounds and compare identifiers", () => {
	const prereleaseRange = ">=7.3.6-beta.1 <8.0.0";
	assert.equal(versionSatisfies("7.3.6-beta.0", prereleaseRange), false);
	assert.equal(versionSatisfies("7.3.6-beta.1", prereleaseRange), true);
	assert.equal(versionSatisfies("7.3.6-beta.2", prereleaseRange), true);
	assert.equal(versionSatisfies("7.3.6", prereleaseRange), true);
	assert.equal(versionSatisfies("7.4.0-beta.1", prereleaseRange), false);
	assert.equal(versionSatisfies("9.0.0", prereleaseRange), false);

	// Numeric identifiers compare numerically (beta.10 > beta.2), and a
	// prerelease range only admits prereleases on the tuple it explicitly names.
	assert.equal(
		versionSatisfies("7.3.6-beta.10", ">=7.3.6-beta.2 <7.3.6"),
		true,
	);
	assert.equal(
		versionSatisfies("7.3.6-beta.2", ">=7.3.6-beta.10 <7.3.6"),
		false,
	);
	assert.equal(versionSatisfies("7.3.6-beta.1", ">= 7.3.6-beta.1 < 8"), true);
});

test("range intersections account for prerelease-only intervals", () => {
	// The numeric bounds overlap with ^7.3.5, but that range does not admit
	// prereleases of 7.3.6 unless it explicitly names that release tuple.
	assert.equal(rangesIntersect(">=7.3.6-beta.1 <7.3.6", "^7.3.5"), false);
	assert.equal(
		rangesIntersect(">=7.3.6-beta.1 <7.3.6", ">=7.3.6-beta.2 <7.3.6"),
		true,
	);
	assert.equal(
		rangesIntersect(">7.3.6-beta.1 <7.3.6-beta.1.0", "^7.3.6"),
		false,
	);
	assert.equal(
		rangesIntersect(">7.3.6-beta.1 <7.3.6-beta.1.0.0", ">=7.3.6-beta.1.0"),
		true,
	);
});
