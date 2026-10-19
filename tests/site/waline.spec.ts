import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	commentConfig,
	resolveCommentOptions,
} from "../../src/config/commentConfig";

const options = resolveCommentOptions(commentConfig);
const enabled = options?.provider === "waline";
const waline = commentConfig.waline;
if (!waline)
	throw new Error("The theme's default Waline configuration is missing");
// The emoji fixtures below stand in for the pack `emoji: true` resolves to.
const defaultEmoji = waline.emoji === true || waline.emoji === undefined;
const ARTICLE = "/posts/guide/";
const OTHER_ARTICLE = "/posts/markdown-extended/";
const WRAPPER = "shirone-waline";

const SDK = `
window.__walineLoads = (window.__walineLoads || 0) + 1;
window.__walineMounts = window.__walineMounts || [];
window.__walineDestroyed = window.__walineDestroyed || [];
window.__walineSubmissions = window.__walineSubmissions || [];
window.__walineUploads = window.__walineUploads || [];
window.Waline = {
	init(options) {
		window.__walineMounts.push({ ...options, el: undefined });
		const legacyIcon = '<svg viewBox="0 0 1024 1024" width="24" height="24" aria-hidden="true"><path d="M0 0h1024v1024H0z" fill="currentColor" /></svg>';
		// Waline 3.16's emoji map (getEmojisInfo) and parseEmoji, for inline packs.
		const emojiMap = {};
		for (const pack of Array.isArray(options.emoji) ? options.emoji : []) {
			if (typeof pack !== 'object') continue;
			for (const item of pack.items) emojiMap[(pack.prefix || '') + item] = (pack.folder ? pack.folder + '/' : '') + (pack.prefix || '') + item + (pack.type ? '.' + pack.type : '');
		}
		const parseEmoji = (text) => text.replace(/:(.+?):/gu, (placeholder, key) => emojiMap[key] ? '<img class="wl-emoji" src="' + emojiMap[key] + '" alt="' + key + '">' : placeholder);
		// The shared draft (useEditor) behind a v-model textarea that Vue patches a
		// microtask later, and only when the DOM value differs.
		let draft = localStorage.getItem('WALINE_COMMENT_BOX_EDITOR') || '';
		let textarea;
		const setDraft = (value) => {
			draft = value;
			localStorage.setItem('WALINE_COMMENT_BOX_EDITOR', value);
			queueMicrotask(() => {
				if (textarea && textarea.value !== draft) textarea.value = draft;
			});
		};
		window.__walineSetDraft = setDraft;
		const insert = (text) => {
			const start = textarea.selectionStart;
			const end = textarea.selectionEnd || 0;
			setDraft(textarea.value.slice(0, start) + text + textarea.value.slice(end));
			textarea.focus();
			textarea.selectionStart = start + text.length;
			textarea.selectionEnd = start + text.length;
		};
		const host = document.createElement('div');
		function renderForm(reply = false) {
			const form = document.createElement('div');
			form.className = 'wl-comment';
			form.innerHTML = '<form class="wl-panel"><div class="wl-header">'
				+ ['NickName', 'E-Mail', 'Website'].map((label, index) => '<div class="wl-header-item"><label for="waline-field-' + index + '">' + label + '</label><input type="' + (index === 1 ? 'email' : 'text') + '" class="wl-input" id="waline-field-' + index + '" /></div>').join('')
				+ '</div><textarea class="wl-editor" aria-label="Comment" placeholder="' + (reply ? '@Alice' : 'Share your thoughts...') + '"></textarea><div class="wl-preview" hidden>Preview</div><div class="wl-footer"><div class="wl-actions">'
				+ '<a class="wl-action" href="#comments" title="Markdown Guide">MD</a><button class="wl-action" type="button" title="Emoji">' + legacyIcon + '</button>'
				+ '<input id="wl-image-upload" type="file" hidden /><label class="wl-action" for="wl-image-upload" title="Upload image" aria-label="Upload image">' + legacyIcon + '</label>'
				+ '<button class="wl-action" type="button" title="Preview">' + legacyIcon + '</button></div><button class="wl-btn primary" type="button">Submit</button>'
				+ '<div class="wl-emoji-popup"><div class="wl-tab-wrapper">'
				+ Object.keys(emojiMap).map((key) => '<button type="button" title="' + key + '"><img class="wl-emoji" src="' + emojiMap[key] + '" alt="' + key + '" /></button>').join('')
				+ '</div></div></div></form>'
				+ (reply ? '<button class="wl-close" type="button" title="Cancel reply">' + legacyIcon + '</button>' : '');
			for (const control of form.querySelectorAll('button.wl-action')) {
				control.addEventListener('click', () => {
					// Vue rewrites the SDK class binding when the toggle changes.
					control.className = control.classList.contains('active') ? 'wl-action' : 'wl-action active';
					if (control.title === 'Preview') form.querySelector('.wl-preview').hidden = !control.classList.contains('active');
					if (control.title === 'Emoji') form.querySelector('.wl-emoji-popup').classList.toggle('display', control.classList.contains('active'));
				});
			}
			for (const button of form.querySelectorAll('.wl-tab-wrapper > button')) {
				button.addEventListener('click', () => insert(':' + button.title + ':'));
			}
			textarea = form.querySelector('textarea');
			textarea.value = draft;
			textarea.addEventListener('input', () => setDraft(textarea.value));
			textarea.addEventListener('keydown', (event) => {
				if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') window.__walineSubmissions.push(parseEmoji(draft));
			});
			textarea.addEventListener('paste', (event) => {
				const file = [...(event.clipboardData?.items || [])].find((item) => item.kind === 'file')?.getAsFile();
				if (!file) return;
				window.__walineUploads.push(file.name);
				const pending = '![Uploading ' + file.name + ']()';
				insert(pending);
				setTimeout(() => setDraft(draft.replace(pending, '\\r\\n![' + file.name + '](https://img.example/' + file.name + ')')), 50);
			});
			form.querySelector('.wl-close')?.addEventListener('click', () => renderForm());
			host.replaceChildren(form);
		}
		const reply = document.createElement('button');
		reply.type = 'button';
		reply.textContent = 'Reply';
		reply.addEventListener('click', () => renderForm(true));
		renderForm();
		const footer = document.createElement('div');
		footer.className = 'wl-meta-foot';
		if (!options.noRss) {
			footer.innerHTML = '<div class="wl-rss">'
				+ [['?path=' + encodeURIComponent(options.path), 'Subscribe to comments on this page'], ['', 'Subscribe to comments on this site']]
					.map(([query, label]) => '<a href="' + options.serverURL + '/api/comment/rss' + query + '" target="_blank" rel="noopener noreferrer" alt="' + label + '">' + legacyIcon + '<span>' + label + '</span></a>').join('')
				+ '</div>';
		}
		const reaction = document.createElement('div');
		if (options.reaction) {
			reaction.className = 'wl-reaction';
			reaction.innerHTML = '<ul class="wl-reaction-list">' + [9, 999].map(count => '<li class="wl-reaction-item"><div class="wl-reaction-img"><div class="wl-reaction-votes">' + count + '</div></div></li>').join('') + '</ul>';
			for (const item of reaction.querySelectorAll('.wl-reaction-item')) {
				item.addEventListener('click', async () => {
					const votes = item.querySelector('.wl-reaction-votes');
					if (!votes) return;
					const loading = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
					loading.setAttribute('class', 'wl-reaction-loading');
					loading.setAttribute('viewBox', '0 0 100 100');
					votes.replaceWith(loading);
					await fetch(options.serverURL.replace(/\\/$/, '') + '/api/article', { method: 'POST' });
					votes.textContent = Number(votes.textContent) + 1;
					loading.replaceWith(votes);
				});
			}
		}
		options.el.replaceChildren(reaction, reply, host, footer);
		return {
			destroy() {
				window.__walineDestroyed.push(options.path);
				options.el.replaceChildren();
			}
		};
	}
};
`;

