import { expect, test } from "@playwright/test";

const CODE_POST_PATH = "/posts/expressive-code/";

test("code blocks resolve the configured mono font family", async ({ page }) => {
	await page.goto(CODE_POST_PATH, { waitUntil: "networkidle" });
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	await page.evaluate(async () => {
		await document.fonts.ready;
	});

	const styles = await page.locator("pre.expressive-code").first().evaluate((element) => {
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
