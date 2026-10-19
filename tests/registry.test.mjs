import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";
import { resolvePaths } from "../src/integration/resolve/paths.ts";
import {
	buildOverrideRegistry,
	findLegacyIconImports,
	findOrphanUserFiles,
	overrideKey,
} from "../src/integration/resolve/registry.ts";

/** A package-mode layout: theme checkout + a user's site beside it. */
function makeWorld() {
	const themeRoot = mkdtempSync(join(tmpdir(), "shirones-pkg-"));
	const siteRoot = mkdtempSync(join(tmpdir(), "shirones-site-"));
	mkdirSync(join(themeRoot, "src", "integration"), { recursive: true });
	writeFileSync(join(themeRoot, "package.json"), '{ "name": "shirones" }\n');
	writeFileSync(join(siteRoot, "package.json"), '{ "name": "my-blog" }\n');
	const paths = resolvePaths(
		{},
		pathToFileURL(`${siteRoot}/`).href,
		pathToFileURL(join(themeRoot, "src", "integration", "index.ts")).href,
	);
	return { themeRoot, siteRoot, paths };
}

const write = (file, body = "export default {};\n") => {
	mkdirSync(join(file, ".."), { recursive: true });
	writeFileSync(file, body);
};

const worlds = [];
const world = () => {
	const w = makeWorld();
	worlds.push(w);
	return w;
};
after(() => {
	for (const { themeRoot, siteRoot } of worlds) {
		rmSync(themeRoot, { recursive: true, force: true });
		rmSync(siteRoot, { recursive: true, force: true });
	}
});

test("reports a config file that matches no module the package ships", () => {
	const { themeRoot, siteRoot, paths } = world();
	write(join(themeRoot, "src", "config", "site.ts"));
	// The theme renamed siteConfig → site; the user's old file is now inert.
	const stale = join(siteRoot, "shirones", "config", "siteConfig.ts");
	write(stale);
	write(join(siteRoot, "shirones", "config", "site.ts"));

	assert.deepEqual(findOrphanUserFiles(paths), [stale]);
});

test("accepts a config override written with a different extension", () => {
	const { themeRoot, siteRoot, paths } = world();
	write(join(themeRoot, "src", "config", "siteConfig.ts"));
	write(join(siteRoot, "shirones", "config", "siteConfig.mjs"));

	assert.deepEqual(findOrphanUserFiles(paths), []);
});

test("does not report data modules, even though dataDir sits inside configDir", () => {
	// The trap: the config target maps `shirones/config/*` onto `src/config/*`,
	// but data modules live in `src/data/*`. Scanning them under the config
	// target would flag every single one as an orphan.
	const { themeRoot, siteRoot, paths } = world();
	write(join(themeRoot, "src", "config", "siteConfig.ts"));
	write(join(themeRoot, "src", "data", "friends.ts"));
	write(join(siteRoot, "shirones", "config", "siteConfig.ts"));
	const dataFile = join(siteRoot, "shirones", "config", "data", "friends.ts");
	write(dataFile);

	assert.deepEqual(findOrphanUserFiles(paths), []);
});

test("reports a data module the package does not ship", () => {
	const { themeRoot, siteRoot, paths } = world();
	write(join(themeRoot, "src", "data", "friends.ts"));
	const stale = join(siteRoot, "shirones", "config", "data", "oldFriends.ts");
	write(stale);

	assert.deepEqual(findOrphanUserFiles(paths), [stale]);
});

test("never scans src/components or src/layouts, which hold the user's own files", () => {
	const { themeRoot, siteRoot, paths } = world();
	write(join(themeRoot, "src", "components", "atoms", "PostCard.astro"));
	// The user's own component, not an override attempt.
	write(join(siteRoot, "src", "components", "MyWidget.astro"));
	write(join(siteRoot, "src", "layouts", "MyLayout.astro"));

	assert.deepEqual(findOrphanUserFiles(paths), []);
});

test("reports nothing inside the theme's own repository", () => {
	// There the "user" directories *are* the package directories, so every file
	// trivially matches and the warning must stay silent.
	const themeRoot = mkdtempSync(join(tmpdir(), "shirones-repo-"));
	worlds.push({ themeRoot, siteRoot: themeRoot });
	mkdirSync(join(themeRoot, "src", "integration"), { recursive: true });
	writeFileSync(join(themeRoot, "package.json"), '{ "name": "shirones" }\n');
	write(join(themeRoot, "src", "config", "siteConfig.ts"));
	// The repository keeps data modules beside `src/config/`, not under it.
	write(join(themeRoot, "src", "data", "friends.ts"));

	const paths = resolvePaths(
		{},
		pathToFileURL(`${themeRoot}/`).href,
		pathToFileURL(join(themeRoot, "src", "integration", "index.ts")).href,
	);
	assert.equal(paths.isThemeRepo, true);
	assert.deepEqual(findOrphanUserFiles(paths), []);
});

