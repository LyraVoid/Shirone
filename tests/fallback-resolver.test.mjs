import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import {
	isGenuineResolution,
	shironesFallbackResolver,
} from "../src/integration/fallback-resolver.ts";

// A throwaway "theme package" whose own node_modules holds the dependency the
// user's project cannot see (pnpm strict layout).
const packageRoot = mkdtempSync(join(tmpdir(), "shirones-fallback-"));
const realDep = join(
	packageRoot,
	"node_modules",
	"@swup",
	"astro",
	"dist",
	"serialise.js",
);
mkdirSync(dirname(realDep), { recursive: true });
writeFileSync(realDep, "export const deserialise = () => {};\n");
writeFileSync(join(packageRoot, "package.json"), "{}\n");
const anchor = join(packageRoot, "package.json");

after(() => {
	rmSync(packageRoot, { recursive: true, force: true });
});

/** Build a plugin context whose `this.resolve` records and dispatches. */
function makeContext(routes) {
	const calls = [];
	const ctx = {
		resolve: async (source, importer, options) => {
			calls.push({ source, importer, options });
			const route = routes.find((candidate) => candidate.importer === importer);
			return route ? route.result : null;
		},
		info: () => {},
	};
	return { ctx, calls };
}

const plugin = () => shironesFallbackResolver({ packageRoot });
const resolveId = (ctx, source, importer, options = { custom: {} }) =>
	plugin().resolveId.call(ctx, source, importer, options);

test("rescues a bare specifier when direct resolution is a dev pseudo-path", async () => {
	// Vite 8 dev answers the direct probe with a root-relative path that does
	// not exist on disk instead of null (regression: the injected swup script).
	const pseudo = { id: "/user/project/@swup/astro/serialise" };
	const { ctx, calls } = makeContext([
		{ importer: "astro:scripts/page.js", result: pseudo },
		{ importer: anchor, result: { id: realDep } },
	]);
	const resolved = await resolveId(
		ctx,
		"@swup/astro/serialise",
		"astro:scripts/page.js",
	);
	assert.equal(resolved.id, realDep);
	assert.equal(
		calls.length,
		2,
		"expected the direct probe and the anchor retry",
	);
	assert.equal(calls[1].importer, anchor);
});

test("stays out of the way when the project resolves the import itself", async () => {
	const { ctx, calls } = makeContext([
		{ importer: "astro:scripts/page.js", result: { id: realDep } },
		{ importer: anchor, result: { id: realDep } },
	]);
	const resolved = await resolveId(
		ctx,
		"@swup/astro/serialise",
		"astro:scripts/page.js",
	);
	assert.equal(resolved, null);
	assert.equal(calls.length, 1, "must not run the anchor retry needlessly");
});

test("falls back when direct resolution fails outright (production build)", async () => {
	const { ctx } = makeContext([{ importer: anchor, result: { id: realDep } }]);
	const resolved = await resolveId(
		ctx,
		"@swup/astro/serialise",
		"virtual:astro:renderers",
	);
	assert.equal(resolved.id, realDep);
});

test("gives up when neither the project nor the package can resolve", async () => {
	const { ctx } = makeContext([]);
	const resolved = await resolveId(
		ctx,
		"@swup/astro/serialise",
		"astro:scripts/page.js",
	);
	assert.equal(resolved, null);
});

test("ignores relative, virtual, and scheme specifiers", async () => {
	const { ctx, calls } = makeContext([]);
	for (const source of [
		"./local.js",
		"../up.js",
		"\0virtual:thing",
		"astro:scripts/page.js",
		"node:fs",
	]) {
		assert.equal(await resolveId(ctx, source, "astro:scripts/page.js"), null);
	}
	assert.equal(calls.length, 0);
});

test("does not re-enter through its own custom flag", async () => {
	const { ctx, calls } = makeContext([]);
	const resolved = await resolveId(
		ctx,
		"@swup/astro/serialise",
		"astro:scripts/page.js",
		{
			custom: { "shirones:fallback": true },
		},
	);
	assert.equal(resolved, null);
	assert.equal(calls.length, 0);
});

test("isGenuineResolution rejects dev-server stand-ins", () => {
	assert.equal(isGenuineResolution(null), false);
	assert.equal(isGenuineResolution(undefined), false);
	// Root-relative pseudo path for a file that does not exist:
	assert.equal(
		isGenuineResolution({ id: "/user/project/@swup/astro/serialise" }),
		false,
	);
	// The alias sentinel vite:import-analysis treats as failure:
	assert.equal(
		isGenuineResolution({
			id: "/whatever",
			meta: { "vite:alias": { noResolved: true } },
		}),
		false,
	);
});

test("isGenuineResolution accepts real resolutions", () => {
	assert.equal(isGenuineResolution({ id: realDep }), true);
	// Query/hash suffixes (dev version hashes) are stripped before the check:
	assert.equal(isGenuineResolution({ id: `${realDep}?v=006ef924` }), true);
	// Virtual module ids are genuine by definition:
	assert.equal(isGenuineResolution({ id: "\0astro:scripts/page.js" }), true);
	// Externals never point at the filesystem:
	assert.equal(isGenuineResolution({ id: "swup", external: true }), true);
});
