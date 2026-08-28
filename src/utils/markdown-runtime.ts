type MarkdownRuntimeDescriptor = {
	selector: string;
	initialize: (root: ParentNode) => Promise<void>;
};

const RUNTIME_BOUND_KEY = "markdownRuntimeBound";

function hasMatch(root: ParentNode, selector: string): boolean {
	if (root instanceof Element && root.matches(selector)) return true;
	return root.querySelector(selector) !== null;
}

const runtimeDescriptors: MarkdownRuntimeDescriptor[] = [
	{
		selector: ".expressive-code",
		initialize: async (root) => {
			const { initCodeBlockCollapsing } = await import("./code-collapse");
			initCodeBlockCollapsing(root);
		},
	},
	{
		selector: ".copy-btn",
		initialize: async () => {
			const { initCodeCopyButtons } = await import("./code-copy");
			initCodeCopyButtons();
		},
	},
	{
		selector: ".m3-code-tree",
		initialize: async () => {
			const { initCodeTrees } = await import("./code-tree");
			initCodeTrees();
		},
	},
	{
		selector: ".m3-option-group[data-option-group]",
		initialize: async (root) => {
			const { initOptionGroups } = await import("./option-groups");
			initOptionGroups(root);
		},
	},
	{
		selector: "abbr.m3-abbreviation[data-abbreviation-expansion]",
		initialize: async (root) => {
			const { initAbbreviations } = await import("./abbreviations");
			initAbbreviations(root);
		},
	},
	{
		selector: ".katex-display",
		initialize: async (root) => {
			const { initKaTeXScrollbars } = await import("./katex-scroll");
			initKaTeXScrollbars(root);
		},
	},
	{
		selector: ".markdown-mermaid[data-mermaid]",
		initialize: async () => {
			const { initMermaidDiagrams } = await import("./mermaid");
			await initMermaidDiagrams();
		},
	},
	{
		selector: "[data-github-card][data-github-repo]",
		initialize: async (root) => {
			const { initGithubCards } = await import("./github-cards");
			initGithubCards(root);
		},
	},
];

/**
 * Loads interaction code only for Markdown syntax present inside `root`.
 * Generated HTML remains fully readable when an optional enhancement fails.
 */
export async function initMarkdownRuntime(
	root: ParentNode = document,
): Promise<void> {
	if (typeof document === "undefined") return;

	await Promise.all(
		runtimeDescriptors.map(async (descriptor) => {
			if (!hasMatch(root, descriptor.selector)) return;
			try {
				await descriptor.initialize(root);
			} catch (error) {
				console.error(
					`Failed to initialize Markdown runtime for ${descriptor.selector}`,
					error,
				);
			}
		}),
	);
}

/**
 * Installs one page-level lifecycle for server-rendered and Swup-replaced
 * Markdown. Call this from the Markdown content entry point only.
 */
export function bindMarkdownRuntime(): void {
	if (typeof document === "undefined") return;
	if (document.documentElement.dataset[RUNTIME_BOUND_KEY] === "true") return;
	document.documentElement.dataset[RUNTIME_BOUND_KEY] = "true";

	void initMarkdownRuntime();
	document.addEventListener("swup:content:replace", () => {
		queueMicrotask(() => {
			const container = document.getElementById("swup-container");
			void initMarkdownRuntime(container ?? document);
		});
	});
}