// Waline's default `emoji: true` pack, served locally with a 1×1 image per item.
const EMOJI_PACK = "**/@waline/emojis@1.1.0/weibo/";
const EMOJI_INFO = {
	name: "Weibo",
	prefix: "weibo_",
	type: "png",
	icon: "smile",
	items: ["smile", "longing", "no_idea"],
};
const PIXEL = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	"base64",
);

async function mockWaline(page: Page) {
	await page.route(waline.scriptUrl, (route) =>
		route.fulfill({ contentType: "application/javascript", body: SDK }),
	);
	await page.route(`${EMOJI_PACK}info.json`, (route) =>
		route.fulfill({
			contentType: "application/json",
			body: JSON.stringify(EMOJI_INFO),
		}),
	);
	await page.route(`${EMOJI_PACK}*.png`, (route) =>
		route.fulfill({ contentType: "image/png", body: PIXEL }),
	);
	await page.route(waline.styleUrl, (route) =>
		route.fulfill({
			contentType: "text/css",
			body: `
			/* Waline 3.16.x selectors that this adapter overrides; resources load after theme CSS. */
			.wl-comment { position: relative; display: flex; }
			.wl-panel { width: 100%; background: var(--waline-bg-color); color: var(--waline-color); }
			.wl-header { display: flex; border-bottom: 2px dashed var(--waline-border-color); }
			.wl-header-item { display: flex; flex: 1; }
			.wl-header input { width: 0; flex: 1; }
			.wl-input:focus, .wl-editor:focus { background: var(--waline-bg-color-light); }
			@media (max-width: 580px) {
				.wl-header { display: block; }
				.wl-header-item:not(:last-child) { border-bottom: 2px dashed var(--waline-border-color); }
			}
			.wl-editor { display: block; background: var(--waline-bg-color); color: var(--waline-color); }
			.wl-footer, .wl-actions { display: flex; flex-wrap: wrap; }
			.wl-action { display: inline-flex; width: 1.5em; height: 1.5em; }
			.wl-close { position: absolute; top: -4px; inset-inline-end: -4px; }
			.wl-btn { background: var(--waline-theme-color); color: var(--waline-white); transition: color .4s; }
			.wl-meta-foot { display: flex; align-items: center; justify-content: space-between; }
			.wl-rss { display: flex; flex-wrap: nowrap; gap: 5px; overflow: hidden; max-width: 16px; transition: all .2s ease-in-out; }
			.wl-rss:hover { max-width: 100%; }
			.wl-rss > a { display: flex; flex-shrink: 0; gap: 2px; }
			.wl-rss span { color: var(--waline-light-grey); font-size: var(--waline-info-font-size); text-align: end; }
			.wl-reaction-list { display: flex; justify-content: center; gap: 16px; padding: 8px; list-style: none; }
			.wl-reaction-img { position: relative; width: 42px; height: 42px; }
			.wl-reaction-loading { position: absolute; inset-inline-end: -5px; top: -4px; width: 18px; height: 18px; }
			.wl-reaction-votes { position: absolute; inset-inline-end: -9px; top: -9px; min-width: 1em; padding: 2px; border: 1px solid var(--waline-theme-color); border-radius: 1em; font-size: .75em; line-height: 1; }
			.wl-editor { min-height: 8.75em; }
			.wl-emoji-popup { display: none; }
			.wl-emoji-popup.display { display: block; }
			.wl-emoji-popup .wl-emoji { width: 1.5em; height: 1.5em; }

			`,
		}),
	);
}

async function setRssEnabled(page: Page, enabled: boolean) {
	await page.route("**/posts/**", async (route) => {
		// Include Swup's fetch/XHR response as well as direct navigation documents.
		if (
			!["document", "fetch", "xhr"].includes(route.request().resourceType())
		) {
			await route.fallback();
			return;
		}
		const response = await route.fetch();
		const html = (await response.text()).replace(
			/(&quot;noRss&quot;:)(true|false)/,
			`$1${!enabled}`,
		);
		await route.fulfill({ response, body: html });
	});
}

