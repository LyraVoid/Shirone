import { expect, type Page, test } from "@playwright/test";
import {
	commentConfig,
	resolveCommentOptions,
} from "../../src/config/commentConfig";
import I18nKey from "../../src/i18n/i18nKey";
import { en } from "../../src/i18n/languages/en";
import { es } from "../../src/i18n/languages/es";
import { id } from "../../src/i18n/languages/id";
import { ja } from "../../src/i18n/languages/ja";
import { ko } from "../../src/i18n/languages/ko";
import { th } from "../../src/i18n/languages/th";
import { tr } from "../../src/i18n/languages/tr";
import { vi } from "../../src/i18n/languages/vi";
import { zh_CN } from "../../src/i18n/languages/zh_CN";
import { zh_TW } from "../../src/i18n/languages/zh_TW";
import type {
	CommentConfig,
	GiscusConfig,
} from "../../src/types/commentConfig";

const translations = [en, es, id, ja, ko, th, tr, vi, zh_CN, zh_TW];
const commentKeys = [
	I18nKey.comments,
	I18nKey.commentsLoading,
	I18nKey.commentsLoadFailed,
	I18nKey.commentsRequiresJavaScript,
];

const twikooScriptUrl =
	"https://cdn.jsdelivr.net/npm/twikoo@1.7.19/dist/twikoo.min.js";

async function mockTwikoo(page: Page) {
	await page.route(twikooScriptUrl, async (route) => {
		await route.fulfill({
			contentType: "application/javascript",
			body:
				`
				window.twikoo = {
					init: async ({ el }) => {
						const mount = document.createElement('div');
						mount.id = 'twikoo';
						el.replaceWith(mount);
						el = mount;
						el.innerHTML = ` +
				"`" +
				`
							<div class="tk-comments">
								<div class="tk-submit">
									<div class="tk-row">
										<div class="tk-avatar"></div>
										<div class="tk-col">
											<div class="tk-meta-input">
												<div class="el-input el-input-group el-input-group--prepend"><div class="el-input-group__prepend">Nickname</div><input name="nick" placeholder="Required" class="el-input__inner"></div>
												<div class="el-input el-input-group el-input-group--prepend"><div class="el-input-group__prepend">Email</div><input name="mail" type="email" placeholder="Required" class="el-input__inner"></div>
												<div class="el-input el-input-group el-input-group--prepend"><div class="el-input-group__prepend">Website</div><input name="link" placeholder="Optional" class="el-input__inner"></div>
											</div>
											<div class="tk-input el-textarea"><textarea class="el-textarea__inner" placeholder="" style="min-height:97px;height:97px"></textarea><span class="el-input__count">0/500</span></div>
										</div>
									</div>
									<div class="tk-row actions"><div class="tk-row-actions-start"><div class="tk-submit-action-icon"><svg></svg></div></div><button class="el-button tk-preview">Preview</button><button class="el-button tk-send" disabled>Send</button></div>
								</div>
								<a href="#" class="tk-action-link tk-like-action" style="display:block;width:48px;height:48px">Like</a>
								<div class="tk-comments-container">
									<div class="tk-comments-title"><span></span><span><span class="tk-icon __comments"><svg></svg></span><span class="tk-icon __comments tk-admin-entry" style="display:inline-block;width:24px;height:24px"><svg></svg></span></span></div>
									<div class="tk-comments-no">No comment</div>
									<div class="el-loading-mask" style="display:none"><div class="el-loading-spinner">Native spinner</div></div>
								</div>
								<div class="tk-admin-container"><div class="tk-admin" style="display:none;position:fixed;inset:0;z-index:1000;color:rgb(255,255,255);background:rgba(0,0,0,.85)"><a href="#" class="tk-admin-close" style="display:block;width:48px;height:48px">Close</a><div class="tk-admin-comment"><div class="tk-content">User comment</div></div></div></div>
							</div>
						` +
				"`" +
				`;
						const admin = el.querySelector('.tk-admin');
						el.querySelector('.tk-like-action').addEventListener('click', (event) => {
							event.preventDefault();
							event.currentTarget.classList.toggle('tk-liked');
						});
						el.querySelector('.tk-admin-entry').addEventListener('click', () => {
							admin.classList.add('__show');
							admin.style.display = 'block';
						});
						el.querySelector('.tk-admin-close').addEventListener('click', (event) => {
							event.preventDefault();
							admin.classList.remove('__show');
							admin.style.display = 'none';
						});
					}
				};
			`,
		});
	});
}

