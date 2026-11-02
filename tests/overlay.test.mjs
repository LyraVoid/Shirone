import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import {
	normalisePath,
	resolvePaths,
} from "../src/integration/resolve/paths.ts";
import { buildOverrideRegistry } from "../src/integration/resolve/registry.ts";
import { shironesOverlay } from "../src/integration/vite/overlay.ts";

const write = (file, contents) => {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, contents);
};

const viteFsId = (path) => {
	const normalized = normalisePath(path);
	return `/@fs${normalized.startsWith("/") ? "" : "/"}${normalized}`;
};

test("package overlays resolve consistently in Vite client and SSR dev environments", async () => {
	const themeRoot = mkdtempSync(join(tmpdir(), "shirones-overlay-theme-"));
	const projectRoot = mkdtempSync(join(tmpdir(), "shirones-overlay-project-"));
	let server;

	try {
		write(join(themeRoot, "package.json"), '{ "name": "shirones" }\n');
		write(join(projectRoot, "package.json"), '{ "name": "consumer" }\n');
		const packageSrc = join(themeRoot, "src");
		write(join(packageSrc, "integration", "index.ts"), "export {};\n");
		write(
			join(packageSrc, "config", "siteConfig.ts"),
			'export const siteConfig = { lang: "en" };\n',
		);
		write(
			join(packageSrc, "i18n", "translation.ts"),
			'import { siteConfig } from "../config/siteConfig.ts";\n' +
				"export const lang = siteConfig.lang;\n",
		);
		write(join(packageSrc, "styles", "shared.styl"), ".shared\n  color: red\n");
		const packageComponent = join(
			packageSrc,
			"components",
			"atoms",
			"input",
			"TextField.svelte",
		);
		write(
			packageComponent,
			'<div class="package-field"></div>\n<style lang="stylus">\n.package-field\n  color: blue\n</style>\n',
		);
		const packageAnimeCard = join(
			packageSrc,
			"components",
			"molecules",
			"AnimeCard.astro",
		);
		write(packageAnimeCard, "<article>package card</article>\n");

		const userConfig = join(projectRoot, "shirones", "config", "siteConfig.ts");
		write(userConfig, 'export const siteConfig = { lang: "zh_CN" };\n');
		const userComponent = join(
			projectRoot,
			"src",
			"components",
			"atoms",
			"input",
			"TextField.svelte",
		);
		write(
			userComponent,
			'<div class="user-field"></div>\n' +
				'<style lang="stylus">\n@import "../../../styles/shared.styl"\n' +
				".user-field\n  color: green\n</style>\n",
		);
		const explicitUserComponent = join(
			projectRoot,
			"src",
			"overrides",
			"AnimeCard.astro",
		);
		write(explicitUserComponent, "<article>user card</article>\n");
		const importer = join(
			packageSrc,
			"components",
			"organisms",
			"FriendSection.svelte",
		);
		write(
			importer,
			'import TextField from "@components/atoms/input/TextField.svelte";\n' +
				'import { lang } from "@i18n/translation.ts";\n' +
				"export { TextField, lang };\n",
		);

		const paths = resolvePaths(
			{},
			pathToFileURL(`${projectRoot}/`),
			pathToFileURL(join(themeRoot, "src", "integration", "index.ts")).href,
		);
		const registryRef = buildOverrideRegistry(paths);
		const explicitComponentOverlay = shironesOverlay({
			paths,
			components: {
				"molecules/AnimeCard": "src/overrides/AnimeCard.astro",
			},
			registryRef,
		});
		const resolvedExplicitComponent =
			await explicitComponentOverlay.resolveId.call({}, packageAnimeCard);
		assert.equal(
			normalisePath(resolvedExplicitComponent ?? ""),
			normalisePath(explicitUserComponent),
			"uppercase explicit component key should match the package component on Windows",
		);

		const overlay = shironesOverlay({ paths, registryRef });
		server = await createServer({
			configFile: false,
			root: projectRoot,
			logLevel: "silent",
			plugins: [overlay],
			resolve: {
				alias: [
					{
						find: /^@components\//,
						replacement: `${join(paths.packageSrc, "components")}/`,
					},
					{
						find: /^@i18n\//,
						replacement: `${join(paths.packageSrc, "i18n")}/`,
					},
				],
			},
			server: { middlewareMode: true },
			appType: "custom",
		});

		for (const environmentName of ["client", "ssr"]) {
			const container = server.environments[environmentName].pluginContainer;
			const options = { ssr: environmentName === "ssr" };
			const resolvedComponent = await container.resolveId(
				"@components/atoms/input/TextField.svelte",
				importer,
				options,
			);
			assert.equal(
				normalisePath(resolvedComponent?.id ?? ""),
				normalisePath(userComponent),
				environmentName,
			);

			const resolvedTranslation = await container.resolveId(
				"@i18n/translation.ts",
				importer,
				options,
			);
			assert.equal(
				normalisePath(resolvedTranslation?.id ?? ""),
				normalisePath(join(packageSrc, "i18n", "translation.ts")),
				environmentName,
			);
			const resolvedConfig = await container.resolveId(
				"../config/siteConfig.ts",
				resolvedTranslation.id,
				options,
			);
			assert.equal(
				normalisePath(resolvedConfig?.id ?? ""),
				normalisePath(userConfig),
				environmentName,
			);

			const resolvedConfigFromFsId = await container.resolveId(
				"../config/siteConfig.ts",
				viteFsId(resolvedTranslation.id),
				options,
			);
			assert.equal(
				normalisePath(resolvedConfigFromFsId?.id ?? ""),
				normalisePath(userConfig),
				environmentName,
			);
		}

		// Vite can surface a file module as an `/@fs/` id. The prefix must be
		// removed before resolving the package-relative config import.
		const prefixedImporter = viteFsId(
			join(packageSrc, "i18n", "translation.ts"),
		);
		const prefixedResolution = await overlay.resolveId.call(
			{},
			"../config/siteConfig.ts",
			prefixedImporter,
		);
		assert.equal(
			normalisePath(prefixedResolution ?? ""),
			normalisePath(userConfig),
		);

		// The load hook must canonicalize that id too, so Stylus imports in a
		// user Svelte override still reach the package's source stylesheet.
		const loadedOverride = await overlay.load.call({}, viteFsId(userComponent));
		assert.ok(
			loadedOverride?.code.includes(
				normalisePath(join(packageSrc, "styles", "shared.styl")),
			),
		);
	} finally {
		if (server) await server.close();
		rmSync(themeRoot, { recursive: true, force: true });
		rmSync(projectRoot, { recursive: true, force: true });
	}
});
