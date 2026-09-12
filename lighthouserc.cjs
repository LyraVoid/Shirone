const device = process.env.LH_DEVICE === "mobile" ? "mobile" : "desktop";

module.exports = {
	ci: {
		collect: {
			url: [
				"http://127.0.0.1:4321/",
				"http://127.0.0.1:4321/?post-list-mode=grid",
				"http://127.0.0.1:4321/archive/",
				"http://127.0.0.1:4321/moments/",
				"http://127.0.0.1:4321/about/",
				"http://127.0.0.1:4321/posts/guide/",
				"http://127.0.0.1:4321/posts/mdx-showcase/",
			],
			numberOfRuns: 3,
			settings: {
				...(device === "desktop" ? { preset: "desktop" } : {}),
				onlyCategories: [
					"performance",
					"accessibility",
					"best-practices",
					"seo",
				],
				throttlingMethod: "simulate",
				formFactor: device,
				pauseAfterLoadMs: 1000,
				networkQuietThresholdMs: 1000,
				maxWaitForFcp: 15000,
				puppeteerScript: "./scripts/lighthouse/prepare.cjs",
				chromeFlags:
					"--headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu",
			},
		},
		assert: {
			assertions: {
				"categories:accessibility": ["error", { minScore: 0.8 }],
				"categories:seo": ["error", { minScore: 0.8 }],
				"categories:best-practices": ["warn", { minScore: 0.7 }],
				"categories:performance": ["warn", { minScore: 0.5 }],
				"cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
			},
		},
		upload: {
			target: "filesystem",
			outputDir: "./artifacts/lighthouse",
		},
	},
};
