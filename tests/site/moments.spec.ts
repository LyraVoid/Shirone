import { expect, test } from "@playwright/test";

/**
 * 动态页功能锁定（pages/moments.astro -> organisms/MomentSection.svelte，client:only）。
 * 视觉约束对齐站点设计语言：PageHeader 页内大标题、胶囊搜索条、官方 Chips 筛选、
 * MomentCard（<article> 语义 + 置顶/心情徽标 + 构建期渲染正文）+
 * MomentGallery 两段式看图（网格瓦片 → 内联查看器 → Fancybox 灯箱）、
 * 筛选状态 URL 同步（?q= / ?tag=）。
 * 数据来自 src/content/moments/（getSortedMoments：置顶优先 + 时间倒序），
 * 断言基于默认示例数据集；站点默认语言为 en（siteConfig.lang），文案断言用英文。
 */

const MOMENT_COUNT = 6;

test.describe("动态页", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/moments/");
		await expect(page.locator(".moment-card")).toHaveCount(MOMENT_COUNT);
	});

	test("渲染动态卡片（置顶优先 + 作者 + 时间 + 徽标）", async ({ page }) => {
		const first = page.locator(".moment-card").first();
		// 置顶条目排最前，带置顶徽标与心情图标
		await expect(first.locator(".moment-card__badge--pinned")).toHaveText(
			"Pinned",
		);
		await expect(
			first.locator(".moment-card__badge:not(.moment-card__badge--pinned) svg"),
		).toHaveCount(1);
		// 作者区（头像 + 名字）链到关于页
		await expect(first.locator(".moment-card__author")).toHaveAttribute(
			"href",
			"/about/",
		);
		await expect(first.locator(".moment-card__name")).toHaveText("Shirone");
		await expect(first.locator(".moment-card__author img")).toHaveAttribute(
			"srcset",
			/ 64w, .* 96w/,
		);
		// 时间为 <time datetime>，倒序排列
		await expect(first.locator("time.moment-card__time")).toHaveAttribute(
			"datetime",
			/2026-08-15/,
		);
		const times = await page.locator(".moment-card__time").allTextContents();
		expect(times.length).toBe(MOMENT_COUNT);
		// 正文为构建期渲染的 markdown
		await expect(first.locator(".moment-card__content")).toContainText(
			"Welcome to Moments",
		);
	});

	test("自适应图片网格（单图 / 2×2 / 三图拼图 / 三列 +N 折叠）", async ({
		page,
	}) => {
		// 3 图 → 「1 大 + 2 小」拼图（大图跨两行，无 2+1 孤儿行）
		const mosaic = page.locator(".moment-card__gallery--mosaic");
		await expect(mosaic).toHaveCount(1);
		await expect(mosaic.locator(".moment-card__tile")).toHaveCount(3);
		await expect(mosaic.locator(".moment-card__tile--hero")).toHaveCount(1);
		// 4 图 → 2×2 双列网格
		const pair = page.locator(".moment-card__gallery--pair");
		await expect(pair).toHaveCount(1);
		await expect(pair.locator(".moment-card__tile")).toHaveCount(4);
		// 1 图 → 单图自然尺寸
		await expect(
			page.locator(".moment-card__gallery--single .moment-card__tile"),
		).toHaveCount(1);
		// 7 图 → 三列封顶 6 块 + 「+1」折叠遮罩
		const trio = page.locator(".moment-card__gallery--trio");
		await expect(trio.locator(".moment-card__tile")).toHaveCount(6);
		await expect(trio.locator(".moment-card__more")).toHaveText("+1");
		const thumbnail = mosaic.locator(".moment-card__tile img").first();
		await expect(thumbnail).toHaveAttribute(
			"src",
			/assets\/moments\/thumbnails\/.*-384\.webp/,
		);
		await expect(thumbnail).toHaveAttribute(
			"srcset",
			/-192\.webp 192w.*-640\.webp 640w/,
		);
	});

	test("两段式看图：瓦片 → 内联查看器（切换/键盘/收起/焦点返回）", async ({
		page,
	}) => {
		// 点击多图瓦片 → 卡片内展开查看器（非灯箱）
		await page.locator(".moment-card__tile").first().click();
		const viewer = page.locator(".moment-viewer");
		await expect(viewer).toBeVisible();
		await expect(viewer.locator(".moment-viewer__counter")).toHaveText("1 / 3");
		await expect(
			viewer.locator(".moment-viewer__stage-btn img"),
		).toHaveAttribute("src", /images\/moments\//);
		// 缩略图条 3 项，首项 active
		await expect(viewer.locator(".moment-viewer__thumb")).toHaveCount(3);
		await expect(viewer.locator(".moment-viewer__thumb--active")).toHaveCount(
			1,
		);
		// 键盘 →/← 切换，计数同步；首图 prev 禁用
		await expect(
			viewer.getByRole("button", { name: "Previous image" }),
		).toBeDisabled();
		await page.keyboard.press("ArrowRight");
		await expect(viewer.locator(".moment-viewer__counter")).toHaveText("2 / 3");
		await page.keyboard.press("ArrowLeft");
		await expect(viewer.locator(".moment-viewer__counter")).toHaveText("1 / 3");
		// Esc 收起回网格，焦点返回被点击的瓦片
		await viewer.scrollIntoViewIfNeeded();
		const scrollBeforeCollapse = await page.evaluate(() => window.scrollY);
		await page.keyboard.press("Escape");
		await expect(viewer).toHaveCount(0);
		await expect(page.locator(".moment-card__gallery--mosaic")).toBeVisible();
		await expect
			.poll(() => page.evaluate(() => window.scrollY))
			.toBe(scrollBeforeCollapse);
		const focused = await page.evaluate(() =>
			document.activeElement?.getAttribute("aria-label"),
		);
		expect(focused).toBe("Open image 1");
	});

	test("多图切换期间保持主舞台和卡片布局稳定", async ({ page }) => {
		let releaseSecondImage!: () => void;
		const secondImageGate = new Promise<void>((resolve) => {
			releaseSecondImage = resolve;
		});
		await page.route(
			"**/images/moments/girls-roll/roll-2.webp",
			async (route) => {
				await secondImageGate;
				await route.continue();
			},
		);

		const card = page.locator(".moment-card").filter({
			hasText: "Went through my whole wallpaper library",
		});
		await card.locator(".moment-card__tile").first().click();
		const viewer = card.locator(".moment-viewer");
		const currentImage = viewer.locator(".moment-viewer__stage-btn img");
		await expect
			.poll(() =>
				currentImage.evaluate(
					(image) => image.complete && image.naturalWidth > 0,
				),
			)
			.toBe(true);

		const readLayout = () =>
			viewer.evaluate((element) => {
				const stage = element.querySelector<HTMLElement>(
					".moment-viewer__stage-btn",
				);
				const image = stage?.querySelector<HTMLImageElement>("img");
				const card = element.closest<HTMLElement>(".moment-card");
				return {
					stageHeight: stage?.getBoundingClientRect().height ?? 0,
					viewerHeight: element.getBoundingClientRect().height,
					cardHeight: card?.getBoundingClientRect().height ?? 0,
					imageLoaded: Boolean(image?.complete && image.naturalWidth > 0),
					objectFit: image ? getComputedStyle(image).objectFit : "",
				};
			});

		const before = await readLayout();
		const expectStableLayout = (layout: typeof before) => {
			expect(
				Math.abs(layout.stageHeight - before.stageHeight),
			).toBeLessThanOrEqual(1);
			expect(
				Math.abs(layout.viewerHeight - before.viewerHeight),
			).toBeLessThanOrEqual(1);
			expect(
				Math.abs(layout.cardHeight - before.cardHeight),
			).toBeLessThanOrEqual(1);
		};
		await page.keyboard.press("ArrowRight");
		await expect(viewer.locator(".moment-viewer__counter")).toHaveText("2 / 7");
		await expect(currentImage).toHaveAttribute(
			"src",
			/girls-roll\/roll-2\.webp/,
		);
		await expect(viewer.locator(".moment-viewer__stage-loading")).toBeVisible();
		const whileLoading = await readLayout();

		expect(whileLoading.imageLoaded).toBe(false);
		expectStableLayout(whileLoading);

		releaseSecondImage();
		await expect
			.poll(() =>
				currentImage.evaluate(
					(image) => image.complete && image.naturalWidth > 0,
				),
			)
			.toBe(true);
		await expect(viewer.locator(".moment-viewer__stage-loading")).toHaveCount(
			0,
		);
		const after = await readLayout();

		expect(after.objectFit).toBe("contain");
		expectStableLayout(after);
	});

	test("两段式看图：查看器「查看原图」进 Fancybox 灯箱", async ({ page }) => {
		await page.locator(".moment-card__tile").first().click();
		const viewer = page.locator(".moment-viewer");
		await expect(viewer).toBeVisible();
		await page.keyboard.press("ArrowRight");
		// 大图舞台按钮（View original: alt）打开灯箱
		await viewer.locator(".moment-viewer__stage-btn").click();
		const lightbox = page.locator(".fancybox__container");
		await expect(lightbox).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(lightbox).toHaveCount(0);
	});

	test("单图瓦片直达 Fancybox 灯箱", async ({ page }) => {
		await page
			.locator(".moment-card__gallery--single .moment-card__tile")
			.click();
		const lightbox = page.locator(".fancybox__container");
		await expect(lightbox).toBeVisible();
		await expect(page.locator(".moment-viewer")).toHaveCount(0);
		await page.keyboard.press("Escape");
		await expect(lightbox).toHaveCount(0);
	});

	test("使用站点统一的页面视觉结构", async ({ page }) => {
		await expect(page.locator(".page-header")).toHaveCount(1);
		await expect(page.locator(".page-header__title")).toHaveText("Moments");
		await expect(page.locator(".page-header__icon svg")).toHaveCount(1);
		// 官方 Chips 原子（filter 形态）承担标签筛选
		await expect(
			page.locator(".moment-section__chips .m3-chip--filter"),
		).toHaveCount(6);
		// 计数文案（复数形态）
		await expect(page.locator(".moment-section__count")).toHaveText(
			"6 moments",
		);
		// 位置与 #标签 弱文本（At my desk = 整理壁纸库那条）
		await expect(page.locator(".moment-card__location").first()).toContainText(
			"At my desk",
		);
		expect(await page.locator(".moment-card__tag").count()).toBeGreaterThan(0);
	});

	test("筛选状态同步到 URL（?q= / ?tag=）", async ({ page }) => {
		await page.locator(".moment-section__search input").fill("scenery");
		await expect(page).toHaveURL(/[?&]q=/);
		expect(new URL(page.url()).searchParams.get("q")).toBe("scenery");
		await page.getByRole("button", { name: "wallpaper", exact: true }).click();
		await expect(page).toHaveURL(/[?&]tag=/);
		expect(new URL(page.url()).searchParams.get("tag")).toBe("wallpaper");
		await page.locator(".moment-section__search input").fill("");
		await expect(page).toHaveURL(/[?&]tag=/);
	});

	test("单选标签筛选（再点取消恢复全部，aria-pressed 同步）", async ({
		page,
	}) => {
		const tagFilter = page.getByRole("button", {
			name: "wallpaper",
			exact: true,
		});
		await tagFilter.click();
		await expect(tagFilter).toHaveAttribute("aria-pressed", "true");
		// 三篇带「wallpaper」标签：三张少女、七张少女、风景四张
		await expect(page.locator(".moment-card")).toHaveCount(3);
		await expect(page.locator(".moment-card").first()).toContainText(
			"Three new wallpapers",
		);
		await tagFilter.click();
		await expect(page.locator(".moment-card")).toHaveCount(MOMENT_COUNT);
		await expect(tagFilter).toHaveAttribute("aria-pressed", "false");
	});

	test("筛选过渡：指示器展示 → 淡出 → 列表 stagger 揭幕", async ({ page }) => {
		await page.getByRole("button", { name: "wallpaper", exact: true }).click();
		// loading 段：contained LoadingIndicator 占据列表位
		const loading = page.locator(".moment-section__loading");
		await expect(loading).toBeVisible();
		await expect(loading.locator(".m3-loading")).toHaveCount(1);
		// out 段：淡出修饰生效（reduced-motion 下压缩为终态仍可见类切换）
		await expect(loading).toHaveClass(/moment-section__loading--out/);
		// idle 段：指示器让位，新列表揭幕
		await expect(loading).toHaveCount(0);
		await expect(page.locator(".moment-card")).toHaveCount(3);
	});

	test("搜索过滤 + 空态", async ({ page }) => {
		await page.locator(".moment-section__search input").fill("scenery");
		await expect(page.locator(".moment-card")).toHaveCount(1);
		// 单条结果不显示计数（结果不言自明）
		await expect(page.locator(".moment-section__count")).toHaveCount(0);
		await page.locator(".moment-section__search input").fill("no such moment");
		await expect(page.locator(".moment-section__empty")).toBeVisible();
		await expect(page.locator(".moment-section__empty")).toContainText(
			"No moments matched your filters",
		);
	});
});
