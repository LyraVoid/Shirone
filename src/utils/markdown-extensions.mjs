/**
 * Markdown plugins contributed by a project's plugin scripts
 * (`shirones/scripts/`, see `docs/plugin-scripts.md`).
 *
 * The scripts run once, in the Astro process, when the integration starts. The
 * Markdown chain is built in two places: by the integration, for Astro's own
 * content rendering, and by `markdown-processor.mjs` as it is imported into the
 * site's server code, for bodies rendered offline (moments). Both must build
 * the same chain, so the integration publishes what the scripts registered
 * here and both read it back.
 *
 * A registered symbol on `globalThis` rather than module state: the integration
 * and the site load separate copies of this file (one bundled by esbuild, one
 * by Vite), and only the global is shared between them.
 *
 * Plain `.mjs` with no imports, so `node --test` can load the processor.
 */

const REGISTRY = Symbol.for("shirones.markdown-extensions");

/**
 * @typedef {object} MarkdownExtensions
 * @property {string} digest Changes whenever a plugin script changes. Empty
 *   when no script extends Markdown.
 * @property {{ plugin: unknown, at: "before-directive" | "after-directive" }[]} remark
 * @property {{ plugin: unknown, at: "before-components" | "end" }[]} rehype
 * @property {Record<string, Function>} directives Directive name to renderer.
 */

/** @type {MarkdownExtensions} */
export const NO_MARKDOWN_EXTENSIONS = Object.freeze({
	digest: "",
	remark: [],
	rehype: [],
	directives: {},
});

/**
 * Make `extensions` visible to every copy of this module in the process.
 *
 * @param {MarkdownExtensions} extensions
 */
export function publishMarkdownExtensions(extensions) {
	globalThis[REGISTRY] = extensions;
}

/** @returns {MarkdownExtensions} */
export function readMarkdownExtensions() {
	return globalThis[REGISTRY] ?? NO_MARKDOWN_EXTENSIONS;
}

/** @param {MarkdownExtensions} extensions */
export function hasMarkdownExtensions(extensions) {
	return (
		extensions.remark.length > 0 ||
		extensions.rehype.length > 0 ||
		Object.keys(extensions.directives).length > 0
	);
}

/**
 * Fail when this runtime does not see the extensions the integration loaded.
 *
 * `expected` is the digest the integration compiled into the site's code. The
 * two differ only if the site's server code runs somewhere `globalThis` is not
 * shared with the Astro process. Bodies rendered there would quietly miss every
 * script plugin while posts have them; stop instead.
 *
 * @param {string | undefined} expected
 */
export function assertMarkdownExtensionsVisible(expected) {
	const visible = readMarkdownExtensions().digest;
	if ((expected ?? "") === visible) return;
	throw new Error(
		"[shirones] the Markdown plugins registered by plugin scripts are not visible to the site's server code " +
			`(expected "${expected ?? ""}", found "${visible}"). ` +
			"Plugin scripts need the site to be rendered in the Astro process.",
	);
}

/**
 * Carries the scripts' digest into the Astro config and does nothing else.
 *
 * Astro caches rendered Markdown and drops the cache when its config changes,
 * but it compares the config as JSON, where a function is nothing: editing a
 * plugin leaves the config "unchanged" and every cached post keeps its old
 * HTML. Plugin options do appear in that JSON, so the digest goes there.
 */
export function remarkPluginScriptsDigest() {
	return () => {};
}

/** A plugin entry is the plugin itself or a `[plugin, ...options]` tuple. */
function pluginOf(entry) {
	return Array.isArray(entry) ? entry[0] : entry;
}

function indexOfPlugin(chain, plugin, label) {
	const index = chain.findIndex((entry) => pluginOf(entry) === plugin);
	if (index === -1) {
		throw new Error(
			`[shirones] the Markdown chain no longer contains ${label}, which plugin scripts are anchored to`,
		);
	}
	return index;
}

/**
 * Insert the scripts' plugins into the theme's chains.
 *
 * The theme's order is a contract (`docs/markdown-plugin-order.md`), so a
 * script cannot pick an arbitrary position: it names one of four anchors, and
 * within an anchor plugins keep their registration order.
 *
 * Returns the base arrays themselves when nothing is registered, so a project
 * without plugin scripts gets exactly the chain it had before.
 *
 * @param {object} base
 * @param {unknown[]} base.remarkPlugins
 * @param {unknown[]} base.rehypePlugins
 * @param {Function} base.directive The remark plugin that parses directives.
 * @param {Function} base.probes The remark plugin that records page syntaxes.
 * @param {Function} base.components The rehype plugin that renders directives.
 * @param {MarkdownExtensions} extensions
 * @returns {{ remarkPlugins: unknown[], rehypePlugins: unknown[] }}
 */
export function extendMarkdownPlugins(base, extensions) {
	if (!hasMarkdownExtensions(extensions)) {
		return {
			remarkPlugins: base.remarkPlugins,
			rehypePlugins: base.rehypePlugins,
		};
	}

	const at = (list, anchor) =>
		list.filter((entry) => entry.at === anchor).map((entry) => entry.plugin);

	const remarkPlugins = [...base.remarkPlugins];
	// Later anchor first, so the earlier index is still valid afterwards.
	remarkPlugins.splice(
		indexOfPlugin(remarkPlugins, base.probes, "the feature probes"),
		0,
		...at(extensions.remark, "after-directive"),
	);
	remarkPlugins.splice(
		indexOfPlugin(remarkPlugins, base.directive, "remark-directive"),
		0,
		...at(extensions.remark, "before-directive"),
	);
	remarkPlugins.push([
		remarkPluginScriptsDigest,
		{ digest: extensions.digest },
	]);

	const rehypePlugins = [...base.rehypePlugins];
	const componentsIndex = indexOfPlugin(
		rehypePlugins,
		base.components,
		"rehype-components",
	);
	const [, componentOptions] = rehypePlugins[componentsIndex];
	rehypePlugins[componentsIndex] = [
		base.components,
		{
			...componentOptions,
			components: {
				...componentOptions.components,
				...extensions.directives,
			},
		},
	];
	rehypePlugins.splice(
		componentsIndex,
		0,
		...at(extensions.rehype, "before-components"),
	);
	rehypePlugins.push(...at(extensions.rehype, "end"));

	return { remarkPlugins, rehypePlugins };
}
