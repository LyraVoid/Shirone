import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// UmamiRuntime's inline script cannot import modules (`is:inline`), so the
// tests load its source and run it against stubbed globals. That keeps the
// guard and the failure/retry behaviour under real regression control without
// standing up a dev server.

const runtimeSource = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "../src/components/system/UmamiRuntime.astro"),
	"utf8",
);
const scriptSource = runtimeSource.match(
	/<script is:inline>([\s\S]*?)<\/script>/,
)[1];

function runScript(env) {
	new Function("window", "document", scriptSource)(env.window, env.document);
	return env;
}

function makeEnv({ roots = [], oddmisc } = {}) {
	const windowListeners = [];
	const documentListeners = [];
	const window = {
		addEventListener: (type, handler) => windowListeners.push([type, handler]),
		setTimeout: (fn) => setTimeout(fn, 0),
	};
	if (oddmisc) window.oddmisc = oddmisc;
	const document = {
		readyState: "complete",
		addEventListener: (type, handler) =>
			documentListeners.push([type, handler]),
		querySelectorAll: () => roots,
	};
	const env = { window, document, windowListeners, documentListeners };
	return env;
}

function makeRoot() {
	return {
		dataset: {},
		isConnected: true,
		querySelector() {
			return { textContent: "", setAttribute() {} };
		},
	};
}

test("the runtime registers its global listeners once per document", () => {
	// The layout shell re-runs the inline script on every swup head
	// replacement; without the guard the window/document listeners stack up.
	const env = makeEnv();
	runScript(env);
	runScript(env);

	const types = env.windowListeners.map(([type]) => type);
	assert.deepEqual(types, ["oddmisc-ready"]);
	assert.deepEqual(
		env.documentListeners.map(([type]) => type),
		["swup:content:replace", "swup:page:view"],
	);
});

test("a failed stats request leaves the root retryable", async () => {
	let calls = 0;
	const oddmisc = {
		getSiteStats() {
			calls += 1;
			return Promise.reject(new Error("boom"));
		},
	};
	const root = makeRoot();
	const env = makeEnv({ roots: [root], oddmisc });
	runScript(env);

	// schedule() defers through setTimeout when rAF is unavailable.
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(calls, 1);
	// The root must not be marked loaded by the failure path: that flag
	// permanently excluded it from later loads.
	assert.ok(!root.dataset.umamiLoaded);

	// The next navigation fires the same listener again and must retry.
	const [, readyHandler] = env.windowListeners[0];
	readyHandler();
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(calls, 2);
});

test("a successful stats request marks the root loaded", async () => {
	const oddmisc = {
		getSiteStats() {
			return Promise.resolve({ pageviews: 42, visits: 7 });
		},
	};
	const root = makeRoot();
	const env = makeEnv({ roots: [root], oddmisc });
	runScript(env);

	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(root.dataset.umamiLoaded, "true");
});
