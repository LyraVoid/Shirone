import { expect, test } from "@playwright/test";

/**
 * The site-default scheme ships as static CSS (Layout.astro), so a visitor on
 * the default hue/style/spec must never get inline `--mc-*` overrides — not even
 * transiently during init() (e.g. a theme pass that runs before `--hue` is set).
 */
for (const theme of ["light", "dark"]) {
	test(`default ${theme} load writes no inline --mc-* overrides`, async ({
		page,
	}) => {
		await page.addInitScript((theme) => {
			localStorage.setItem("theme", theme);
			const seen: string[] = [];
			(window as unknown as { __rootStyles: string[] }).__rootStyles = seen;
			new MutationObserver((records) => {
				for (const record of records) seen.push(record.oldValue ?? "");
			}).observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["style"],
				attributeOldValue: true,
			});
		}, theme);
		await page.goto("/", { waitUntil: "load" });

		const result = await page.evaluate(() => {
			const root = document.documentElement;
			return {
				dark: root.classList.contains("dark"),
				primary: getComputedStyle(root).getPropertyValue("--mc-primary").trim(),
				styles: [
					...(window as unknown as { __rootStyles: string[] }).__rootStyles,
					root.getAttribute("style") ?? "",
				],
			};
		});
		expect(result.dark).toBe(theme === "dark");
		expect(result.primary).toMatch(/^#/);
		expect(result.styles.filter((s) => s.includes("--mc-"))).toEqual([]);
	});
}
