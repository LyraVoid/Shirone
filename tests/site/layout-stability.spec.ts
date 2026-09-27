import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

/**
 * 文档级布局宽度稳定性（滚动条槽位契约）。
 *
 * `#main-layout` 是 `w-full` 的绝对定位容器，宽度等于初始包含块宽度，因此经典
 * 滚动条出现/消失会让整页横移一个滚动条宽度（Windows Chrome 15px）。Banner
 * 模式下文档恒高于视口、滚动条常驻，看不出问题；纯色背景（wallpaper-mode=none）
 * 模式下短页没有滚动条，Swup 切页时 `#page-height-extend` 又会临时开关滚动条，
 * 于是每次导航都抖动一次。契约由 `html { scrollbar-gutter: stable }`
 * （src/styles/main.css）保证：槽位常驻预留，滚动条只在真的有内容可滚动时出现，
 * 布局宽度因此与滚动条状态无关。`src/utils/scroll-lock.ts` 负责滚动锁场景。
 *
 * Playwright 默认注入 `--hide-scrollbars`，滚动条宽度被算成 0，本契约就完全
 * 观测不到；因此这里必须关掉该默认参数。这是本 spec 唯一偏离全局配置的地方，
 * 其余（channel、baseURL、dev server）继续沿用 `playwright.config.ts`。
 */
const CLASSIC_SCROLLBAR_LAUNCH = {
	launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
} as const;

// `launchOptions` 会强制新 worker，Playwright 只允许在文件顶层声明
test.use(CLASSIC_SCROLLBAR_LAUNCH);

const LONG_PAGE = "/archive/";
const SHORT_PAGE = "/categories/";

type GridGeometry = { width: number; left: number };
type GeometrySample = GridGeometry & { tag: string };

declare global {
	interface Window {
		__shironeScrollRelease?: () => void;
	}
}

async function waitForLayoutReady(page: Page) {
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	await page.waitForFunction(() => !!document.getElementById("main-grid"));
	await page.waitForTimeout(300);
}

async function readGridGeometry(page: Page): Promise<GridGeometry> {
	return page.evaluate(() => {
		const grid = document.getElementById("main-grid");
		if (!grid) throw new Error("#main-grid is missing");
		const rect = grid.getBoundingClientRect();
		return { width: Math.round(rect.width), left: Math.round(rect.left) };
	});
}

async function hasVerticalScrollbar(page: Page): Promise<boolean> {
	return page.evaluate(
		() => window.innerWidth - document.documentElement.clientWidth > 0,
	);
}

/** 站内导航并等到新页面就位（Swup 生命周期与 onload 动效都收敛） */
async function navigateTo(page: Page, path: string) {
	await page.evaluate((target) => window.swup?.navigate(target), path);
	await page.waitForFunction((target) => location.pathname === target, path);
	await page.waitForTimeout(600);
}

/** 页面内容是否装得下视口（装得下时浏览器默认不会给滚动条） */
async function fitsViewport(page: Page): Promise<boolean> {
	return page.evaluate(
		() =>
			document.documentElement.scrollHeight <=
			document.documentElement.clientHeight,
	);
}

/** 顶部栏位于 `body` 内容盒内的常规流，可用来验证滚动锁的内边距补偿 */
async function readTopRowGeometry(page: Page): Promise<GridGeometry> {
	return page.evaluate(() => {
		const topRow = document.getElementById("top-row");
		if (!topRow) throw new Error("#top-row is missing");
		const rect = topRow.getBoundingClientRect();
		return { width: Math.round(rect.width), left: Math.round(rect.left) };
	});
}

/**
 * 记录一次 Swup 站内导航全过程的 `#main-grid` 几何。
 * 逐帧 + Swup 生命周期双采样：宽度偏移发生在钩子内（同步改 `hidden`），
 * 逐帧采样足以捕获持续数百毫秒的中间态。
 */
