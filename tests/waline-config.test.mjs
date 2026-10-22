import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
	commentConfig,
	resolveCommentOptions,
} from "../src/config/commentConfig.ts";
import { customWalineOptions } from "./fixtures/waline-options.ts";

const valid = {
	...commentConfig,
	enable: true,
	provider: "waline",
	waline: {
		...commentConfig.waline,
		serverURL: "https://comments.example.com",
	},
};

test("Waline remains opt-in and tolerates legacy configs without its block", () => {
	assert.equal(resolveCommentOptions({ ...valid, enable: false }), null);
	assert.equal(resolveCommentOptions({ ...valid, provider: "none" }), null);
	const { waline: _, ...legacy } = valid;
	assert.equal(resolveCommentOptions(legacy), null);
	assert.equal(resolveCommentOptions({ ...legacy, provider: "giscus" }), null);
});

test("Waline requires a service URL and both client resources", () => {
	for (const key of ["serverURL", "scriptUrl", "styleUrl"]) {
		for (const value of ["", "  ", undefined]) {
			assert.equal(
				resolveCommentOptions({
					...valid,
					waline: { ...valid.waline, [key]: value },
				}),
				null,
				`${key} must be present`,
			);
		}
	}
});

test("Waline rejects malformed or non-HTTP service URLs", () => {
	for (const serverURL of [
		"invalid",
		"/api/comments",
		"javascript:alert(1)",
		"file:///tmp/comments",
	]) {
		assert.equal(
			resolveCommentOptions({
				...valid,
				waline: { ...valid.waline, serverURL },
			}),
			null,
		);
	}
});

test("Waline rejects callbacks that cannot reach the browser", () => {
	for (const key of ["imageUploader", "highlighter", "texRenderer"]) {
		assert.throws(
			() =>
				resolveCommentOptions({
					...valid,
					waline: { ...valid.waline, [key]: () => "" },
				}),
			{ name: "TypeError", message: new RegExp(`waline\\.${key} `) },
		);
		for (const value of [true, false, undefined]) {
			assert.equal(
				resolveCommentOptions({
					...valid,
					waline: { ...valid.waline, [key]: value },
				}).waline[key],
				value,
			);
		}
	}
});

test("Waline normalizes required fields without mutating configuration", () => {
	const config = {
		...valid,
		lazy: false,
		waline: {
			...valid.waline,
			serverURL: " https://comments.example.com/api/ ",
			scriptUrl: " /comments/waline.umd.js ",
			styleUrl: " /comments/waline.css ",
			lang: " ",
			...customWalineOptions,
			requiredMeta: ["nick", "mail"],
			login: "force",
			pageSize: 20,
		},
	};
	const before = structuredClone(config);
	const options = resolveCommentOptions(config);
	assert.equal(options.provider, "waline");
	assert.equal(options.lazy, false);
	assert.deepEqual(options.waline, {
		...config.waline,
		serverURL: "https://comments.example.com/api/",
		scriptUrl: "/comments/waline.umd.js",
		styleUrl: "/comments/waline.css",
		lang: "auto",
	});
	assert.deepEqual(config, before);
});

test("Adding Waline preserves the existing Twikoo and Giscus providers", () => {
	const twikoo = resolveCommentOptions({
		...valid,
		provider: "twikoo",
		twikoo: { ...commentConfig.twikoo, envId: " https://twikoo.example.com " },
	});
	assert.equal(twikoo.provider, "twikoo");
	assert.equal(twikoo.twikoo.envId, "https://twikoo.example.com");
	const giscus = resolveCommentOptions({
		...valid,
		provider: "giscus",
		giscus: {
			...commentConfig.giscus,
			repo: "owner/repo",
			repoId: "repo-id",
			categoryId: "category-id",
		},
	});
	assert.equal(giscus.provider, "giscus");
	assert.equal(giscus.giscus.repo, "owner/repo");
});

test("Waline types accept locale overrides, mixed emoji sources and switches without callbacks", () => {
	const fixture = fileURLToPath(
		new URL("./fixtures/waline-options.ts", import.meta.url),
	);
	const program = ts.createProgram([fixture], {
		noEmit: true,
		strict: true,
		skipLibCheck: true,
		allowImportingTsExtensions: true,
		module: ts.ModuleKind.NodeNext,
		target: ts.ScriptTarget.ES2022,
		types: [],
	});
	const diagnostics = ts
		.getPreEmitDiagnostics(program)
		.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
		);
	assert.deepEqual(diagnostics, []);
});
