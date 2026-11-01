import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const EXCLUDED_STYLE_SPECS = new Set([
	"comments.spec.ts",
	"waline.spec.ts",
	"visual.spec.ts",
]);

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SITE_TESTS = join(ROOT, "tests", "site");

export function listStyleRegressionSpecs(siteTestsDir = SITE_TESTS) {
	return readdirSync(siteTestsDir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isFile() &&
				entry.name.endsWith(".spec.ts") &&
				!EXCLUDED_STYLE_SPECS.has(entry.name),
		)
		.map((entry) => entry.name)
		.sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const specs = listStyleRegressionSpecs();
	if (specs.length === 0) {
		throw new Error("No style regression specs were discovered");
	}
	process.stdout.write(
		`${specs.map((name) => `tests/site/${name}`).join("\n")}\n`,
	);
}