const giscusScriptUrl = "https://giscus.app/client.js";

async function mockGiscus(page: Page) {
	// 模拟 giscus client.js 的真实挂载语义：不要求预置 .giscus 容器，
	// 在 script 之后自建容器并注入 iframe；widget 页面回显 postMessage 以验证主题转发。
	await page.route("https://giscus.app/widget*", async (route) => {
		await route.fulfill({
			contentType: "text/html",
			body: `<!doctype html><html><body><script>
				window.addEventListener("message", function (e) {
					if (e.data && e.data.giscus) window.parent.postMessage(e.data, "*");
				});
			</script></body></html>`,
		});
	});
	await page.route(giscusScriptUrl, async (route) => {
		await route.fulfill({
			contentType: "application/javascript",
			body: `
				(() => {
					const current = document.currentScript;
					let container = document.querySelector('.giscus');
					if (!container) {
						container = document.createElement('div');
						container.className = 'giscus';
						current.insertAdjacentElement('afterend', container);
					}
					const iframe = document.createElement('iframe');
					iframe.className = 'giscus-frame giscus-frame--loading';
					iframe.title = 'Comments';
					const params = new URLSearchParams();
					for (const [key, value] of Object.entries(current.dataset)) {
						params.set(key, value);
					}
					params.set('origin', window.location.href);
					iframe.src = 'https://giscus.app/widget?' + params.toString();
					container.appendChild(iframe);
					window.__giscusMock = { container, iframe };
				})();
			`,
		});
	});
}

