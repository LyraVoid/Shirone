import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compile } from "svelte/compiler";
import { render } from "svelte/server";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const localeUtilsUrl = pathToFileURL(
	join(projectRoot, "src", "utils", "locale-utils.ts"),
).href;

async function loadServerComponent(relativePath, tempDir) {
	const sourcePath = join(projectRoot, relativePath);
	const source = readFileSync(sourcePath, "utf8")
		.replace('from "@utils/locale-utils";', `from "${localeUtilsUrl}";`)
		// Svelte's direct compiler does not preprocess the component's Stylus;
		// styles do not affect this SSR markup/accessibility contract.
		.replace(/<style lang="stylus">[\s\S]*?<\/style>/, "");
	const { js } = compile(source, { filename: sourcePath, generate: "server" });
	const outputPath = join(tempDir, `${relativePath.split("/").at(-1)}.mjs`);
	writeFileSync(outputPath, js.code);
	return (await import(pathToFileURL(outputPath).href)).default;
}

function getCalendarMarkup(html) {
	const monthTitle = html.match(
		/class="m3-date-picker__month">([^<]+)<\/div>/,
	)?.[1];
	const dayOneButton = [
		...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),
	]
		.map(([, attributes, content]) => ({
			attributes,
			text: content.replace(/<[^>]*>/g, "").trim(),
		}))
		.find(({ text }) => text === "1");
	const accessibleName =
		dayOneButton?.attributes.match(/aria-label="([^"]+)"/)?.[1];
	return { monthTitle, dayText: dayOneButton?.text, accessibleName };
}

test("DatePicker and DateRangePicker labels match the Gregorian Latin-numbered grid", async () => {
	const cacheRoot = join(projectRoot, "node_modules", ".cache");
	mkdirSync(cacheRoot, { recursive: true });
	const tempDir = mkdtempSync(join(cacheRoot, "shirone-date-picker-"));

	try {
		const DatePicker = await loadServerComponent(
			"src/components/atoms/input/DatePicker.svelte",
			tempDir,
		);
		const DateRangePicker = await loadServerComponent(
			"src/components/atoms/input/DateRangePicker.svelte",
			tempDir,
		);
		const date = new Date(2026, 0, 1);

		for (const locale of ["fa-IR", "ar-EG"]) {
			const expectedMonthTitle = new Intl.DateTimeFormat(locale, {
				year: "numeric",
				month: "long",
				calendar: "gregory",
				numberingSystem: "latn",
			}).format(date);
			const expectedDateLabel = new Intl.DateTimeFormat(locale, {
				dateStyle: "full",
				calendar: "gregory",
				numberingSystem: "latn",
			}).format(date);

			for (const [Component, props] of [
				[DatePicker, { value: "2026-01-01" }],
				[DateRangePicker, { start: "2026-01-01" }],
			]) {
				const html = render(Component, {
					props: { ...props, locale },
				}).body;
				const markup = getCalendarMarkup(html);

				assert.equal(markup.dayText, "1", `${locale} visible day`);
				assert.equal(markup.monthTitle, expectedMonthTitle, `${locale} month`);
				assert.equal(
					markup.accessibleName,
					expectedDateLabel,
					`${locale} label`,
				);
				assert.ok(markup.accessibleName.includes(markup.dayText));
				assert.ok(markup.accessibleName.includes("2026"));
				assert.doesNotMatch(
					`${markup.monthTitle} ${markup.accessibleName}`,
					/[\u0660-\u0669\u06f0-\u06f9]/,
				);
			}
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