async function sampleGeometryDuringNavigate(
	page: Page,
	href: string,
): Promise<GeometrySample[]> {
	return page.evaluate(async (target) => {
		const grid = document.getElementById("main-grid");
		if (!grid) throw new Error("#main-grid is missing");
		const samples: GeometrySample[] = [];
		const record = (tag: string) => {
			const rect = grid.getBoundingClientRect();
			samples.push({
				tag,
				width: Math.round(rect.width),
				left: Math.round(rect.left),
			});
		};

		record("start");
		let running = true;
		const tick = () => {
			if (!running) return;
			record("frame");
			window.requestAnimationFrame(tick);
		};
		window.requestAnimationFrame(tick);
		for (const event of [
			"visit:start",
			"content:replace",
			"page:view",
			"visit:end",
		]) {
			document.addEventListener(
				`swup:${event}`,
				() => record(`swup:${event}`),
				{ once: true },
			);
		}

		window.swup?.navigate(target);
		await new Promise((resolve) => window.setTimeout(resolve, 1600));
		running = false;
		record("end");
		return samples;
	}, href);
}

function expectStableGeometry(samples: GeometrySample[], label: string) {
	expect(samples.length).toBeGreaterThan(1);
	const distinct = new Map<string, GeometrySample>();
	for (const sample of samples) {
		distinct.set(`${sample.width}x${sample.left}`, sample);
	}
	expect(
		[...distinct.values()].map(
			({ tag, width, left }) => `${tag}: width=${width} left=${left}`,
		),
		`${label} 期间 #main-grid 几何发生了跳变`,
	).toHaveLength(1);
}

async function openSolidPage(page: Page, path: string) {
	await page.addInitScript(() =>
		localStorage.setItem("wallpaper-mode", "none"),
	);
	await page.goto(path, { waitUntil: "domcontentloaded" });
	await waitForLayoutReady(page);
	await page.waitForFunction(() => Boolean(window.swup?.navigate));
}