async function settleTheme(page: Page) {
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.startsWith("#"),
	);
	await page.waitForFunction(() =>
		[...document.querySelectorAll<HTMLElement>(".onload-animation")].every(
			(el) => el.offsetParent === null || getComputedStyle(el).opacity === "1",
		),
	);
}

async function expectTokenColor(
	locator: Locator,
	property: "color" | "borderTopColor" | "backgroundColor",
	token: string,
) {
	await expect
		.poll(() =>
			locator.evaluate(
				(el, { property, token }) => {
					const reference = document.createElement("span");
					reference.style.color = `var(${token})`;
					el.parentElement?.append(reference);
					const matches =
						getComputedStyle(el)[property] ===
						getComputedStyle(reference).color;
					reference.remove();
					return matches;
				},
				{ property, token },
			),
		)
		.toBe(true);
}

async function mount(page: Page) {
	await page.locator(WRAPPER).scrollIntoViewIfNeeded();
	await expect(page.locator(WRAPPER)).toHaveAttribute(
		"data-waline-state",
		"ready",
	);
}

async function navigate(page: Page, path: string) {
	await page.waitForFunction(() => Boolean(window.swup));
	await page.evaluate(
		(target) =>
			new Promise<void>((resolve) => {
				document.addEventListener("swup:page:view", () => resolve(), {
					once: true,
				});
				void window.swup.navigate(target);
			}),
		path,
	);
	await page.waitForFunction(
		() => !document.documentElement.classList.contains("is-changing"),
	);
	await expect(page).toHaveURL(new RegExp(`${path}$`));
	await expect(page.locator("#swup-container")).toBeAttached();
}

async function snapshot(page: Page) {
	return page.evaluate(() => {
		const state = window as Window & {
			__walineLoads?: number;
			__walineMounts?: {
				path: string;
				lang: string;
				pageview: boolean;
				emoji?: unknown;
			}[];
			__walineDestroyed?: string[];
			__walineSubmissions?: string[];
			__walineUploads?: string[];
		};
		return {
			loads: state.__walineLoads ?? 0,
			mounts: state.__walineMounts ?? [],
			destroyed: state.__walineDestroyed ?? [],
			submissions: state.__walineSubmissions ?? [],
			uploads: state.__walineUploads ?? [],
		};
	});
}

test("pages without comments make no Waline requests or DOM", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("@waline/")) requests.push(request.url());
	});
	await page.goto("/");
	await expect(page.locator(WRAPPER)).toHaveCount(0);
	await expect(page.locator("[data-waline-style]")).toHaveCount(0);
	expect(requests).toEqual([]);
});

test("disabled comments leave article DOM and resources unchanged", async ({
	page,
}) => {
	test.skip(options !== null, "Run with comments disabled or incomplete");
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("@waline/")) requests.push(request.url());
	});
	await page.goto(ARTICLE);
	await expect(page.locator("#comments")).toHaveCount(0);
	await expect(page.locator(WRAPPER)).toHaveCount(0);
	expect(requests).toEqual([]);
});

