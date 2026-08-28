import type { Page, Request } from "@playwright/test";
import { expect, test } from "@playwright/test";

const PLAIN_POST_PATH = "/posts/admonitions/";
const RICH_POST_PATH = "/posts/mdx-showcase/";
const IMAGE_GRID_POST_PATH = "/posts/image-grid-demo/";
const CODE_POST_PATH = "/posts/expressive-code/";
const TREE_POST_PATH = "/posts/markdown-enhancements/";
const COLLAPSE_POST_PATH = "/posts/collapse-panels/";
const MARKER_POST_PATH = "/posts/marker-highlights/";
const CONTENT_ANNOTATIONS_POST_PATH = "/posts/content-annotations/";
const STEPS_POST_PATH = "/posts/steps/";
const ADMONITIONS_POST_PATH = "/posts/admonitions/";
const ADMONITION_FREE_POST_PATH = "/posts/expressive-code/";
const ABBREVIATIONS_POST_PATH = "/posts/markdown-abbreviations/";
const OPTION_GROUPS_POST_PATH = "/posts/option-groups/";
const IMAGE_PRESENTATIONS_POST_PATH = "/posts/markdown-extended/";
const IMAGE_PRESENTATIONS_FREE_POST_PATH = "/posts/expressive-code/";
const EXPRESSIVE_CODE_FREE_PATH = "/";
const GITHUB_CARD_PATH = "/about/";

const GITHUB_REPOSITORY_MOCK = {
	description: "A static blog template built with Astro.",
	language: "TypeScript",
	stargazers_count: 4860,
	forks_count: 1243,
	owner: {
		avatar_url:
			"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='12' fill='%236366f1'/></svg>",
	},
	license: { spdx_id: "MIT" },
};

const optionalRuntimeModules = {
	fancybox: /\/src\/utils\/fancybox-handler\.ts(?:\?|$)/,
	codeCollapse: /\/src\/utils\/code-collapse\.ts(?:\?|$)/,
	katex: /\/src\/utils\/katex-scroll\.ts(?:\?|$)/,
	mermaid: /\/src\/utils\/mermaid\.ts(?:\?|$)/,
	trees: /\/src\/styles\/markdown\/trees\.css(?:\?|$)/,
	collapsePanels: /\/src\/styles\/markdown\/collapse-panels\.css(?:\?|$)/,
	marker: /\/src\/styles\/markdown\/marker\.css(?:\?|$)/,
	contentAnnotations:
		/\/src\/styles\/markdown\/content-annotations\.css(?:\?|$)/,
	steps: /\/src\/styles\/markdown\/steps\.css(?:\?|$)/,
	admonitions: /\/src\/styles\/markdown\/admonitions\.css(?:\?|$)/,
	abbreviations: /\/src\/utils\/abbreviations\.ts(?:\?|$)/,
	optionGroups: /\/src\/utils\/option-groups\.ts(?:\?|$)/,
	codeTree: /\/src\/utils\/code-tree\.ts(?:\?|$)/,
};

function trackOptionalRuntimeRequests(page: Page): string[] {
	const requests: string[] = [];
	page.on("request", (request: Request) => {
		const url = request.url();
		if (
			Object.values(optionalRuntimeModules).some((pattern) => pattern.test(url))
		) {
			requests.push(url);
		}
	});
	return requests;
}

function hasRequestFor(requests: string[], modules: Array<RegExp>): boolean {
	return requests.some((url) => modules.some((pattern) => pattern.test(url)));
}

function trackGitHubApiRequests(page: Page): string[] {
	const requests: string[] = [];
	page.on("request", (request: Request) => {
		if (new URL(request.url()).hostname === "api.github.com")
			requests.push(request.url());
	});
	return requests;
}