test.describe("Comment System - Configuration & Architecture", () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	test("all 10 locales have complete comment i18n keys", () => {
		for (const dict of translations) {
			for (const key of commentKeys) {
				expect(dict[key]).toBeDefined();
				expect(typeof dict[key]).toBe("string");
				expect((dict[key] as string).trim().length).toBeGreaterThan(0);
			}
		}
	});

	test("resolveCommentOptions returns null when disabled or misconfigured", () => {
		const disabledConfig: CommentConfig = {
			enable: false,
			provider: "twikoo",
			lazy: true,
			twikoo: {
				envId: "https://twikoo.mysqil.com",
				scriptUrl:
					"https://cdn.jsdelivr.net/npm/twikoo@1.6.41/dist/twikoo.all.min.js",
				lang: "auto",
			},
		};
		expect(resolveCommentOptions(disabledConfig)).toBeNull();

		const noneProviderConfig: CommentConfig = {
			enable: true,
			provider: "none",
			lazy: true,
			twikoo: {
				envId: "https://twikoo.mysqil.com",
				scriptUrl:
					"https://cdn.jsdelivr.net/npm/twikoo@1.6.41/dist/twikoo.all.min.js",
				lang: "auto",
			},
		};
		expect(resolveCommentOptions(noneProviderConfig)).toBeNull();

		const missingEnvIdConfig: CommentConfig = {
			enable: true,
			provider: "twikoo",
			lazy: true,
			twikoo: {
				envId: "",
				scriptUrl:
					"https://cdn.jsdelivr.net/npm/twikoo@1.6.41/dist/twikoo.all.min.js",
				lang: "auto",
			},
		};
		expect(resolveCommentOptions(missingEnvIdConfig)).toBeNull();
	});

	test("resolveCommentOptions returns resolved options when valid", () => {
		const validConfig: CommentConfig = {
			enable: true,
			provider: "twikoo",
			lazy: true,
			twikoo: {
				envId: "https://twikoo.mysqil.com",
				scriptUrl:
					"https://cdn.jsdelivr.net/npm/twikoo@1.6.41/dist/twikoo.all.min.js",
				lang: "auto",
				placeholder: "Comment guidance",
			},
		};

		const resolved = resolveCommentOptions(validConfig);
		expect(resolved).not.toBeNull();
		expect(resolved?.provider).toBe("twikoo");
		expect(resolved?.lazy).toBe(true);
		expect(resolved?.twikoo.envId).toBe("https://twikoo.mysqil.com");
		expect(resolved?.twikoo.placeholder).toBe("Comment guidance");
	});

	test("resolveCommentOptions returns null for giscus with missing required ids", () => {
		const baseGiscus: GiscusConfig = {
			repo: "owner/repo",
			repoId: "R_placeholder",
			category: "Announcements",
			categoryId: "DIC_placeholder",
			mapping: "pathname",
			strict: false,
			reactionsEnabled: true,
			emitMetadata: false,
			inputPosition: "bottom",
			theme: { light: "light", dark: "dark" },
			lang: "auto",
			scriptUrl: "https://giscus.app/client.js",
		};
		const twikooStub = {
			envId: "",
			scriptUrl: "",
			lang: "auto",
		} as const;

		const missingRepoId: CommentConfig = {
			enable: true,
			provider: "giscus",
			lazy: true,
			twikoo: twikooStub,
			giscus: { ...baseGiscus, repoId: "  " },
		};
		expect(resolveCommentOptions(missingRepoId)).toBeNull();

		const missingCategoryId: CommentConfig = {
			enable: true,
			provider: "giscus",
			lazy: true,
			twikoo: twikooStub,
			giscus: { ...baseGiscus, categoryId: "" },
		};
		expect(resolveCommentOptions(missingCategoryId)).toBeNull();

		const disabledGiscus: CommentConfig = {
			enable: false,
			provider: "giscus",
			lazy: true,
			twikoo: twikooStub,
			giscus: baseGiscus,
		};
		expect(resolveCommentOptions(disabledGiscus)).toBeNull();
	});

	test("resolveCommentOptions returns trimmed giscus options when valid", () => {
		const validConfig: CommentConfig = {
			enable: true,
			provider: "giscus",
			lazy: false,
			twikoo: {
				envId: "",
				scriptUrl: "",
				lang: "auto",
			},
			giscus: {
				repo: " owner/repo ",
				repoId: " R_id ",
				category: " General ",
				categoryId: " DIC_id ",
				mapping: "pathname",
				strict: true,
				reactionsEnabled: true,
				emitMetadata: false,
				inputPosition: "top",
				theme: { light: "light", dark: "transparent_dark" },
				lang: "auto",
				scriptUrl: "https://giscus.app/client.js",
			},
		};

		const resolved = resolveCommentOptions(validConfig);
		expect(resolved).not.toBeNull();
		expect(resolved?.provider).toBe("giscus");
		expect(resolved?.lazy).toBe(false);
		if (resolved?.provider === "giscus") {
			expect(resolved.giscus.repo).toBe("owner/repo");
			expect(resolved.giscus.repoId).toBe("R_id");
			expect(resolved.giscus.category).toBe("General");
			expect(resolved.giscus.categoryId).toBe("DIC_id");
			expect(resolved.giscus.theme.dark).toBe("transparent_dark");
		}
	});

	// giscus UI 测试要求评论启用且 provider 为 giscus（与站点真实配置联动）
	const giscusUiEnabled =
		resolveCommentOptions(commentConfig)?.provider === "giscus";
	// twikoo UI 测试要求评论启用且 provider 为 twikoo（与站点真实配置联动）
	const twikooUiEnabled =
		resolveCommentOptions(commentConfig)?.provider === "twikoo";

	test("enabled comment section renders DOM structure with test data", async ({
		page,
	}) => {
		test.skip(
			!twikooUiEnabled,
			"评论未启用或 provider 非 twikoo，跳过 twikoo UI 测试",
		);
		await mockTwikoo(page);
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });

		// 1. 评论区容器存在且包含标题
		const commentSection = page.locator("#comments");
		await expect(commentSection).toHaveCount(1);
		await expect(page.locator("#comments-title")).toBeVisible();

		// 2. Twikoo 挂载容器与 test envId 数据属性正确
		const wrapper = page.locator(".shirone-twikoo-wrapper");
		await expect(wrapper).toHaveCount(1);
		await expect(wrapper).toHaveAttribute(
			"data-twikoo-env-id",
			"https://twikoo.mysqil.com",
		);
		await expect(wrapper).toHaveAttribute("data-twikoo-lazy", "true");

		// 3. 懒加载前保留挂载容器，进入视口后由 Vue 根节点替换
		await expect(page.locator("#tcomment, #twikoo")).toHaveCount(1);
	});

	test("pages without comments load no Twikoo DOM or CSS", async ({ page }) => {
		const twikooCssRequests: string[] = [];
		page.on("request", (request) => {
			const url = request.url();
			// dev 模式下 Astro 通过 ?astro&type=style 内部端点注入组件样式，
			// 不是真实 CSS 资产请求；仅统计构建产物中的独立样式文件。
			if (
				url.includes("Twikoo.") &&
				url.endsWith(".css") &&
				!url.includes("?astro")
			) {
				twikooCssRequests.push(url);
			}
		});

		await page.goto("/");
		await expect(page.locator("#comments")).toHaveCount(0);
		await expect(page.locator(".shirone-twikoo-wrapper")).toHaveCount(0);
		await expect(page.locator("#tcomment")).toHaveCount(0);
		expect(twikooCssRequests).toHaveLength(0);
	});

	test("pages without comments load no Giscus DOM or external requests", async ({
		page,
	}) => {
		const giscusRequests: string[] = [];
		page.on("request", (request) => {
			if (request.url().includes("giscus")) {
				giscusRequests.push(request.url());
			}
		});

		await page.goto("/");
		await expect(page.locator("#comments")).toHaveCount(0);
		await expect(page.locator(".shirone-giscus-wrapper")).toHaveCount(0);
		expect(giscusRequests).toHaveLength(0);
	});

	test("comment editor keeps fields aligned on desktop and mobile", async ({
		page,
	}) => {
		test.skip(
			!twikooUiEnabled,
			"评论未启用或 provider 非 twikoo，跳过 twikoo UI 测试",
		);
		await mockTwikoo(page);
		await page.goto("/posts/guide/");
		await page.locator("#comments").scrollIntoViewIfNeeded();
		await expect(page.locator(".tk-meta-input")).toBeVisible();
		await page.locator(".tk-input textarea").fill("Draft comment");

		const assertFieldGeometry = async (stacked: boolean) => {
			const rem = await page.evaluate(() =>
				Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
			);
			const metaBox = await page.locator(".tk-meta-input").boundingBox();
			const fields = page.locator(".tk-meta-input > .el-input");
			const fieldBoxes = await fields.evaluateAll((elements) =>
				elements.map((element) => {
					const field = element.getBoundingClientRect();
					const label = element.firstElementChild?.getBoundingClientRect();
					const input = element.querySelector("input")?.getBoundingClientRect();
					return {
						x: field.x,
						y: field.y,
						width: field.width,
						height: field.height,
						labelY: label?.y,
						labelHeight: label?.height,
						inputY: input?.y,
						inputHeight: input?.height,
					};
				}),
			);

			expect(metaBox).not.toBeNull();
			expect(fieldBoxes).toHaveLength(3);
			for (const field of fieldBoxes) {
				expect(field.height).toBeCloseTo(rem * 3, 0);
				expect(field.labelY).toBe(field.inputY);
				expect(field.labelHeight).toBe(field.inputHeight);
			}

			if (stacked) {
				expect(fieldBoxes[1].y).toBeGreaterThan(fieldBoxes[0].y);
				expect(fieldBoxes[2].y).toBeGreaterThan(fieldBoxes[1].y);
				for (const field of fieldBoxes) {
					expect(field.width).toBeCloseTo(metaBox?.width ?? 0, 0);
				}
			} else {
				expect(new Set(fieldBoxes.map((field) => field.y)).size).toBe(1);
			}

			const textareaBox = await page
				.locator(".tk-input textarea")
				.boundingBox();
			const previewBox = await page.locator(".tk-preview").boundingBox();
			expect(textareaBox?.height).toBeCloseTo(rem * 7, 0);
			expect(previewBox?.height).toBeCloseTo(rem * 2.75, 0);
		};

		await assertFieldGeometry(false);

		await page.setViewportSize({ width: 390, height: 844 });
		await page.locator("#comments").scrollIntoViewIfNeeded();
		await assertFieldGeometry(true);
	});

	test("preview appears only for comment content with tonal colors", async ({
		page,
	}) => {
		test.skip(
			!twikooUiEnabled,
			"评论未启用或 provider 非 twikoo，跳过 twikoo UI 测试",
		);
		await mockTwikoo(page);
		await page.goto("/posts/guide/");
		await page.locator("#comments").scrollIntoViewIfNeeded();

		const textarea = page.locator(".tk-input textarea");
		const preview = page.locator(".tk-preview");
		await expect(textarea).toBeVisible();
		await expect(preview).toBeHidden();

		await textarea.fill("Draft comment");
		await expect(preview).toBeVisible();

		const colors = await preview.evaluate((element) => {
			const resolveColor = (token: string) => {
				const probe = document.createElement("span");
				probe.style.color = `var(${token})`;
				element.append(probe);
				const color = getComputedStyle(probe).color;
				probe.remove();
				return color;
			};

			const styles = getComputedStyle(element);
			return {
				background: styles.backgroundColor,
				color: styles.color,
				expectedBackground: resolveColor("--secondary-container"),
				expectedColor: resolveColor("--on-secondary-container"),
			};
		});
		expect(colors.background).toBe(colors.expectedBackground);
		expect(colors.color).toBe(colors.expectedColor);

		await textarea.fill("");
		await expect(preview).toBeHidden();
	});

	test("configured guidance appears as semantic placeholder text", async ({
		page,
	}) => {
		test.skip(
			!twikooUiEnabled,
			"评论未启用或 provider 非 twikoo，跳过 twikoo UI 测试",
		);
		await mockTwikoo(page);
		await page.goto("/posts/guide/");
		await page.locator("#comments").scrollIntoViewIfNeeded();

		const textarea = page.locator(".tk-input textarea");
		await expect(textarea).toHaveAttribute(
			"placeholder",
			"Share your thoughts...",
		);
		const placeholderStyle = await textarea.evaluate((element) => {
			const styles = getComputedStyle(element, "::placeholder");
			return { color: styles.color, opacity: styles.opacity };
		});
		expect(placeholderStyle.color).not.toBe("rgba(0, 0, 0, 0)");
		expect(Number(placeholderStyle.opacity)).toBeLessThan(1);
	});

	test("comment loading uses the centered M3E indicator", async ({ page }) => {
		test.skip(
			!twikooUiEnabled,
			"评论未启用或 provider 非 twikoo，跳过 twikoo UI 测试",
		);
		await mockTwikoo(page);
		await page.goto("/posts/guide/");
		await page.locator("#comments").scrollIntoViewIfNeeded();
		const commentsContainer = page.locator(".tk-comments-container");
		const skeleton = commentsContainer.locator(":scope > .twikoo-skeleton");
		await expect(skeleton).toBeAttached();

		await commentsContainer.evaluate((element) => {
			const mask = element.querySelector<HTMLElement>(".el-loading-mask");
			mask?.style.removeProperty("display");
		});

		await expect(skeleton).toBeVisible();
		await expect(skeleton.locator(".m3-loading")).toBeVisible();
		await expect(skeleton.locator(".m3-loading path")).not.toHaveAttribute(
			"d",
			"",
		);
		await expect(page.locator(".el-loading-spinner")).toBeHidden();

		const [containerBox, indicatorBox] = await Promise.all([
			commentsContainer.boundingBox(),
			skeleton.locator(".m3-loading").boundingBox(),
		]);
		expect(containerBox).not.toBeNull();
		expect(indicatorBox).not.toBeNull();
		expect((indicatorBox?.x ?? 0) + (indicatorBox?.width ?? 0) / 2).toBeCloseTo(
			(containerBox?.x ?? 0) + (containerBox?.width ?? 0) / 2,
			0,
		);
		expect(
			(indicatorBox?.y ?? 0) + (indicatorBox?.height ?? 0) / 2,
		).toBeCloseTo((containerBox?.y ?? 0) + (containerBox?.height ?? 0) / 2, 0);
	});

	test("Twikoo hash actions preserve page scroll", async ({ page }) => {
		test.skip(
			!twikooUiEnabled,
			"评论未启用或 provider 非 twikoo，跳过 twikoo UI 测试",
		);
		await mockTwikoo(page);
		await page.goto("/posts/guide/");
		await page.locator("#comments").scrollIntoViewIfNeeded();
		await expect(page.locator(".tk-admin-entry")).toBeVisible();
		const scrollBeforeLike = await page.evaluate(() => window.scrollY);
		const like = await page.locator(".tk-like-action").boundingBox();
		expect(like).not.toBeNull();
		await page.mouse.click(
			(like?.x ?? 0) + (like?.width ?? 0) / 2,
			(like?.y ?? 0) + (like?.height ?? 0) / 2,
		);
		await expect(page.locator(".tk-like-action")).toHaveClass(/tk-liked/);
		expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(
			scrollBeforeLike,
			0,
		);

		const adminEntry = await page.locator(".tk-admin-entry").boundingBox();
		expect(adminEntry).not.toBeNull();
		await page.mouse.click(
			(adminEntry?.x ?? 0) + (adminEntry?.width ?? 0) / 2,
			(adminEntry?.y ?? 0) + (adminEntry?.height ?? 0) / 2,
		);
		await expect(page.locator(".tk-admin")).toHaveClass(/__show/);
		await expect(page.locator(".tk-admin-comment .tk-content")).toHaveCSS(
			"color",
			"rgb(255, 255, 255)",
		);

		const scrollBeforeClose = await page.evaluate(() => window.scrollY);
		const close = await page.locator(".tk-admin-close").boundingBox();
		expect(close).not.toBeNull();
		await page.mouse.click(
			(close?.x ?? 0) + (close?.width ?? 0) / 2,
			(close?.y ?? 0) + (close?.height ?? 0) / 2,
		);

		await expect(page.locator(".tk-admin")).not.toHaveClass(/__show/);
		await expect
			.poll(() => page.evaluate(() => window.scrollY))
			.toBeCloseTo(scrollBeforeClose, 0);
	});

	test("loadScriptOnce deduplicates script injection in browser", async ({
		page,
	}) => {
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });

		const result = await page.evaluate(async () => {
			// 动态引入 script-loader 模块
			const { loadScriptOnce } = await import("/src/utils/script-loader.ts");

			// Mock 创建一个测试用的 inline blob script URL
			const blob = new Blob(
				["window.__mockScriptLoaded = (window.__mockScriptLoaded || 0) + 1;"],
				{ type: "application/javascript" },
			);
			const blobUrl = URL.createObjectURL(blob);

			// 并发多次调用 loadScriptOnce
			await Promise.all([
				loadScriptOnce(blobUrl),
				loadScriptOnce(blobUrl),
				loadScriptOnce(blobUrl),
			]);

			const scripts = document.querySelectorAll(`script[src="${blobUrl}"]`);
			return {
				scriptTagCount: scripts.length,
				executionCount: (window as Window & { __mockScriptLoaded?: number })
					.__mockScriptLoaded,
			};
		});

		expect(result.scriptTagCount).toBe(1);
		expect(result.executionCount).toBe(1);
	});

	test("giscus mounts iframe with configured attributes into wrapper", async ({
		page,
	}) => {
		test.skip(
			!giscusUiEnabled,
			"评论未启用或 provider 非 giscus，跳过 giscus UI 测试",
		);
		await mockGiscus(page);
		await page.goto("/posts/guide/");
		await page.locator("#comments").scrollIntoViewIfNeeded();

		// 骨架屏先渲染，iframe 挂载后 :has() 隐藏骨架屏
		const wrapper = page.locator(".shirone-giscus-wrapper");
		await expect(wrapper).toHaveCount(1);
		const iframe = wrapper.locator("iframe.giscus-frame");
		await expect(iframe).toHaveCount(1);
		await expect(wrapper.locator(".giscus-skeleton")).toBeHidden();

		// data-* 配置经 client.js dataset 进入 widget URL：
		// 凭据对照 resolveCommentOptions 动态断言（不硬编码），lang/theme 断言 SSR 属性透传链。
		const options = resolveCommentOptions(commentConfig);
		const giscusOptions =
			options?.provider === "giscus" ? options.giscus : null;
		if (!giscusOptions) return;
		const widgetUrl = new URL(
			(await iframe.getAttribute("src")) ?? "",
			"https://giscus.app",
		);
		expect(widgetUrl.searchParams.get("repo")).toBe(giscusOptions.repo);
		expect(widgetUrl.searchParams.get("repoId")).toBe(giscusOptions.repoId);
		expect(widgetUrl.searchParams.get("categoryId")).toBe(
			giscusOptions.categoryId,
		);
		expect(widgetUrl.searchParams.get("mapping")).toBe(giscusOptions.mapping);
		if (giscusOptions.category) {
			expect(widgetUrl.searchParams.get("category")).toBe(
				giscusOptions.category,
			);
		}
		expect(widgetUrl.searchParams.get("lang")).toBe(
			await wrapper.getAttribute("data-giscus-lang"),
		);
		expect(widgetUrl.searchParams.get("theme")).toBe(
			await wrapper.getAttribute("data-giscus-theme-light"),
		);
	});

	test("giscus iframe theme follows site dark mode toggle", async ({
		page,
	}) => {
		test.skip(
			!giscusUiEnabled,
			"评论未启用或 provider 非 giscus，跳过 giscus UI 测试",
		);
		await mockGiscus(page);
		await page.goto("/posts/guide/");
		await page.locator("#comments").scrollIntoViewIfNeeded();

		const wrapper = page.locator(".shirone-giscus-wrapper");
		const iframe = wrapper.locator("iframe.giscus-frame");
		await expect(iframe).toHaveCount(1);

		// 切换暗色：applyThemeToDocument 派发 shirone:theme-change，
		// 组件向 iframe contentWindow 转发 giscus setConfig。
		await page.evaluate(() => {
			const state = window as Window & { __themeMessages?: unknown[] };
			// 命名常量：测试内一次性挂载 message 收集器（well-known window 扩展）
			const messages: unknown[] = [];
			state.__themeMessages = messages;
			window.addEventListener("message", (event) => {
				messages.push(event.data);
			});
			document.documentElement.classList.add("dark");
			window.dispatchEvent(
				new CustomEvent("shirone:theme-change", {
					detail: { isDark: true },
				}),
			);
		});

		// widget 页面回显 postMessage 为异步到达，轮询收集器直至出现 giscus setConfig
		let setConfig: unknown;
		await expect
			.poll(async () => {
				const forwarded = await page.evaluate(() => {
					const state = window as Window & { __themeMessages?: unknown[] };
					return state.__themeMessages ?? [];
				});
				setConfig = forwarded.find((message) => {
					if (typeof message !== "object" || message === null) return false;
					if (!("giscus" in message)) return false;
					const giscus: unknown = message.giscus;
					if (typeof giscus !== "object" || giscus === null) return false;
					return "setConfig" in giscus && typeof giscus.setConfig === "object";
				});
				return setConfig;
			})
			.toBeDefined();
	});

	test("giscus remounts into fresh wrapper after Swup navigation", async ({
		page,
	}) => {
		test.skip(
			!giscusUiEnabled,
			"评论未启用或 provider 非 giscus，跳过 giscus UI 测试",
		);
		await mockGiscus(page);
		await page.goto("/posts/guide/");
		await page.locator("#comments").scrollIntoViewIfNeeded();
		await expect(
			page.locator(".shirone-giscus-wrapper iframe.giscus-frame"),
		).toHaveCount(1);

		// 站内 Swup 导航离开再返回：新 wrapper 应重新挂载（client.js 一次性 IIFE，
		// 不能依赖 loadScriptOnce 的去重缓存）
		await page.goto("/", { waitUntil: "networkidle" });
		await page.goBack();
		await page.locator("#comments").scrollIntoViewIfNeeded();
		await expect(
			page.locator(".shirone-giscus-wrapper iframe.giscus-frame"),
		).toHaveCount(1);
	});
});
