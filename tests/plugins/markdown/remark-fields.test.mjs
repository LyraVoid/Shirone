import assert from "node:assert/strict";
import test from "node:test";

import { remarkFields } from "../../../src/plugins/markdown/remark-fields.mjs";

/** Wraps remarkFields and returns what it feeds to the real parser. */
function rewrite(source) {
	const fake = { parser: (s) => s };
	remarkFields.call(fake);
	return fake.parser(source);
}

test("rewrites spaced field containers outside fences (F-4)", () => {
	assert.equal(rewrite("::: field mood"), ':::field{name="mood"}');
	assert.equal(rewrite("::: field-group"), ":::field-group");
	assert.equal(rewrite("::: field"), ":::field");
	assert.equal(rewrite(':::field{name="mood"}'), ':::field{name="mood"}');
});

test("keeps field syntax verbatim inside fenced code blocks (F-4)", () => {
	const source = [
		"before",
		"",
		"```md",
		"::: field x",
		"```",
		"",
		"::: field real",
	].join("\n");
	assert.equal(
		rewrite(source),
		[
			"before",
			"",
			"```md",
			"::: field x",
			"```",
			"",
			':::field{name="real"}',
		].join("\n"),
	);
});

test("keeps field syntax verbatim inside tilde fences (F-4)", () => {
	assert.equal(
		rewrite(["~~~", "::: field x", "~~~"].join("\n")),
		["~~~", "::: field x", "~~~"].join("\n"),
	);
});

test("keeps field syntax verbatim inside fence content (F-4)", () => {
	assert.equal(
		rewrite(["~~~ts", 'const s = "::: field x";', "~~~"].join("\n")),
		["~~~ts", 'const s = "::: field x";', "~~~"].join("\n"),
	);
});

test("treats a tab-indented fence as indented code (review: remark-fields.mjs:2)", () => {
	assert.equal(
		rewrite(["\t~~~", "", "::: field mood"].join("\n")),
		["\t~~~", "", ':::field{name="mood"}'].join("\n"),
	);
});

test("rejects a tab-indented fence closer (review: remark-fields.mjs:2)", () => {
	assert.equal(
		rewrite(["~~~", "x", "\t~~~", "::: field y"].join("\n")),
		["~~~", "x", "\t~~~", "::: field y"].join("\n"),
	);
});

test("keeps list-contained fenced examples and normalizes after the list (review: remark-fields.mjs:16)", () => {
	assert.equal(
		rewrite(["- ~~~", "  ::: field example", "  ~~~", "", "::: field real"].join("\n")),
		["- ~~~", "  ::: field example", "  ~~~", "", ':::field{name="real"}'].join("\n"),
	);
});

test("does not treat inline code as a backtick fence opener (review: remark-fields.mjs:20)", () => {
	assert.equal(
		rewrite(["```example```", "", "::: field mood"].join("\n")),
		["```example```", "", ':::field{name="mood"}'].join("\n"),
	);
});

test("keeps blockquote markers literal inside a top-level fence (review round 2)", () => {
	assert.equal(
		rewrite(["~~~", "> ~~~", "::: field example", "3:4", "~~~", "", "::: field real"].join("\n")),
		["~~~", "> ~~~", "::: field example", "3:4", "~~~", "", ':::field{name="real"}'].join("\n"),
	);
});

test("treats a list line with four extra spaces as indented content, not a fence (review round 2)", () => {
	assert.equal(
		rewrite(["-     ~~~", "::: field real"].join("\n")),
		["-     ~~~", ':::field{name="real"}'].join("\n"),
	);
});

test("closes an indented top-level fence with an unindented closer (review round 3)", () => {
	assert.equal(
		rewrite(["  ~~~", "code", "~~~", "", "::: field real"].join("\n")),
		["  ~~~", "code", "~~~", "", ':::field{name="real"}'].join("\n"),
	);
});
