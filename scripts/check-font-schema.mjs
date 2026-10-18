import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = join(ROOT, "src/types/fontConfig.ts");
const SCHEMA = join(ROOT, ".vscode/schemas/font.schema.json");

const source = await readFile(TYPES, "utf8");
const match = source.match(
	/export const FONT_ROLES = \[([\s\S]*?)\] as const;/,
);
if (!match) {
	throw new Error("FONT_ROLES is missing from src/types/fontConfig.ts");
}

const roles = [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
const schema = JSON.parse(await readFile(SCHEMA, "utf8"));
const roleSchema =
	schema?.properties?.fontFamilies?.items?.properties?.role?.anyOf ?? [];
const schemaRoles = [
	...new Set(roleSchema.flatMap((branch) => branch.enum ?? [])),
].sort();

const expectedRoles = [...roles].sort();
if (JSON.stringify(schemaRoles) !== JSON.stringify(expectedRoles)) {
	throw new Error(
		`font schema roles are out of sync: expected ${expectedRoles.join(", ")}, found ${schemaRoles.join(", ")}`,
	);
}

console.log(`font schema roles: ${roles.join(", ")}`);
