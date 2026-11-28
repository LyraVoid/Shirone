import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { siteConfig } from "../src/config/siteConfig.ts";
import { i18n, translations } from "../src/i18n/translation.ts";

// I18nKey 是 TS enum（node strip-only 模式读不了），这里直接用其字符串值。
const KEY_TAGS = "tags";
const KEY_CATEGORIES = "categories";

describe("i18n en fallback", () => {
	it("uses the active dictionary, then falls back to en with a one-time warning", () => {
		// 注入一本不完整的词典来模拟运行期缺字（内置 10 语言在类型层是全量的）
		translations.fr = { [KEY_TAGS]: "Étiquettes" };
		const originalLang = siteConfig.lang;
		siteConfig.lang = "fr";
		const warns = [];
		const originalWarn = console.warn;
		console.warn = (message) => warns.push(message);
		try {
			// 完整覆盖命中：不回退、不告警
			assert.equal(i18n(KEY_TAGS), "Étiquettes");
			assert.equal(warns.length, 0);
			// 当前语言缺字：回退 en 并告警一次
			assert.equal(i18n(KEY_CATEGORIES), translations.en[KEY_CATEGORIES]);
			assert.equal(warns.length, 1);
			assert.match(warns[0], /missing translation for "categories"/);
			// 同一 key 只告警一次
			i18n(KEY_CATEGORIES);
			assert.equal(warns.length, 1);
		} finally {
			console.warn = originalWarn;
			siteConfig.lang = originalLang;
			delete translations.fr;
		}
	});

	it("keeps the documented locales resolvable in the translation map", () => {
		for (const lang of [
			"en",
			"es",
			"zh_cn",
			"zh_tw",
			"ja",
			"ko",
			"th",
			"vi",
			"id",
			"tr",
		]) {
			assert.equal(
				typeof translations[lang][KEY_TAGS],
				"string",
				`${lang} must translate tags`,
			);
		}
	});
});
