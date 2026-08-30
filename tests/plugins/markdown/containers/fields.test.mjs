import test from "node:test";
import assert from "node:assert/strict";
import { FieldComponent, FieldGroupComponent } from "../../../../src/plugins/markdown/containers/rehype-fields.mjs";

const text = (value) => ({ type: "text", value });
const paragraph = (value) => ({ type: "element", tagName: "p", properties: {}, children: [text(value)] });

test("renders field metadata and keeps description content", () => {
	const result = FieldComponent({ "has-directive-label": true, "label-optional": "Optional" }, [
		paragraph("tex"),
		paragraph("@type object"),
		paragraph("@optional"),
		paragraph("传递给 TeX 输入解析器的选项。"),
	]);
	assert.equal(result.tagName, "div");
	assert.deepEqual(result.properties.className, ["m3-field"]);
	assert.equal(result.children[0].children[0].children[0].value, "tex");
	assert.equal(result.children[0].children[1].children[0].value, "Optional");
	assert.equal(result.children[0].children[2].children[0].value, "object");
	assert.equal(result.children[1].children[0].children[0].value, "传递给 TeX 输入解析器的选项。");
});

test("renders field groups as a framed SSR container", () => {
	const result = FieldGroupComponent({}, []);
	assert.deepEqual(result.properties.className, ["m3-field-group", "not-prose"]);
	assert.equal(result.properties.dataFieldGroup, true);
});

test("unknown metadata lines remain readable body content", () => {
	const result = FieldComponent({ name: "value" }, [paragraph("@unknown keep this")]);
	assert.equal(result.children[1].children[0].children[0].value, "@unknown keep this");
});
