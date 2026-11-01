export interface WeekInfoLocale {
	getWeekInfo?: () => { firstDay: number };
	weekInfo?: { firstDay: number };
}

/** Intl.Locale week info, preferring the current method over the legacy accessor. */
export function resolveWeekStart(locale: WeekInfoLocale): number {
	return locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay ?? 1;
}

export function getLocaleWeekStart(locale: string): number {
	return resolveWeekStart(new Intl.Locale(locale));
}

/**
 * Create localized date text with the same Gregorian calendar and Latin digits
 * used by the ISO-backed calendar grid.
 */
export function createGregorianDateFormatter(
	locale: string,
	options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
	return new Intl.DateTimeFormat(locale, {
		...options,
		calendar: "gregory",
		numberingSystem: "latn",
	});
}
