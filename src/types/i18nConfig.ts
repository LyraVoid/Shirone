import type I18nKey from "../i18n/i18nKey.ts";

/**
 * i18n 覆盖配置域类型：按语言代码分组（zh_CN, en, ja, ko 等），
 * 值为 I18nKey 对应的自定义文案字典。
 */
export type I18nConfig = {
	[lang: string]: Partial<Record<I18nKey | string, string>>;
};
