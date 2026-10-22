import { expect, test } from "@playwright/test";

const CODE_POST_PATH = "/posts/expressive-code/";

test("code blocks resolve the configured mono font family", async ({
	page,
}) => {
	await page.goto(CODE_POST_PATH, { waitUntil: "networkidle" });
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	await page.evaluate(async () => {
		await document.fonts.ready;
	});

	// Scope through the documented `.expressive-code` root rather than a class
	// from the renderer internals. `wrap` is applied by
	// `addClassName(preElement, "wrap")` in expressive-code's renderer, so it
	// is an implementation detail rather than a documented hook — and it does
	// drift: 0.44 emits `div.expressive-code > figure > pre.wrap`, while the
	// selector it replaced, `pre.expressive-code`, matches nothing.
	const styles = await page
		.locator(".expressive-code pre")
		.first()
		.evaluate((element) => {
			const root = getComputedStyle(document.documentElement);
			const block = getComputedStyle(element);
			return {
				fontMono: root.getPropertyValue("--font-mono").trim(),
				m3eMono: root.getPropertyValue("--m3e-font-mono-family").trim(),
				blockFontFamily: block.fontFamily,
			};
		});

	expect(styles.fontMono).not.toBe("");
	expect(styles.m3eMono).toContain("JetBrains Mono");
	expect(styles.m3eMono).not.toContain("var(");
	expect(styles.blockFontFamily).toContain("JetBrains Mono");
});
