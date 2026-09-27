import I18nKey from "../i18n/i18nKey";
import { i18n } from "../i18n/translation";

/** `$t:home` 形式的 i18n 引用前缀；不带前缀的 name 一律按字面量处理。 */
export const I18N_REFERENCE_PREFIX = "$t:";

/**
 * 解析可能包含 `$t:<i18nKey>` 的文本。
 * 若以 `$t:` 开头，则校验并提取对应 I18nKey 调用 i18n()；
 * 否则作为字面量原样返回。
 */
export function resolveI18nText(text: string | undefined, fallbackKey?: I18nKey): string {
	if (!text) {
		return fallbackKey ? i18n(fallbackKey) : "";
	}

	if (!text.startsWith(I18N_REFERENCE_PREFIX)) {
		return text;
	}

	const key = text.slice(I18N_REFERENCE_PREFIX.length);
	if (!Object.hasOwn(I18nKey, key)) {
		throw new Error(
			`[config] 未知的 i18n 词条 "${key}"。可用词条见 src/i18n/i18nKey.ts；` +
				" 若本意是普通文本，去掉开头的 $t: 即可。",
		);
	}
	return i18n(I18nKey[key as keyof typeof I18nKey]);
}
