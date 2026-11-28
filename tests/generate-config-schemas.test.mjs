import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse } from "jsonc-parser";
import { mergeYamlSchemas } from "../scripts/content/generate-config-schemas.mjs";

const MAPPING = {
	"./.vscode/schemas/site.schema.json": ["config/site.yaml"],
};

describe("mergeYamlSchemas", () => {
	it("keeps comments and unrelated settings byte-for-byte", () => {
		const source = `{
  // Editor tuning, hand-written.
  "editor.tabSize": 4,
  "yaml.schemas": {
    "./.vscode/schemas/legacy.schema.json": ["config/legacy.yaml"]
  }
}
`;
		const { error, text } = mergeYamlSchemas(source, MAPPING);

		assert.equal(error, undefined);
		assert.ok(text.includes("// Editor tuning, hand-written."));
		assert.ok(text.includes('"editor.tabSize": 4'));
		assert.deepEqual(parse(text)["yaml.schemas"], {
			"./.vscode/schemas/legacy.schema.json": ["config/legacy.yaml"],
			...MAPPING,
		});
	});

	it("reports malformed JSONC instead of resetting the document", () => {
		const source = '{ "editor.tabSize": 4, ';
		const { error, text } = mergeYamlSchemas(source, MAPPING);

		assert.match(error, /at offset \d+/);
		assert.equal(text, source);
	});

	it("refuses a top-level value that is not an object", () => {
		const { error, text } = mergeYamlSchemas("[]\n", MAPPING);

		assert.equal(error, "the document is not a JSON object");
		assert.equal(text, "[]\n");
	});

	it("refuses a yaml.schemas value that is not an object", () => {
		const source = '{ "yaml.schemas": [] }\n';
		const { error, text } = mergeYamlSchemas(source, MAPPING);

		assert.equal(error, "yaml.schemas is not an object");
		assert.equal(text, source);
	});

	it("creates the key in an empty document", () => {
		const { error, text } = mergeYamlSchemas("{}\n", MAPPING);

		assert.equal(error, undefined);
		assert.deepEqual(parse(text)["yaml.schemas"], MAPPING);
	});

	it("refuses an explicit null yaml.schemas", () => {
		const source = '{ "yaml.schemas": null }\n';
		const { error, text } = mergeYamlSchemas(source, MAPPING);

		assert.equal(error, "yaml.schemas is not an object");
		assert.equal(text, source);
	});

	it("keeps comments inside yaml.schemas and does not rewrite configured keys", () => {
		const source = `{
  "yaml.schemas": {
    // Legacy mapping, hand-written.
    "./.vscode/schemas/legacy.schema.json": ["config/legacy.yaml"]
  }
}
`;
		const first = mergeYamlSchemas(source, MAPPING);

		assert.equal(first.error, undefined);
		assert.ok(first.text.includes("// Legacy mapping, hand-written."));
		assert.deepEqual(parse(first.text)["yaml.schemas"], {
			"./.vscode/schemas/legacy.schema.json": ["config/legacy.yaml"],
			...MAPPING,
		});
		assert.equal(mergeYamlSchemas(first.text, MAPPING).text, first.text);
	});

	it("refuses duplicate yaml.schemas keys instead of silently diverging", () => {
		const source = '{"yaml.schemas":{"a.json":["p"],"a.json":["q"]}}\n';
		const { error, text } = mergeYamlSchemas(source, { "a.json": ["z"] });

		assert.match(error, /duplicate keys/);
		assert.equal(text, source);
	});

	it("keeps unrelated settings of a single-line document", () => {
		const source = '{"editor.tabSize":4,"yaml.schemas":{}}\n';
		const { error, text } = mergeYamlSchemas(source, MAPPING);

		assert.equal(error, undefined);
		assert.deepEqual(parse(text), {
			"editor.tabSize": 4,
			"yaml.schemas": MAPPING,
		});
	});
});
