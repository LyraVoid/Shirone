import assert from "node:assert/strict";
import test from "node:test";
import {
	createBackendClient,
	resolveRuntimeMode,
} from "../src/utils/backend-client.mjs";

test("runtime mode defaults to static without requiring an API", () => {
	assert.deepEqual(resolveRuntimeMode({}), {
		mode: "static",
		apiBaseUrl: null,
	});
});

test("dynamic mode validates and normalizes its API URL", () => {
	assert.deepEqual(
		resolveRuntimeMode({
			SHIRONE_RUNTIME_MODE: "dynamic",
			SHIRONE_API_URL: "https://api.example.com/",
		}),
		{ mode: "dynamic", apiBaseUrl: "https://api.example.com" },
	);
	assert.throws(
		() => resolveRuntimeMode({ SHIRONE_RUNTIME_MODE: "dynamic" }),
		/SHIRONE_API_URL is required/,
	);
});

test("backend client encodes paths and reports non-success responses", async () => {
	const calls = [];
	const client = createBackendClient({
		baseUrl: "https://api.example.com",
		fetchImpl: async (url) => {
			calls.push(url);
			return { ok: true, json: async () => ({ slug: "hello world" }) };
		},
	});
	assert.deepEqual(await client.getContent("hello world"), {
		slug: "hello world",
	});
	assert.equal(
		calls[0],
		"https://api.example.com/api/v1/content/hello%20world",
	);

	const failing = createBackendClient({
		baseUrl: "https://api.example.com",
		fetchImpl: async () => ({ ok: false, status: 404 }),
	});
	await assert.rejects(
		() => failing.getContent("missing"),
		(error) => error.status === 404,
	);
});
