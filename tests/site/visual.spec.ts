import { expect, test } from "@playwright/test";

/**
 * 真实站点页面视觉回归（黄金截图）。
 * 锁定首页 / 归档 / 关于 / 文章页在 light / dark 双模式下的整体布局、圆角、阴影，
 * 以及首页 grid 布局模式（访客偏好注入）。
 * 说明：
 * - 用 prefers-reduced-motion 折叠 onload/主题过渡动画，保证截图确定性
 *   （动画最终态 opacity 1 / transform none，与正常渲染视觉一致）。
 * - GitHub 卡片 API mock 为固定响应，避免限流导致骨架屏截屏抖动。
 * - 首次生成黄金图：npx playwright test tests/site/visual.spec.ts --update-snapshots
 * - 黄金图路径：tests/site/visual.spec.ts-snapshots/（本地生成、.gitignore 忽略、不入库）
 */
const GITHUB_MOCK = {
	description: "A static blog template built with Astro.",
	language: "TypeScript",
	stargazers_count: 4860,
	forks: 1243,
	owner: {
		avatar_url:
			"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='12' fill='%236366f1'/></svg>",
	},
	license: { spdx_id: "MIT" },
};

const modes = [
	{ name: "light", theme: "light" },
	{ name: "dark", theme: "dark" },
];

const cases = [
	{ name: "首页", path: "/" },
	{ name: "首页-网格", path: "/", layout: "grid" },
	{ name: "归档", path: "/archive/" },
	{ name: "动态", path: "/moments/", ready: ".moment-card" },
	{ name: "关于", path: "/about/" },
	{ name: "文章页", path: "/posts/guide/" },
];

async function captureAndCompare(
	page: import("@playwright/test").Page,
	p: (typeof cases)[number],
	mode: (typeof modes)[number],
) {
	await page.addInitScript(
		(entries) => {
			for (const [key, value] of Object.entries(entries))
				localStorage.setItem(key, value);
		},
		{
			theme: mode.theme,
			...(p.layout ? { "post-list-mode": p.layout } : {}),
		},
	);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.route("https://api.github.com/**", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(GITHUB_MOCK),
		}),
	);
	await page.goto(p.path, { waitUntil: "load" });
	await page.waitForFunction(() => {
		const root = document.documentElement;
		return getComputedStyle(root)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#");
	});
	// 等 onload-animation 收敛（reduced-motion 下立即到最终态）+ Svelte 挂载
	await page.waitForFunction(
		() => {
			const els = [...document.querySelectorAll(".onload-animation")];
			return els.every((el) => {
				if ((el as HTMLElement).offsetParent === null) return true;
				return getComputedStyle(el).opacity === "1";
			});
		},
		undefined,
		{ timeout: 15_000 },
	);
	// client:only 岛（如动态页）等水合产物出现，避免截到 fallback
	if (p.ready) {
		await page.waitForSelector(p.ready, { timeout: 15_000 });
	}
	// 逐步滚动触发 lazy 图片加载，全部完成后回顶，保证 fullPage 拼接确定性
	await page.evaluate(async () => {
		await new Promise<void>((resolve) => {
			let y = 0;
			const step = () => {
				y += window.innerHeight;
				window.scrollTo(0, y);
				const loaded = [...document.images].every((img) => img.complete);
				if (loaded || y >= document.body.scrollHeight) return resolve();
				setTimeout(step, 100);
			};
			step();
		});
		window.scrollTo(0, 0);
	});
	await page.waitForTimeout(300);
	await expect(page).toHaveScreenshot(`${p.name}-${mode.name}.png`, {
		fullPage: true,
		maxDiffPixelRatio: 0.01,
	});
}

for (const mode of modes) {
	test.describe(`Site visual (${mode.name})`, () => {
		for (const p of cases) {
			test(p.name, async ({ page }) => {
				await captureAndCompare(page, p, mode);
			});
		}
	});
}
