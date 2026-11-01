import { expect, test } from "@playwright/test";
import { siteMarkdownProcessor } from "../../src/utils/markdown-processor.mjs";

// Render issue #44 through the production processor, then exercise the actual
// article styles without adding regression-only content to published posts.
const source = String.raw`
$$
\boxed{5}
$$

$$
\boxed{d \equiv (sk - e) \cdot r^{-1} \pmod n}
$$

$$
\begin{aligned}
\neq \\
\notin \\
\vec{a} \\
A\vec{x} = \lambda \vec{x}
\end{aligned}
$$
`;

for (const navigation of ["direct", "swup"]) {
	test(`KaTeX boxes, negations and vector accents (${navigation})`, async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.route("https://api.github.com/**", (route) =>
			route.fulfill({ status: 503, body: "Unavailable" }),
		);
		if (navigation === "direct") {
			await page.goto("/posts/mdx-showcase/");
		} else {
			await page.goto("/");
			await page.waitForFunction(() => Boolean(window.swup));
			await page.evaluate(() => {
				document.documentElement.dataset.mathNavigation = "swup";
				window.swup?.navigate("/posts/mdx-showcase/");
			});
			await expect(page).toHaveURL(/\/posts\/mdx-showcase\//);
			await expect(page.locator("html")).toHaveAttribute(
				"data-math-navigation",
				"swup",
			);
		}
		await page.waitForFunction(
			() =>
				getComputedStyle(document.documentElement)
					.getPropertyValue("--mc-primary")
					.trim() &&
				[...document.querySelectorAll<HTMLElement>(".onload-animation")].every(
					(element) =>
						element.offsetParent === null ||
						getComputedStyle(element).opacity === "1",
				),
		);
		const renderer = await siteMarkdownProcessor.createRenderer({});
		const result = await renderer.render(source);
		expect(result.code).not.toContain("katex-error");
		await page
			.locator(".custom-md")
			.first()
			.evaluate((root, html) => {
				const fixture = document.createElement("div");
				fixture.dataset.mathFixture = "true";
				fixture.innerHTML = html;
				root.prepend(fixture);
			}, result.code);
		await page.evaluate(() => document.fonts.ready);
		const fixture = page.locator("[data-math-fixture]");
		await expect(fixture.locator(".katex-display")).toHaveCount(3);
		await expect(fixture.locator(".fbox")).toHaveCount(2);
		for (const box of await fixture.locator(".fbox").all()) {
			await expect(box).toHaveCSS("box-sizing", "border-box");
			const bounds = await box.boundingBox();
			expect(bounds?.width).toBeGreaterThan(10);
			expect(bounds?.height).toBeGreaterThan(10);
		}
		// KaTeX 0.18 prefixes these generated box classes with `katex-`.
		await expect(fixture.locator(".katex-vbox")).toHaveCount(2);
		for (const negation of await fixture.locator(".katex-vbox").all()) {
			await expect(negation).toHaveCSS("display", "inline-flex");
			await expect(negation.locator(".katex-thinbox")).toHaveCSS(
				"width",
				"0px",
			);
		}
		await expect(fixture.locator(".katex-overlay")).toHaveCount(3);
		for (const arrow of await fixture.locator(".katex-overlay").all()) {
			await expect(arrow).toHaveCSS("display", "block");
		}
	});
}
