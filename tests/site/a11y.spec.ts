import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * 真实站点页面 A11y 锁定（axe-core / WCAG 2.1 AA）
 * 与 tests/atoms/a11y.spec.ts（原子测试页）互补：这里扫描博客真实页面
 * （首页 / 归档 / 关于 / 文章页），覆盖整站语义结构（header/nav/aside landmark）、
 * 内容层（Markdown、GitHub 卡片）与深色模式下的对比度。
 * 说明：
 * - GitHub 卡片（::github 指令）请求被 mock 为固定成功响应，避免外部配额或网络抖动影响扫描。
 * - 扫描前等待 onload-animation 全部收敛（opacity 1），防止动画中间帧误报。
 * - 断言页面确实处于目标模式，防止主题未应用导致“假通过”。
 */
const pages = [
	{ name: "首页", path: "/" },
	{ name: "首页-网格", path: "/", layout: "grid" },
	{ name: "归档", path: "/archive/" },
	{ name: "友链", path: "/friends/" },
	{ name: "动态", path: "/moments/" },
	{ name: "番剧", path: "/anime/" },
	{ name: "站点罗盘", path: "/compass/" },
	{ name: "技能", path: "/skills/" },
	{ name: "项目", path: "/projects/" },
	{ name: "设备展示", path: "/devices/" },
	{ name: "时间线", path: "/timeline/" },
	{ name: "受保护相册", path: "/albums/EncryptedExample/" },
	{ name: "关于", path: "/about/" },
	{ name: "文章页", path: "/posts/guide/" },
	{ name: "MDX文章页", path: "/posts/mdx-showcase/" },
	{ name: "分类索引", path: "/categories/" },
	{ name: "标签索引", path: "/tags/" },
];

const DISABLED_RULES = ["page-has-heading-one"];

const modes = [
	{ name: "light", theme: "light", dark: false },
	{ name: "dark", theme: "dark", dark: true },
];

const GITHUB_MOCK = {
	description: "A static blog template built with Astro.",
	language: "TypeScript",
	stargazers_count: 4860,
	forks_count: 1243,
	owner: {
		avatar_url:
			"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='12' fill='%236366f1'/></svg>",
	},
	license: { spdx_id: "MIT" },
};

async function openSitePage(
	page: import("@playwright/test").Page,
	path: string,
	theme: string,
	layout?: string,
) {
	await page.addInitScript(
		(entries) => {
			for (const [key, value] of Object.entries(entries))
				localStorage.setItem(key, value);
		},
		{ theme, ...(layout ? { "post-list-mode": layout } : {}) },
	);
	await page.route("https://api.github.com/**", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(GITHUB_MOCK),
		}),
	);
	await page.goto(path, { waitUntil: "domcontentloaded" });
	// 等待主题引擎初始化（HCT 动态配色写入 :root）
	await page.waitForFunction(() => {
		const root = document.documentElement;
		return root.style.getPropertyValue("--mc-primary").trim().startsWith("#");
	});
	// 等待 onload-animation 全部收敛（跳过 display:none 元素），防止动画中间帧
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
	// Svelte 客户端挂载（归档页 client:only 需 onMount 构建分组）
	await page.waitForTimeout(500);
}

for (const mode of modes) {
	test.describe(`Site a11y scan lock (${mode.name})`, () => {
		for (const p of pages) {
			test(p.name, async ({ page }) => {
				await openSitePage(page, p.path, mode.theme, p.layout);
				// 防止主题未应用导致“假通过”：确认页面确实处于目标模式
				const isDark = await page.evaluate(() =>
					document.documentElement.classList.contains("dark"),
				);
				expect(isDark, `${p.name} theme should be ${mode.name}`).toBe(
					mode.dark,
				);
				const results = await new AxeBuilder({ page })
					.disableRules(DISABLED_RULES)
					.analyze();
				const summary = results.violations.map((v) => ({
					id: v.id,
					impact: v.impact,
					nodes: v.nodes.map((n) => n.target.join(" ")),
				}));
				expect(
					summary,
					`${p.name} has accessibility violations (${mode.name})`,
				).toEqual([]);
			});
		}
	});
}