test.describe("Waline enabled", () => {
	test.skip(
		!enabled,
		"Enable Waline with a test serverURL to exercise the provider",
	);
	test.beforeEach(async ({ page }) => {
		await mockWaline(page);
	});

	test("loads JS and CSS only near the viewport and mounts once", async ({
		page,
	}) => {
		const resources: string[] = [];
		const packs: string[] = [];
		page.on("request", (request) => {
			if ([waline.scriptUrl, waline.styleUrl].includes(request.url()))
				resources.push(request.url());
			if (request.url().endsWith("/info.json")) packs.push(request.url());
		});
		await page.goto(ARTICLE);
		if (commentConfig.lazy) {
			expect(resources).toEqual([]);
			expect(packs).toEqual([]);
		}
		await mount(page);
		await page.evaluate(() => {
			document.dispatchEvent(new Event("swup:content:replace"));
			document.dispatchEvent(new Event("swup:page:view"));
		});
		expect(resources.sort()).toEqual(
			[waline.scriptUrl, waline.styleUrl].sort(),
		);
		const state = await snapshot(page);
		expect(state.loads).toBe(1);
		expect(state.mounts).toHaveLength(1);
		expect(state.mounts[0]).toMatchObject({
			path: ARTICLE,
			pageview: false,
			...(waline.locale ? { locale: waline.locale } : {}),
		});
		// Presets are fetched once by the theme and handed over as inline packs.
		if (defaultEmoji) {
			expect(packs).toHaveLength(1);
			expect(state.mounts[0].emoji).toEqual([
				{ folder: "//unpkg.com/@waline/emojis@1.1.0/weibo", ...EMOJI_INFO },
			]);
		} else if (waline.emoji === false) {
			expect(state.mounts[0].emoji).toBe(false);
		}
		expect(state.mounts[0]).not.toHaveProperty("placeholder");
		await expect(page.locator(".waline-loading")).toBeHidden();
	});

	test("loads immediately when lazy is false", async ({ page }) => {
		await page.route("**/posts/guide/", async (route) => {
			if (!route.request().isNavigationRequest()) {
				await route.continue();
				return;
			}
			const response = await route.fetch();
			const html = (await response.text()).replace(
				'data-waline-lazy="true"',
				'data-waline-lazy="false"',
			);
			await route.fulfill({ response, body: html });
		});
		await page.goto(ARTICLE);
		await expect(page.locator(WRAPPER)).toHaveAttribute(
			"data-waline-state",
			"ready",
		);
		expect((await snapshot(page)).mounts).toHaveLength(1);
	});

	test("RSS disabled leaves no subscription controls", async ({ page }) => {
		await setRssEnabled(page, false);
		await page.goto(ARTICLE);
		await mount(page);
		await expect(page.locator(".wl-rss")).toHaveCount(0);
	});

	test("upload control is keyboard accessible", async ({ page }) => {
		await page.goto(ARTICLE);
		await mount(page);
		const chooser = page.waitForEvent("filechooser");
		await page.getByRole("button", { name: "Upload image" }).press("Enter");
		expect(await (await chooser).element().getAttribute("type")).toBe("file");
	});

	for (const width of [390, 1280]) {
		test.describe(`editor controls at ${width}px`, () => {
			test.use({ viewport: { width, height: 900 }, hasTouch: width === 390 });

			test("RSS subscriptions are visible, themed and keyboard accessible", async ({
				page,
			}) => {
				await setRssEnabled(page, true);
				await page.addInitScript(() => localStorage.setItem("theme", "auto"));
				await page.goto(ARTICLE);
				await mount(page);
				await settleTheme(page);
				const links = page.locator(".wl-meta-foot .wl-rss > a");
				await expect(links).toHaveCount(2);
				for (const dark of [false, true]) {
					await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
					await expect(page.locator("html")).toHaveClass(
						dark ? /dark/ : /^(?!.*\bdark\b)/,
					);
					for (const link of await links.all()) {
						await expect(
							link.locator("svg").filter({ visible: true }),
						).toHaveCount(1);
						await expect(link.locator(".waline-icon")).toHaveAttribute(
							"viewBox",
							"0 0 24 24",
						);
						await expectTokenColor(link, "color", "--primary");
						const box = await link.boundingBox();
						expect(box?.height).toBeGreaterThanOrEqual(width === 390 ? 48 : 40);
						expect(box?.x).toBeGreaterThanOrEqual(0);
						expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
							width,
						);
					}
					const result = await new AxeBuilder({ page })
						.include("#comments")
						.analyze();
					expect(result.violations).toEqual([]);
				}
				const destinations = [
					`${waline.serverURL}/api/comment/rss?path=${encodeURIComponent(ARTICLE)}`,
					`${waline.serverURL}/api/comment/rss`,
				];
				await page
					.context()
					.route("**/api/comment/rss*", (route) =>
						route.fulfill({ contentType: "text/plain", body: "RSS fixture" }),
					);
				await links.first().focus();
				for (const [index, destination] of destinations.entries()) {
					await expect(links.nth(index)).toBeFocused();
					await expect(links.nth(index)).toHaveCSS("outline-style", "solid");
					const popup = page.waitForEvent("popup");
					await links.nth(index).press("Enter");
					const feed = await popup;
					await expect(feed).toHaveURL(destination);
					await feed.close();
					if (index === 0) await page.keyboard.press("Tab");
				}
				await navigate(page, "/");
				await navigate(page, ARTICLE);
				await mount(page);
				await expect(links.locator(".waline-icon")).toHaveCount(2);
			});

			test("filled fields float labels only when focused or populated and keep the editor borderless", async ({
				page,
			}) => {
				await page.addInitScript(() => localStorage.setItem("theme", "auto"));
				await page.goto(ARTICLE);
				await mount(page);
				await settleTheme(page);
				for (const dark of [false, true]) {
					await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
					await expect(page.locator("html")).toHaveClass(
						dark ? /dark/ : /^(?!.*\bdark\b)/,
					);
					for (const field of await page.locator(".wl-header-item").all()) {
						const input = field.locator("input");
						const label = field.locator("label");
						await input.fill("");
						await input.blur();
						await expect
							.poll(() =>
								label.evaluate((el) => {
									const label = el.getBoundingClientRect();
									const parent = el.parentElement;
									if (!parent)
										throw new Error("The field label must have a parent");
									const field = parent.getBoundingClientRect();
									return Math.abs(
										label.y + label.height / 2 - field.y - field.height / 2,
									);
								}),
							)
							.toBeLessThan(1);
						const emptyFont = await label.evaluate((el) =>
							Number.parseFloat(getComputedStyle(el).fontSize),
						);
						const before = await field.boundingBox();
						await input.focus();
						await expect
							.poll(() =>
								label.evaluate((el) =>
									Number.parseFloat(getComputedStyle(el).fontSize),
								),
							)
							.toBeLessThan(emptyFont);
						await expectTokenColor(label, "color", "--primary");
						await expect
							.poll(() =>
								field.evaluate((el) => getComputedStyle(el, "::after").opacity),
							)
							.toBe("1");
						await expect(input).toHaveCSS(
							"background-color",
							"rgba(0, 0, 0, 0)",
						);
						await expect(field).toHaveCSS("border-top-width", "0px");
						expect(await field.boundingBox()).toEqual(before);
						// Invalid email and direct SDK value restoration must still float the label.
						await input.fill("saved-value");
						await input.blur();
						await expect
							.poll(() =>
								label.evaluate((el) =>
									Number.parseFloat(getComputedStyle(el).fontSize),
								),
							)
							.toBeLessThan(emptyFont);
						await input.evaluate((el: HTMLInputElement) => {
							el.value = "";
						});
						await expect
							.poll(() =>
								label.evaluate((el) =>
									Number.parseFloat(getComputedStyle(el).fontSize),
								),
							)
							.toBe(emptyFont);
						await input.evaluate((el: HTMLInputElement) => {
							el.value = "restored";
						});
						await expect
							.poll(() =>
								label.evaluate((el) =>
									Number.parseFloat(getComputedStyle(el).fontSize),
								),
							)
							.toBeLessThan(emptyFont);
						await input.fill("");
						await input.blur();
					}
					const editor = page.getByRole("textbox", {
						name: "Comment",
						exact: true,
					});
					await expect(editor).toHaveCSS("border-top-width", "0px");
					await expect(editor).toHaveCSS("box-shadow", "none");
					await expect(editor).toHaveCSS("background-size", "0px 2px");
					await expectTokenColor(
						editor,
						"backgroundColor",
						"--field-filled-bg",
					);
					await editor.focus();
					await expect(editor).not.toHaveCSS("background-size", "0px 2px");
					await expect(editor).toHaveCSS("border-top-width", "0px");
					const result = await new AxeBuilder({ page })
						.include("#comments")
						.analyze();
					expect(result.violations).toEqual([]);
				}
				const rows = await page
					.locator(".wl-header-item")
					.evaluateAll((fields) =>
						fields.map((field) => field.getBoundingClientRect().top),
					);
				if (width === 390) {
					expect(rows[1]).toBeGreaterThan(rows[0]);
					expect(rows[2]).toBeGreaterThan(rows[1]);
				} else {
					expect(rows).toEqual([rows[0], rows[0], rows[0]]);
				}
				const box = await page.locator(".wl-panel").boundingBox();
				expect(box).not.toBeNull();
				expect(box?.x).toBeGreaterThanOrEqual(0);
				expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
			});

			test("reaction badge and spinner keep their center through count changes in both directions", async ({
				page,
			}) => {
				test.skip(
					!waline.reaction,
					"Enable reactions to verify their loading state",
				);
				let release = () => {};
				let gate = Promise.resolve();
				await page.route("**/api/article", async (route) => {
					await gate;
					await route.fulfill({
						contentType: "application/json",
						body: '{"errno":0,"data":[]}',
					});
				});
				await page.goto(ARTICLE);
				await mount(page);
				await settleTheme(page);
				const center = (locator: Locator) =>
					locator.evaluate((el) => {
						const box = el.getBoundingClientRect();
						return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
					});
				try {
					for (const direction of ["ltr", "rtl"]) {
						await page.evaluate((dir) => {
							document.documentElement.dir = dir;
						}, direction);
						for (const item of await page.locator(".wl-reaction-item").all()) {
							await item.scrollIntoViewIfNeeded();
							const badge = item.locator(".wl-reaction-votes");
							const count = Number(await badge.textContent());
							const before = await center(badge);
							gate = new Promise((resolve) => {
								release = resolve;
							});
							await item.click();
							const spinner = item.locator(".wl-reaction-loading");
							await expect(spinner).toBeVisible();
							expect(await center(spinner)).toEqual(before);
							release();
							await expect(badge).toHaveText(String(count + 1));
							expect(await center(badge)).toEqual(before);
						}
					}
				} finally {
					release();
				}
			});

			test("toolbar icons and reply controls retain styling, semantics and keyboard actions after rerenders", async ({
				page,
			}) => {
				const iconRequests: string[] = [];
				page.on("request", (request) => {
					if (request.url().includes("api.iconify.design"))
						iconRequests.push(request.url());
				});
				await page.goto(ARTICLE);
				await mount(page);
				await settleTheme(page);
				for (const name of ["Emoji", "Upload image", "Preview"]) {
					const button = page.getByRole("button", { name, exact: true });
					await expect(
						button.locator("svg").filter({ visible: true }),
					).toHaveCount(1);
					await expect(button.locator(".waline-icon")).toHaveAttribute(
						"viewBox",
						"0 0 24 24",
					);
					const box = await button.boundingBox();
					expect(box?.width).toBeGreaterThanOrEqual(width === 390 ? 48 : 40);
					expect(box?.height).toBeGreaterThanOrEqual(width === 390 ? 48 : 40);
				}
				const emoji = page.getByRole("button", { name: "Emoji", exact: true });
				await emoji.press("Enter");
				await expect(emoji).toHaveAttribute("aria-pressed", "true");
				await expect(emoji).toHaveClass(/m3-state-layer/);
				await expectTokenColor(
					emoji,
					"backgroundColor",
					"--secondary-container",
				);
				await emoji.press("Space");
				await expect(emoji).toHaveAttribute("aria-pressed", "false");
				const preview = page.getByRole("button", {
					name: "Preview",
					exact: true,
				});
				await preview.press("Enter");
				await expect(page.locator(".wl-preview")).toBeVisible();
				await expect(preview).toHaveAttribute("aria-pressed", "true");
				await expect(preview).toHaveClass(/m3-state-layer/);

				for (let round = 0; round < 2; round++) {
					await page
						.getByRole("button", { name: "Reply", exact: true })
						.click();
					const close = page.getByRole("button", {
						name: "Cancel reply",
						exact: true,
					});
					await expect(close.locator(".waline-icon")).toBeVisible();
					await expect(
						close.locator("svg").filter({ visible: true }),
					).toHaveCount(1);
					await expect(page.locator(".waline-upload")).toHaveCount(1);
					await expectTokenColor(
						close,
						"backgroundColor",
						"--secondary-container",
					);
					await expectTokenColor(close, "color", "--on-secondary-container");
					// The reply form's textarea gets its own emoji input; the old one is gone.
					if (defaultEmoji)
						await expect(page.locator(".emoji-input")).toHaveAttribute(
							"aria-placeholder",
							"@Alice",
						);
					const buttonBox = await close.boundingBox();
					const panelBox = await page.locator(".wl-panel").boundingBox();
					expect(
						(buttonBox?.y ?? 0) + (buttonBox?.height ?? 0),
					).toBeLessThanOrEqual(panelBox?.y ?? 0);
					const chooser = page.waitForEvent("filechooser");
					await page
						.getByRole("button", { name: "Upload image" })
						.press("Enter");
					expect(await (await chooser).element().getAttribute("type")).toBe(
						"file",
					);
					await close.press("Enter");
					await expect(close).toHaveCount(0);
					await expect(page.locator(".waline-upload")).toHaveCount(1);
					if (defaultEmoji)
						await expect(page.locator(".emoji-input")).toHaveAttribute(
							"aria-placeholder",
							"Share your thoughts...",
						);
				}
				expect(iconRequests).toEqual([]);
			});
		});
	}

	test.describe("emoji input", () => {
		test.skip(!defaultEmoji, "The emoji fixtures mirror Waline's default pack");

		const editor = (page: Page) =>
			page.getByRole("textbox", { name: "Comment", exact: true });
		const stored = (page: Page) =>
			page
				.locator("textarea.wl-editor")
				.evaluate((element: HTMLTextAreaElement) => element.value);
		// Icons read as [label], so assertions show what a sighted reader sees; a
		// last newline is the browser's placeholder for an empty final line.
		const shown = (page: Page) =>
			editor(page).evaluate((element) =>
				[...element.childNodes]
					.map((node) =>
						node instanceof HTMLImageElement
							? `[${node.alt}]`
							: (node.textContent ?? ""),
					)
					.join("")
					.replace(/\n$/u, ""),
			);
		const pick = async (page: Page, key: string) => {
			const popup = page.locator(".wl-emoji-popup");
			if (!(await popup.isVisible()))
				await page.getByRole("button", { name: "Emoji", exact: true }).click();
			await popup.locator(`button[title="${key}"]`).click();
		};
		const paste = (page: Page, text: string) =>
			editor(page).evaluate((element, text) => {
				const data = new DataTransfer();
				data.setData("text/plain", text);
				element.dispatchEvent(
					new ClipboardEvent("paste", {
						clipboardData: data,
						bubbles: true,
						cancelable: true,
					}),
				);
			}, text);

		test("picker inserts icons at the caret while Waline keeps shortcodes", async ({
			page,
		}) => {
			await page.goto(ARTICLE);
			await mount(page);
			const input = editor(page);
			await expect(input).toBeVisible();
			await expect(input).toHaveAttribute("aria-multiline", "true");
			await expect(page.locator("textarea.wl-editor")).toBeHidden();
			// Events bridged to the hidden textarea must not reach the page twice.
			await page.evaluate(() => {
				const state = window as Window & { __bridged?: number };
				state.__bridged = 0;
				for (const type of ["input", "keydown"])
					document.addEventListener(type, (event) => {
						if (event.target instanceof HTMLTextAreaElement)
							state.__bridged = (state.__bridged ?? 0) + 1;
					});
			});
			await input.click();
			await page.keyboard.type("Hi ");
			await pick(page, "weibo_longing");
			await pick(page, "weibo_longing");
			await expect(input).toBeFocused();
			await page.keyboard.type(" there");
			expect(await shown(page)).toBe("Hi [longing][longing] there");
			expect(await stored(page)).toBe(
				"Hi :weibo_longing::weibo_longing: there",
			);
			expect(
				await page.evaluate(() =>
					localStorage.getItem("WALINE_COMMENT_BOX_EDITOR"),
				),
			).toBe("Hi :weibo_longing::weibo_longing: there");
			expect(
				await page.evaluate(
					() => (window as Window & { __bridged?: number }).__bridged,
				),
			).toBe(0);
			await expect(input.locator("img").first()).toHaveAttribute(
				"referrerpolicy",
				"no-referrer",
			);
			// An icon is one caret step, Backspace removes it whole, and undo restores it.
			for (const _ of " there") await page.keyboard.press("ArrowLeft");
			await page.keyboard.press("Backspace");
			expect(await stored(page)).toBe("Hi :weibo_longing: there");
			await page.keyboard.press("ControlOrMeta+z");
			expect(await stored(page)).toBe(
				"Hi :weibo_longing::weibo_longing: there",
			);
			// Copying hands out the stored text rather than image markup.
			const copied = await input.evaluate((element) => {
				getSelection()?.selectAllChildren(element);
				const data = new DataTransfer();
				element.dispatchEvent(
					new ClipboardEvent("copy", {
						clipboardData: data,
						bubbles: true,
						cancelable: true,
					}),
				);
				return data.getData("text/plain");
			});
			expect(copied).toBe("Hi :weibo_longing::weibo_longing: there");
		});

		test("restored, typed and pasted text shows icons exactly where Waline renders them", async ({
			page,
		}) => {
			const edited =
				'<img class="wl-emoji" src="//unpkg.com/@waline/emojis@1.1.0/weibo/weibo_no_idea.png" alt="weibo_no_idea">';
			await page.addInitScript((draft) => {
				if (sessionStorage.getItem("waline-draft")) return;
				sessionStorage.setItem("waline-draft", "seeded");
				localStorage.setItem("WALINE_COMMENT_BOX_EDITOR", draft);
			}, `Saved :weibo_smile:\n${edited}`);
			await page.goto(ARTICLE);
			await mount(page);
			const input = editor(page);
			// Edit mode and drafts carry both the shortcode and Waline's element.
			expect(await shown(page)).toBe("Saved [smile]\n[no idea]");
			await input.click();
			await page.keyboard.press("ControlOrMeta+End");
			await page.keyboard.press("Enter");
			await page.keyboard.type("typed :weibo_longing: ok");
			await paste(page, " <b>raw</b> :weibo_smile:\n");
			expect(await shown(page)).toBe(
				"Saved [smile]\n[no idea]\ntyped [longing] ok <b>raw</b> [smile]\n",
			);
			// Waline pairs the colon in "Note:" with the shortcode's own, so a typed
			// shortcode stays text there, while a picked emoji is stored as the element.
			await page.keyboard.type("Note: :weibo_smile: ");
			await pick(page, "weibo_longing");
			expect(await shown(page)).toBe(
				"Saved [smile]\n[no idea]\ntyped [longing] ok <b>raw</b> [smile]\nNote: :weibo_smile: [longing]",
			);
			expect(await stored(page)).toBe(
				`Saved :weibo_smile:\n${edited}\ntyped :weibo_longing: ok <b>raw</b> :weibo_smile:\nNote: :weibo_smile: <img class="wl-emoji" src="//unpkg.com/@waline/emojis@1.1.0/weibo/weibo_longing.png" alt="weibo_longing">`,
			);
			await input.press("ControlOrMeta+Enter");
			const [submitted] = (await snapshot(page)).submissions;
			expect(submitted.match(/<img class="wl-emoji"/gu)).toHaveLength(5);
			expect(submitted).toContain("Note: :weibo_smile: <img");
			expect(await stored(page)).not.toContain("\n\n");
			await page.reload();
			await mount(page);
			expect(await shown(page)).toBe(
				"Saved [smile]\n[no idea]\ntyped [longing] ok <b>raw</b> [smile]\nNote: :weibo_smile: [longing]",
			);
		});

		test("Waline's own writes re-render the editor and keep the caret", async ({
			page,
		}) => {
			await page.goto(ARTICLE);
			await mount(page);
			const input = editor(page);
			await page.evaluate(() =>
				(
					window as Window & { __walineSetDraft?: (value: string) => void }
				).__walineSetDraft?.(":weibo_smile: edit"),
			);
			await expect.poll(() => shown(page)).toBe("[smile] edit");
			// Clearing after submit brings back the localized hint.
			await page.evaluate(() =>
				(
					window as Window & { __walineSetDraft?: (value: string) => void }
				).__walineSetDraft?.(""),
			);
			await expect.poll(() => shown(page)).toBe("");
			await expect(input).toHaveAttribute(
				"aria-placeholder",
				"Share your thoughts...",
			);
			expect(
				await input.evaluate((element) =>
					getComputedStyle(element, "::before").getPropertyValue("content"),
				),
			).toBe('"Share your thoughts..."');
			// Pasted images go to Waline's uploader, which swaps its placeholder.
			await input.click();
			await page.keyboard.type("pic ");
			await input.evaluate(
				(element, bytes) => {
					const data = new DataTransfer();
					data.items.add(
						new File([new Uint8Array(bytes)], "dot.png", { type: "image/png" }),
					);
					element.dispatchEvent(
						new ClipboardEvent("paste", {
							clipboardData: data,
							bubbles: true,
							cancelable: true,
						}),
					);
				},
				[...PIXEL],
			);
			await expect
				.poll(() => stored(page))
				.toBe("pic \n![dot.png](https://img.example/dot.png)");
			expect((await snapshot(page)).uploads).toEqual(["dot.png"]);
			await expect(input).toBeFocused();
			await page.keyboard.type("!");
			expect(await stored(page)).toBe(
				"pic \n![dot.png](https://img.example/dot.png)!",
			);
		});

		test("keyboard picks return to the editor, icons keep the line height, and axe passes", async ({
			page,
		}) => {
			await page.addInitScript(() => localStorage.setItem("theme", "auto"));
			await page.goto(ARTICLE);
			await mount(page);
			await settleTheme(page);
			const input = editor(page);
			await input.focus();
			await page.keyboard.type("k ");
			await page.getByRole("button", { name: "Emoji", exact: true }).focus();
			await page.keyboard.press("Enter");
			await page.locator('.wl-emoji-popup button[title="weibo_smile"]').focus();
			await page.keyboard.press("Enter");
			await expect(input).toBeFocused();
			expect(await stored(page)).toBe("k :weibo_smile:");
			await page.keyboard.type("\nnext");
			const lineTops = (text: string) =>
				input.evaluate((element, text) => {
					const node = [...element.childNodes].find((child) =>
						child.textContent?.includes(text),
					);
					const range = document.createRange();
					range.selectNodeContents(node ?? element);
					const rects = [...range.getClientRects()];
					return (rects.at(-1)?.top ?? 0) - element.getBoundingClientRect().top;
				}, text);
			const withIcon = await lineTops("next");
			const glyph = input.locator("img");
			await expect(glyph).toHaveCSS("height", "20px");
			await page.keyboard.press("ArrowUp");
			await page.keyboard.press("End");
			await page.keyboard.press("Backspace");
			expect(await stored(page)).toBe("k \nnext");
			expect(await lineTops("next")).toBe(withIcon);
			for (const dark of [false, true]) {
				await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
				await expect(page.locator("html")).toHaveClass(
					dark ? /dark/ : /^(?!.*\bdark\b)/,
				);
				await expectTokenColor(input, "color", "--on-surface");
				const result = await new AxeBuilder({ page })
					.include("#comments")
					.analyze();
				expect(result.violations).toEqual([]);
			}
		});

		test("emoji: false keeps Waline's textarea and fetches no pack", async ({
			page,
		}) => {
			const packs: string[] = [];
			page.on("request", (request) => {
				if (request.url().endsWith("/info.json")) packs.push(request.url());
			});
			// Only the document: Swup prefetches must not outlive the test in a handler.
			await page.route("**/posts/guide/", async (route) => {
				if (!route.request().isNavigationRequest()) {
					await route.fallback();
					return;
				}
				const response = await route.fetch();
				const html = (await response.text()).replace(
					/(&quot;emoji&quot;:)true/u,
					"$1false",
				);
				await route.fulfill({ response, body: html });
			});
			await page.goto(ARTICLE);
			await mount(page);
			await expect(page.locator(".emoji-input")).toHaveCount(0);
			await expect(page.locator("textarea.wl-editor")).toBeVisible();
			expect((await snapshot(page)).mounts[0].emoji).toBe(false);
			expect(packs).toEqual([]);
		});

		test("a failing pack leaves Waline its preset and the plain textarea", async ({
			page,
		}) => {
			await page.route(`${EMOJI_PACK}info.json`, (route) =>
				route.fulfill({ status: 503, body: "" }),
			);
			await page.goto(ARTICLE);
			await mount(page);
			await expect(page.locator(".emoji-input")).toHaveCount(0);
			await expect(page.locator("textarea.wl-editor")).toBeVisible();
			expect((await snapshot(page)).mounts[0].emoji).toEqual([
				"//unpkg.com/@waline/emojis@1.1.0/weibo",
			]);
		});
	});

	for (const resource of ["scriptUrl", "styleUrl"] as const) {
		test(`recovers from ${resource} failure through the retry button`, async ({
			page,
		}) => {
			let failed = false;
			await page.route(waline[resource], async (route) => {
				if (!failed) {
					failed = true;
					await route.abort();
				} else {
					await route.fallback();
				}
			});
			await page.goto(ARTICLE);
			await page.locator(WRAPPER).scrollIntoViewIfNeeded();
			await expect(page.locator(WRAPPER)).toHaveAttribute(
				"data-waline-state",
				"error",
			);
			await expect(page.locator(".waline-loading")).toBeHidden();
			await page.locator(".waline-retry").click();
			await expect(page.locator(WRAPPER)).toHaveAttribute(
				"data-waline-state",
				"ready",
			);
			expect((await snapshot(page)).mounts).toHaveLength(1);
		});
	}

	test("destroys old instances and remounts correct paths through real Swup navigation", async ({
		page,
	}) => {
		await page.goto("/");
		await navigate(page, ARTICLE);
		await mount(page);
		await navigate(page, OTHER_ARTICLE);
		await mount(page);
		await navigate(page, "/");
		await expect(page.locator(WRAPPER)).toHaveCount(0);
		await expect(page.locator("[data-waline-style]")).toHaveCount(0);
		await navigate(page, ARTICLE);
		await mount(page);
		await expect(page.locator(".waline-upload")).toHaveCount(1);
		await expect(page.locator(".wl-actions .waline-icon")).toHaveCount(3);
		if (defaultEmoji) await expect(page.locator(".emoji-input")).toHaveCount(1);
		const state = await snapshot(page);
		expect(state.loads).toBe(1);
		expect(state.mounts.map((item) => item.path)).toEqual([
			ARTICLE,
			OTHER_ARTICLE,
			ARTICLE,
		]);
		expect(state.destroyed).toEqual([ARTICLE, OTHER_ARTICLE]);
	});

	test("ignores late SDK completion after leaving a page", async ({ page }) => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route(waline.scriptUrl, async (route) => {
			await gate;
			await route.fulfill({ contentType: "application/javascript", body: SDK });
		});
		await page.goto(ARTICLE);
		const started = page.waitForRequest(waline.scriptUrl);
		await page.locator(WRAPPER).scrollIntoViewIfNeeded();
		await started;
		await navigate(page, "/");
		release();
		await expect.poll(async () => (await snapshot(page)).loads).toBe(1);
		expect((await snapshot(page)).mounts).toEqual([]);
		await expect(page.locator("[data-waline-style]")).toHaveCount(0);
		await navigate(page, OTHER_ARTICLE);
		await mount(page);
		expect((await snapshot(page)).mounts.map((item) => item.path)).toEqual([
			OTHER_ARTICLE,
		]);
	});

	test("follows theme tokens, fits mobile and respects reduced motion", async ({
		page,
	}) => {
		await page.addInitScript(() => localStorage.setItem("theme", "auto"));
		await page.goto(ARTICLE);
		await mount(page);
		await page.waitForFunction(() =>
			document.documentElement.style
				.getPropertyValue("--mc-primary")
				.startsWith("#"),
		);
		await page.waitForFunction(() =>
			[...document.querySelectorAll(".onload-animation")].every(
				(el) =>
					(el as HTMLElement).offsetParent === null ||
					getComputedStyle(el).opacity === "1",
			),
		);
		for (const dark of [false, true]) {
			await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
			await expect
				.poll(() =>
					page.evaluate(() =>
						document.documentElement.classList.contains("dark"),
					),
				)
				.toBe(dark);
			await expect
				.poll(() =>
					page.locator(".wl-panel").evaluate((el) => {
						const expected = document.createElement("span");
						expected.style.backgroundColor = "var(--card-bg)";
						el.append(expected);
						const matches =
							getComputedStyle(el).backgroundColor ===
							getComputedStyle(expected).backgroundColor;
						expected.remove();
						return matches;
					}),
				)
				.toBe(true);
			const result = await new AxeBuilder({ page })
				.include("#comments")
				.analyze();
			expect(result.violations).toEqual([]);
		}
		await page.setViewportSize({ width: 390, height: 844 });
		const box = await page.locator(WRAPPER).boundingBox();
		expect(box).not.toBeNull();
		if (!box) throw new Error("Waline must have a visible layout box");
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(390);
		await page.emulateMedia({ reducedMotion: "reduce" });
		await expect(page.locator(".wl-btn")).toHaveCSS(
			"transition-duration",
			"0s",
		);
		await page.emulateMedia({ reducedMotion: "no-preference" });
		await page.evaluate(() =>
			document.documentElement.classList.add("motion-reduced"),
		);
		await expect(page.locator(".wl-btn")).toHaveCSS(
			"transition-duration",
			"0s",
		);
		expect((await snapshot(page)).mounts).toHaveLength(1);
	});
});