test.describe("Markdown syntax runtime loading", () => {
	test("hydrates legacy GitHub cards only after their syntax is rendered", async ({
		page,
	}) => {
		const githubApiRequests = trackGitHubApiRequests(page);
		await page.route(
			"https://api.github.com/repos/LyraVoid/Shirone",
			async (route) => {
				await new Promise((resolve) => setTimeout(resolve, 250));
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(GITHUB_REPOSITORY_MOCK),
				});
			},
		);

		await page.goto(GITHUB_CARD_PATH, { waitUntil: "domcontentloaded" });
		const card = page.locator("#swup-container a.card-github");
		await expect(card).toHaveCount(1);
		await expect(card).toBeVisible();
		await expect(card).toHaveAttribute(
			"href",
			"https://github.com/LyraVoid/Shirone",
		);
		await expect(card).toHaveAttribute("rel", "noopener noreferrer");
		await expect(card).toHaveCSS("display", "block");
		await expect(card.locator("script")).toHaveCount(0);
		await expect(card).toHaveClass(/\bfetch-waiting\b/);
		await expect(card.locator("[data-github-description]")).not.toBeHidden();
		await expect(card.locator("[data-github-info]")).not.toBeHidden();
		await expect(card.locator("[data-github-avatar]")).not.toBeHidden();
		expect(
			await card.evaluate((element) => element.offsetHeight),
		).toBeGreaterThan(80);
		await expect(card).toHaveAttribute("data-github-state", "ready");
		await expect(card).not.toHaveClass(/\bfetch-waiting\b/);
		await expect(card.locator("[data-github-description]")).toHaveText(
			GITHUB_REPOSITORY_MOCK.description,
		);
		await expect(card.locator("[data-github-stars]")).toHaveText("4.9K");
		await expect(card.locator("[data-github-forks]")).toHaveText("1.2K");
		await expect(card.locator("[data-github-license]")).toHaveText("MIT");
		await expect(card.locator("[data-github-language]")).toHaveText(
			"TypeScript",
		);
		await expect(card.locator("[data-github-avatar]")).toHaveAttribute(
			"src",
			GITHUB_REPOSITORY_MOCK.owner.avatar_url,
		);
		expect(githubApiRequests).toEqual([
			"https://api.github.com/repos/LyraVoid/Shirone",
		]);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page.evaluate(
			(path) => window.swup?.navigate(path),
			GITHUB_CARD_PATH,
		);
		await page.waitForURL(`**${GITHUB_CARD_PATH}`);
		await expect(card).toHaveCount(1);
		await expect(card).toBeVisible();
		await expect(card.locator("script")).toHaveCount(0);
		await expect(card).toHaveAttribute("data-github-state", "ready");
		expect(githubApiRequests).toEqual([
			"https://api.github.com/repos/LyraVoid/Shirone",
			"https://api.github.com/repos/LyraVoid/Shirone",
		]);
	});

	test("keeps Mermaid styles page-scoped while deferring its runtime", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		expect(
			hasRequestFor(requests, [
				optionalRuntimeModules.katex,
				optionalRuntimeModules.mermaid,
			]),
		).toBe(false);

		await page.evaluate((path) => window.swup?.navigate(path), RICH_POST_PATH);
		await page.waitForURL(`**${RICH_POST_PATH}`);
		await expect(page.locator(".markdown-mermaid").first()).toHaveAttribute(
			"data-mermaid-state",
			"ready",
			{ timeout: 15_000 },
		);
		const mermaidSurface = page.locator(".markdown-mermaid__surface").first();
		await expect(
			page.locator('style[data-swup-optional="mermaid"]'),
		).toHaveCount(1);
		await expect(mermaidSurface).toHaveCSS("border-top-style", "solid");
		const formula = page.locator(".katex-display").first();
		await expect(page.locator('style[data-swup-optional="math"]')).toHaveCount(
			1,
		);
		await formula.scrollIntoViewIfNeeded();
		await expect(formula).toHaveAttribute(
			"data-scrollbar-initialized",
			"true",
			{ timeout: 15_000 },
		);

		expect(
			requests.some((url) => optionalRuntimeModules.mermaid.test(url)),
		).toBe(true);
		expect(requests.some((url) => /mermaid\.css(?:\?|$)/.test(url))).toBe(
			false,
		);
		expect(requests.some((url) => optionalRuntimeModules.katex.test(url))).toBe(
			true,
		);

		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="mermaid"]'),
		).toHaveCount(0);
	});

	test("defers Fancybox until a Swup target contains a lightbox", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		expect(hasRequestFor(requests, [optionalRuntimeModules.fancybox])).toBe(
			false,
		);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			IMAGE_GRID_POST_PATH,
		);
		await page.waitForURL(`**${IMAGE_GRID_POST_PATH}`);
		await expect(page.locator("html")).toHaveAttribute(
			"data-fancybox-ready",
			"true",
			{ timeout: 15_000 },
		);

		expect(
			requests.some((url) => optionalRuntimeModules.fancybox.test(url)),
		).toBe(true);
	});

	test("adds and removes image grid styles with the Swup page lifecycle", async ({
		page,
	}) => {
		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="image-grids"]'),
		).toHaveCount(0);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			IMAGE_GRID_POST_PATH,
		);
		await page.waitForURL(`**${IMAGE_GRID_POST_PATH}`);
		const imageGrid = page.locator(".image-grid").first();
		await expect(
			page.locator('style[data-swup-optional="image-grids"]'),
		).toHaveCount(1);
		await expect(imageGrid).toHaveCSS("display", "grid");

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			EXPRESSIVE_CODE_FREE_PATH,
		);
		await page.waitForURL(`**${EXPRESSIVE_CODE_FREE_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="image-grids"]'),
		).toHaveCount(0);
	});

	test("adds and removes image presentation styles with the Swup page lifecycle", async ({
		page,
	}) => {
		await page.goto(IMAGE_PRESENTATIONS_FREE_POST_PATH, {
			waitUntil: "networkidle",
		});
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="image-presentations"]'),
		).toHaveCount(0);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			IMAGE_PRESENTATIONS_POST_PATH,
		);
		await page.waitForURL(`**${IMAGE_PRESENTATIONS_POST_PATH}`);
		const imagePresentation = page.locator(".markdown-image-figure").first();
		await expect(
			page.locator('style[data-swup-optional="image-presentations"]'),
		).toHaveCount(1);
		await expect(imagePresentation).toHaveCSS("margin-top", "24px");

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			IMAGE_PRESENTATIONS_FREE_POST_PATH,
		);
		await page.waitForURL(`**${IMAGE_PRESENTATIONS_FREE_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="image-presentations"]'),
		).toHaveCount(0);
	});

	test("loads code-collapse only for Markdown content with code blocks", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto("/", { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		expect(
			requests.some((url) => optionalRuntimeModules.codeCollapse.test(url)),
		).toBe(false);

		await page.evaluate((path) => window.swup?.navigate(path), CODE_POST_PATH);
		await page.waitForURL(`**${CODE_POST_PATH}`);
		const toggle = page.locator(".collapse-toggle-btn").first();
		await expect(toggle).toBeVisible();
		await expect(toggle).toHaveAttribute("aria-label", "Expand code block");

		expect(
			requests.some((url) => optionalRuntimeModules.codeCollapse.test(url)),
		).toBe(true);
	});

	test("adds and removes Expressive Code styles with the Swup page lifecycle", async ({
		page,
	}) => {
		await page.goto(EXPRESSIVE_CODE_FREE_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="expressive-code"]'),
		).toHaveCount(0);

		await page.evaluate((path) => window.swup?.navigate(path), CODE_POST_PATH);
		await page.waitForURL(`**${CODE_POST_PATH}`);
		const codeFrame = page.locator(".expressive-code .frame").first();
		await expect(
			page.locator('style[data-swup-optional="expressive-code"]'),
		).toHaveCount(1);
		await expect(codeFrame).toHaveCSS("box-shadow", "none");

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			EXPRESSIVE_CODE_FREE_PATH,
		);
		await page.waitForURL(`**${EXPRESSIVE_CODE_FREE_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="expressive-code"]'),
		).toHaveCount(0);
	});

	test("adds and removes tree styles with the Swup page lifecycle", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(page.locator('style[data-swup-optional="trees"]')).toHaveCount(
			0,
		);
		expect(
			hasRequestFor(requests, [
				optionalRuntimeModules.trees,
				optionalRuntimeModules.codeTree,
			]),
		).toBe(false);

		await page.evaluate((path) => window.swup?.navigate(path), TREE_POST_PATH);
		await page.waitForURL(`**${TREE_POST_PATH}`);
		const fileTree = page.locator(".m3-file-tree").first();
		await expect(fileTree).toBeVisible();
		await expect(page.locator('style[data-swup-optional="trees"]')).toHaveCount(
			1,
		);
		await expect(fileTree).toHaveCSS("border-radius", "16px");

		const codeTreeButtons = page.locator(".m3-code-tree__file-btn");
		await codeTreeButtons.nth(1).click();
		await expect(codeTreeButtons.nth(1)).toHaveClass(
			/\bm3-code-tree__file-btn--active\b/,
		);
		await expect
			.poll(() =>
				hasRequestFor(requests, [
					optionalRuntimeModules.trees,
					optionalRuntimeModules.codeTree,
				]),
			)
			.toBe(true);

		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		await expect(page.locator('style[data-swup-optional="trees"]')).toHaveCount(
			0,
		);
	});

	test("adds and removes collapse panel styles with the Swup page lifecycle", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="collapse-panels"]'),
		).toHaveCount(0);
		expect(
			hasRequestFor(requests, [optionalRuntimeModules.collapsePanels]),
		).toBe(false);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			COLLAPSE_POST_PATH,
		);
		await page.waitForURL(`**${COLLAPSE_POST_PATH}`);
		const collapsePanels = page.locator(".m3-collapse");
		await expect(collapsePanels).toHaveCount(2);
		await expect(
			page.locator('style[data-swup-optional="collapse-panels"]'),
		).toHaveCount(1);
		await expect(collapsePanels.first()).toHaveCSS("border-radius", "16px");

		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="collapse-panels"]'),
		).toHaveCount(0);
	});

	test("adds and removes marker styles with the Swup page lifecycle", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="marker"]'),
		).toHaveCount(0);
		expect(hasRequestFor(requests, [optionalRuntimeModules.marker])).toBe(
			false,
		);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			MARKER_POST_PATH,
		);
		await page.waitForURL(`**${MARKER_POST_PATH}`);
		const marker = page.locator(".m3-marker").first();
		await expect(marker).toBeVisible();
		await expect(
			page.locator('style[data-swup-optional="marker"]'),
		).toHaveCount(1);
		await expect(marker).toHaveCSS("box-shadow", /inset/);

		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="marker"]'),
		).toHaveCount(0);
	});

	test("adds and removes content annotation styles with the Swup page lifecycle", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="content-annotations"]'),
		).toHaveCount(0);
		expect(
			hasRequestFor(requests, [optionalRuntimeModules.contentAnnotations]),
		).toBe(false);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			CONTENT_ANNOTATIONS_POST_PATH,
		);
		await page.waitForURL(`**${CONTENT_ANNOTATIONS_POST_PATH}`);
		const trigger = page.locator(".m3-content-note__trigger").first();
		await expect(trigger).toBeVisible();
		await expect(
			page.locator('style[data-swup-optional="content-annotations"]'),
		).toHaveCount(1);
		await expect(trigger).toHaveCSS("border-radius", "999px");

		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="content-annotations"]'),
		).toHaveCount(0);
	});

	test("adds and removes steps styles with the Swup page lifecycle", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(page.locator('style[data-swup-optional="steps"]')).toHaveCount(
			0,
		);
		expect(hasRequestFor(requests, [optionalRuntimeModules.steps])).toBe(false);

		await page.evaluate((path) => window.swup?.navigate(path), STEPS_POST_PATH);
		await page.waitForURL(`**${STEPS_POST_PATH}`);
		const steps = page.locator(".m3-steps").first();
		await expect(steps).toBeVisible();
		await expect(page.locator('style[data-swup-optional="steps"]')).toHaveCount(
			1,
		);
		await expect(steps).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		await expect(page.locator('style[data-swup-optional="steps"]')).toHaveCount(
			0,
		);
	});

	test("adds and removes admonition styles with the Swup page lifecycle", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(ADMONITION_FREE_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="admonitions"]'),
		).toHaveCount(0);
		expect(hasRequestFor(requests, [optionalRuntimeModules.admonitions])).toBe(
			false,
		);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			ADMONITIONS_POST_PATH,
		);
		await page.waitForURL(`**${ADMONITIONS_POST_PATH}`);
		const admonition = page.locator(".m3-admonition").first();
		await expect(admonition).toBeVisible();
		await expect(
			page.locator('style[data-swup-optional="admonitions"]'),
		).toHaveCount(1);
		await expect(admonition).toHaveCSS("border-inline-start-width", "4px");

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			ADMONITION_FREE_POST_PATH,
		);
		await page.waitForURL(`**${ADMONITION_FREE_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="admonitions"]'),
		).toHaveCount(0);
	});

	test("loads abbreviation assets only for rendered references", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(ADMONITION_FREE_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="abbreviations"]'),
		).toHaveCount(0);
		expect(
			hasRequestFor(requests, [optionalRuntimeModules.abbreviations]),
		).toBe(false);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			ABBREVIATIONS_POST_PATH,
		);
		await page.waitForURL(`**${ABBREVIATIONS_POST_PATH}`);
		const abbreviation = page.locator("abbr.m3-abbreviation").first();
		await expect(abbreviation).toBeVisible();
		await expect(
			page.locator('style[data-swup-optional="abbreviations"]'),
		).toHaveCount(1);
		await expect(abbreviation).toHaveCSS("text-decoration-style", "dotted");
		await expect
			.poll(() =>
				hasRequestFor(requests, [optionalRuntimeModules.abbreviations]),
			)
			.toBe(true);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			ADMONITION_FREE_POST_PATH,
		);
		await page.waitForURL(`**${ADMONITION_FREE_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="abbreviations"]'),
		).toHaveCount(0);
	});

	test("loads option group assets only for rendered groups", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(ADMONITION_FREE_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="option-groups"]'),
		).toHaveCount(0);
		expect(hasRequestFor(requests, [optionalRuntimeModules.optionGroups])).toBe(
			false,
		);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			OPTION_GROUPS_POST_PATH,
		);
		await page.waitForURL(`**${OPTION_GROUPS_POST_PATH}`);
		const optionGroup = page.locator(".m3-option-group").first();
		await expect(optionGroup).toHaveAttribute(
			"data-option-group-ready",
			"true",
		);
		await expect(
			page.locator('style[data-swup-optional="option-groups"]'),
		).toHaveCount(1);
		await expect(optionGroup).toHaveCSS("border-radius", "12px");
		await expect
			.poll(() =>
				hasRequestFor(requests, [optionalRuntimeModules.optionGroups]),
			)
			.toBe(true);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			ADMONITION_FREE_POST_PATH,
		);
		await page.waitForURL(`**${ADMONITION_FREE_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="option-groups"]'),
		).toHaveCount(0);
	});
});