test("barrel files stay owned by the package at any depth", () => {
	const { themeRoot, siteRoot, paths } = world();
	// A nested barrel: the anchored pattern this replaces (`/^index\./`) let a
	// user override it, breaking the named-export contract.
	write(join(themeRoot, "src", "components", "atoms", "index.ts"));
	write(join(themeRoot, "src", "components", "atoms", "PostCard.astro"));
	write(join(siteRoot, "src", "components", "atoms", "index.ts"));
	write(join(siteRoot, "src", "components", "atoms", "PostCard.astro"));

	const { overrides } = buildOverrideRegistry(paths);
	const barrelKey = overrideKey(
		join(themeRoot, "src", "components", "atoms", "index.ts"),
	);
	const cardKey = overrideKey(
		join(themeRoot, "src", "components", "atoms", "PostCard.astro"),
	);
	assert.equal(
		overrides.has(barrelKey),
		false,
		"nested barrel must not be overridable",
	);
	assert.equal(overrides.has(cardKey), true, "a normal component still is");
});

test("legacy icon migration scan ignores comments and string bodies", () => {
	const { themeRoot, siteRoot, paths } = world();
	const relativeIcon = join("atoms", "display", "Icon.svelte");
	write(join(themeRoot, "src", "components", relativeIcon));
	const userCopy = join(siteRoot, "src", "components", relativeIcon);
	write(
		userCopy,
		`<script lang="ts">
/**
 * This override was copied from the astro-icon era.
 * import Icon from "astro-icon";
 */
const note = "from 'astro-icon'";
const example = \`import Icon from "astro-icon";\`;
</script>
<!-- import Icon from "astro-icon"; -->
<pre>astro-icon is mentioned in this example. <code>import Icon from "astro-icon";</code></pre>
`,
	);

	const { overrides } = buildOverrideRegistry(paths);
	assert.deepEqual(findLegacyIconImports(overrides), []);
});

test("legacy icon migration scan reads Astro frontmatter but not markup", () => {
	const { themeRoot, siteRoot, paths } = world();
	const relativeCard = join("atoms", "PostCard.astro");
	write(join(themeRoot, "src", "components", relativeCard));
	const userCopy = join(siteRoot, "src", "components", relativeCard);
	write(
		userCopy,
		`---
import Icon from "astro-icon";
---
<!-- import Icon from "astro-icon"; -->
<pre><code>import Icon from "astro-icon";</code></pre>
<script>
const note = "astro-icon";
</script>
`,
	);
	const { overrides } = buildOverrideRegistry(paths);
	assert.deepEqual(findLegacyIconImports(overrides), [userCopy]);

	write(
		userCopy,
		`---
const note = "astro-icon";
---
<!-- import Icon from "astro-icon"; -->
<pre><code>import Icon from "astro-icon";</code></pre>
`,
	);
	assert.deepEqual(findLegacyIconImports(overrides), []);
});

test("legacy icon migration scan detects import, re-export, dynamic import, and require", () => {
	const { themeRoot, siteRoot, paths } = world();
	const relativeIcon = join("atoms", "display", "Icon.svelte");
	write(join(themeRoot, "src", "components", relativeIcon));
	const userCopy = join(siteRoot, "src", "components", relativeIcon);
	// Registry construction is a snapshot; create the override before building it.
	write(userCopy, "<script>\n</script>\n");
	const { overrides } = buildOverrideRegistry(paths);

	for (const source of [
		`import Icon from "astro-icon";`,
		`import "astro-icon/components";`,
		`export { Icon } from "astro-icon";`,
		`const Icon = await import("astro-icon");`,
		`const Icon = require("astro-icon/components");`,
	]) {
		write(userCopy, `<script>\n${source}\n</script>\n`);
		assert.deepEqual(findLegacyIconImports(overrides), [userCopy], source);
	}

	write(userCopy, `import Icon from "astro-iconic";\n`);
	assert.deepEqual(findLegacyIconImports(overrides), []);
});