test.describe("Waline without JavaScript", () => {
	test.skip(!enabled, "Enable Waline to verify its noscript fallback");
	test.use({ javaScriptEnabled: false });
	test("shows a localized fallback without fetching the SDK", async ({
		page,
	}) => {
		const resources: string[] = [];
		page.on("request", (request) => {
			if ([waline.scriptUrl, waline.styleUrl].includes(request.url()))
				resources.push(request.url());
		});
		await page.goto(ARTICLE);
		await expect(page.locator(".waline-noscript")).toBeVisible();
		await expect(page.locator(".waline-loading")).toBeHidden();
		expect(resources).toEqual([]);
	});
});

test("Waline script timeout clears loading and permits retry", async ({
	page,
}) => {
	test.skip(!enabled, "Enable Waline to verify loading timeouts");
	await mockWaline(page);
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let first = true;
	await page.route(waline.scriptUrl, async (route) => {
		if (first) {
			first = false;
			await gate;
		}
		await route.fallback();
	});
	try {
		await page.goto(ARTICLE, { waitUntil: "domcontentloaded" });
		await page.locator(WRAPPER).scrollIntoViewIfNeeded();
		await expect(page.locator(WRAPPER)).toHaveAttribute(
			"data-waline-state",
			"error",
			{ timeout: 12_000 },
		);
		await expect(page.locator(".waline-loading")).toBeHidden();
		release();
		await page.locator(".waline-retry").click();
		await expect(page.locator(WRAPPER)).toHaveAttribute(
			"data-waline-state",
			"ready",
		);
		expect((await snapshot(page)).mounts).toHaveLength(1);
	} finally {
		release();
	}
});