test.describe("Layout width stability", () => {
	test("keeps one layout width whether or not the page scrolls", async ({
		page,
	}) => {
		await openSolidPage(page, SHORT_PAGE);
		test.skip(
			!(await fitsViewport(page)),
			`${SHORT_PAGE} 现在比视口高，缺少「短页」这一前提`,
		);

		await expect(page.locator("html")).toHaveCSS("scrollbar-gutter", "stable");
		const shortPage = await readGridGeometry(page);
		expect(
			await hasVerticalScrollbar(page),
			`${SHORT_PAGE} 上出现了滚动条，缺少「短页不显示滚动条」这一前提`,
		).toBe(false);

		await navigateTo(page, LONG_PAGE);
		test.skip(
			await fitsViewport(page),
			`${LONG_PAGE} 现在不比视口高，缺少「长页」这一前提`,
		);
		expect(
			await hasVerticalScrollbar(page),
			`${LONG_PAGE} 上没有滚动条，缺少「长页有滚动条」这一前提`,
		).toBe(true);

		// 槽位常驻的意义：有滚动条与没滚动条时布局宽度必须一致
		expect(
			await readGridGeometry(page),
			`${SHORT_PAGE} 与 ${LONG_PAGE} 的布局宽度不一致，切页仍会横移`,
		).toEqual(shortPage);
	});

	test("keeps #main-grid width stable across long/short Swup navigation", async ({
		page,
	}) => {
		await openSolidPage(page, SHORT_PAGE);
		test.skip(
			!(await fitsViewport(page)),
			`${SHORT_PAGE} 现在比视口高，缺少「短页」这一前提`,
		);

		const toLong = await sampleGeometryDuringNavigate(page, LONG_PAGE);
		expectStableGeometry(toLong, `${SHORT_PAGE} -> ${LONG_PAGE}`);
		expect(new URL(page.url()).pathname).toBe(LONG_PAGE);

		test.skip(
			await fitsViewport(page),
			`${LONG_PAGE} 现在不比视口高，缺少「长页」这一前提`,
		);

		const toShort = await sampleGeometryDuringNavigate(page, SHORT_PAGE);
		expectStableGeometry(toShort, `${LONG_PAGE} -> ${SHORT_PAGE}`);
		expect(new URL(page.url()).pathname).toBe(SHORT_PAGE);
	});

	test("keeps the layout width when the wallpaper mode switches", async ({
		page,
	}) => {
		await openSolidPage(page, SHORT_PAGE);
		const solid = await readGridGeometry(page);

		await page.evaluate(() => {
			// @ts-expect-error 动态导入浏览器侧主题模块
			return import("/src/utils/setting-utils.ts").then((mod) => {
				mod.setWallpaperMode("banner");
			});
		});
		await page.waitForTimeout(400);
		const banner = await readGridGeometry(page);

		await page.evaluate(() => {
			// @ts-expect-error 动态导入浏览器侧主题模块
			return import("/src/utils/setting-utils.ts").then((mod) => {
				mod.setWallpaperMode("none");
			});
		});
		await page.waitForTimeout(400);
		const backToSolid = await readGridGeometry(page);

		expect(banner).toEqual(solid);
		expect(backToSolid).toEqual(solid);
	});

	/**
	 * 槽位预留生效时，锁 `body` 滚动不应改变任何几何（滚动条消失但槽位仍在）。
	 * 这条同时锁住「不要多补内边距」——多补会把顶部栏压窄 15px。
	 */
	test("keeps the layout width while the page scroll is locked", async ({
		page,
	}) => {
		await openSolidPage(page, LONG_PAGE);
		test.skip(
			!(await hasVerticalScrollbar(page)),
			"当前浏览器没有可测量的经典滚动条",
		);

		const beforeGrid = await readGridGeometry(page);
		const beforeTopRow = await readTopRowGeometry(page);
		await page.evaluate(async () => {
			// @ts-expect-error 动态导入浏览器侧主题模块
			const mod = await import("/src/utils/scroll-lock.ts");
			window.__shironeScrollRelease = mod.lockPageScroll();
		});
		await page.waitForTimeout(200);
		await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
		expect(await readGridGeometry(page)).toEqual(beforeGrid);
		expect(await readTopRowGeometry(page)).toEqual(beforeTopRow);

		await page.evaluate(() => {
			window.__shironeScrollRelease?.();
			window.__shironeScrollRelease = undefined;
		});
		await page.waitForTimeout(200);
		await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
		expect(await readGridGeometry(page)).toEqual(beforeGrid);
		expect(await readTopRowGeometry(page)).toEqual(beforeTopRow);
	});

	/**
	 * 兼容路径：把槽位预留与滚动条一起退回浏览器默认（等价于不支持
	 * `scrollbar-gutter` 的旧版 Safari），此时锁滚动会让布局真的变宽，
	 * `scroll-lock.ts` 必须补等量内边距，保住 `body` 内容盒内常规流元素
	 * （`#top-row`、顶部栏）的宽度。绝对定位的 `#main-layout` 在此路径下无法
	 * 补偿，只能依赖槽位预留。
	 */
	test("compensates the scrollbar width when the root scrollbar is removed", async ({
		page,
	}) => {
		await openSolidPage(page, LONG_PAGE);
		test.skip(
			!(await hasVerticalScrollbar(page)),
			"当前浏览器没有可测量的经典滚动条",
		);

		await page.addStyleTag({
			content:
				"html { scrollbar-gutter: auto !important; overflow-y: auto !important; }",
		});
		await page.waitForTimeout(200);
		expect(await hasVerticalScrollbar(page)).toBe(true);

		const before = await readTopRowGeometry(page);
		await page.evaluate(async () => {
			// @ts-expect-error 动态导入浏览器侧主题模块
			const mod = await import("/src/utils/scroll-lock.ts");
			window.__shironeScrollRelease = mod.lockPageScroll();
		});
		await page.waitForTimeout(200);
		await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
		expect(await readTopRowGeometry(page)).toEqual(before);

		await page.evaluate(() => {
			window.__shironeScrollRelease?.();
			window.__shironeScrollRelease = undefined;
		});
		await page.waitForTimeout(200);
		await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
		expect(await readTopRowGeometry(page)).toEqual(before);
	});
});
