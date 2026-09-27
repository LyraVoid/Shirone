import { expect, test } from "@playwright/test";

/**
 * 归档页分组切换（SegmentedButton 落地锁定）：
 * - 单选组语义（role=group + radio，方向键原生支持）；
 * - 三种分组维度（按年 / 按分类 / 按标签）的组头与计数；
 * - 带 URL 筛选（?category=）时是定向浏览视图：隐藏分组切换、保留面包屑。
 * 组头顺序约定：年份倒序（新→旧）、分类/标签按名称字母序。
 */
test.describe("archive grouping switch", () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	async function openArchive(
		page: import("@playwright/test").Page,
		path = "/archive/",
	) {
		await page.goto(path, { waitUntil: "networkidle" });
		await page.waitForTimeout(600);
	}

	async function selectGroup(
		page: import("@playwright/test").Page,
		name: string,
	) {
		// SegmentedButton 的 input 是 sr-only 隐藏的，点击可见 label（原生转发到 input）
		await page
			.getByRole("group", { name: "Group archive by" })
			.getByText(name, { exact: true })
			.click();
	}

	test("renders a labeled radio group with three options, year checked by default", async ({
		page,
	}) => {
		await openArchive(page);

		const group = page.getByRole("group", { name: "Group archive by" });
		const radios = group.getByRole("radio");
		await expect(radios).toHaveCount(3);
		await expect(radios.nth(0)).toHaveAccessibleName("By Year");
		await expect(radios.nth(1)).toHaveAccessibleName("By Category");
		await expect(radios.nth(2)).toHaveAccessibleName("By Tag");
		await expect(radios.nth(0)).toBeChecked();
		await expect(radios.nth(1)).not.toBeChecked();

		// 默认按年分组：年份倒序，首组为最新年份
		const titles = page.locator(".m3-blog-archive__group-title");
		await expect(titles.first()).toHaveText("2026");
		await expect(titles).toHaveText(["2026", "2024", "2023", "2022"]);
	});

	test("switches grouping to category with counts", async ({ page }) => {
		await openArchive(page);

		await selectGroup(page, "By Category");
		await expect(page.locator(".m3-blog-archive__group-title")).toHaveText([
			"Examples",
			"Guides",
		]);
		await expect(page.locator(".m3-blog-archive__count").first()).toHaveText(
			"9 posts",
		);
	});

	test("switches grouping to tag, sorted by name with hash prefix", async ({
		page,
	}) => {
		await openArchive(page);

		await selectGroup(page, "By Tag");
		const tagTitles = await page
			.locator(".m3-blog-archive__group-title")
			.allTextContents();
		expect(tagTitles.length).toBe(27);
		expect(tagTitles[0]).toBe("#Accessibility");
		expect(tagTitles).toContain("#Blogging");
		expect(tagTitles).toContain("#Guide");
		expect(tagTitles).toContain("#Shirone");
	});

	test("arrow keys move selection within the radio group", async ({ page }) => {
		await openArchive(page);

		await page.getByRole("radio", { name: "By Year" }).focus();
		await page.keyboard.press("ArrowRight");
		await expect(
			page.getByRole("radio", { name: "By Category" }),
		).toBeChecked();
		await page.keyboard.press("ArrowRight");
		await expect(page.getByRole("radio", { name: "By Tag" })).toBeChecked();
		await page.keyboard.press("ArrowLeft");
		await expect(
			page.getByRole("radio", { name: "By Category" }),
		).toBeChecked();
	});

	test("URL filter is a scoped browse view: switch hidden, breadcrumb shown", async ({
		page,
	}) => {
		await openArchive(page, "/archive/?category=Examples");

		// 筛选头保留
		await expect(
			page.getByRole("navigation", { name: "Breadcrumb" }),
		).toBeVisible();
		// 带筛选参数时不渲染分组切换（定向浏览视图，分组控制无意义）
		await expect(
			page.getByRole("group", { name: "Group archive by" }),
		).toHaveCount(0);
		// 直接呈现筛选后的年份时间轴
		await expect(page.locator(".m3-blog-archive__item")).toHaveCount(9);
		await expect(page.locator(".m3-blog-archive__group-title")).toHaveText([
			"2026",
			"2024",
			"2023",
			"2022",
		]);

		// 回到无参数归档页：分组切换恢复
		await openArchive(page);
		await expect(
			page.getByRole("group", { name: "Group archive by" }),
		).toBeVisible();
	});
});
