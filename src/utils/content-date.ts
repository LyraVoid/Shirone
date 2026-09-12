import { siteConfig } from "@/config/siteConfig";

export type PublicationMetadata = {
	pinned?: boolean;
	published: Date;
	publishedAt?: Date;
	updated?: Date;
	updatedAt?: Date;
};

export type PublicationEntry = {
	id: string;
	data: PublicationMetadata;
};

type DateParts = {
	day: string;
	hour: string;
	minute: string;
	month: string;
	year: string;
};

function assertValidDate(date: Date, label: string): void {
	if (Number.isNaN(date.getTime())) {
		throw new Error(`${label} must be a valid date.`);
	}
}

export function isValidTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat("en-CA", { timeZone }).format();
		return true;
	} catch {
		return false;
	}
}

function getDateParts(date: Date, timeZone: string): DateParts {
	assertValidDate(date, "Date");
	if (!isValidTimeZone(timeZone)) {
		throw new Error(`Invalid IANA time zone: ${timeZone}`);
	}

	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date);
	const values = Object.fromEntries(
		parts
			.filter(({ type }) => type !== "literal")
			.map(({ type, value }) => [type, value]),
	) as Partial<DateParts>;

	if (
		!values.year ||
		!values.month ||
		!values.day ||
		!values.hour ||
		!values.minute
	) {
		throw new Error(
			"Unable to extract date parts for the configured time zone.",
		);
	}

	return values as DateParts;
}

/** Formats a date-only content value without applying a time-zone conversion. */
export function formatCalendarDate(date: Date): string {
	assertValidDate(date, "Calendar date");
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function formatInstantDateInTimeZone(
	date: Date,
	timeZone: string,
): string {
	const parts = getDateParts(date, timeZone);
	return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatInstantDateTimeInTimeZone(
	date: Date,
	timeZone: string,
): string {
	const parts = getDateParts(date, timeZone);
	return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatInstantDateInSiteTimeZone(date: Date): string {
	return formatInstantDateInTimeZone(date, siteConfig.timeZone);
}

export function formatInstantDateTimeInSiteTimeZone(date: Date): string {
	return formatInstantDateTimeInTimeZone(date, siteConfig.timeZone);
}

export function getPublishedInstant(data: PublicationMetadata): Date {
	return data.publishedAt ?? data.published;
}

export function getUpdatedInstant(data: PublicationMetadata): Date {
	return data.updatedAt ?? data.updated ?? getPublishedInstant(data);
}

/**
 * A timestamp supplements a post's calendar date; it may not silently move the
 * article to a different day when interpreted in the configured site time zone.
 */
export function validatePublicationMetadata(
	entry: PublicationEntry,
	timeZone: string = siteConfig.timeZone,
): void {
	if (!isValidTimeZone(timeZone)) {
		throw new Error(
			`siteConfig.timeZone must be a valid IANA time zone; received "${timeZone}".`,
		);
	}

	const publishedDate = formatCalendarDate(entry.data.published);
	if (
		entry.data.publishedAt &&
		formatInstantDateInTimeZone(entry.data.publishedAt, timeZone) !==
			publishedDate
	) {
		throw new Error(
			`Post "${entry.id}" has publishedAt outside its published calendar date in ${timeZone}.`,
		);
	}

	if (
		entry.data.updated &&
		entry.data.updatedAt &&
		formatInstantDateInTimeZone(entry.data.updatedAt, timeZone) !==
			formatCalendarDate(entry.data.updated)
	) {
		throw new Error(
			`Post "${entry.id}" has updatedAt outside its updated calendar date in ${timeZone}.`,
		);
	}
	if (entry.data.updatedAt && !entry.data.updated) {
		throw new Error(
			`Post "${entry.id}" must define updated alongside updatedAt.`,
		);
	}
}

/** Sorts pinned posts first, then calendar date, exact instant, and finally ID. */
export function comparePublicationEntries(
	a: PublicationEntry,
	b: PublicationEntry,
): number {
	if (a.data.pinned !== b.data.pinned) return a.data.pinned ? -1 : 1;

	const calendarDifference =
		b.data.published.getTime() - a.data.published.getTime();
	if (calendarDifference !== 0) return calendarDifference;

	const instantDifference =
		getPublishedInstant(b.data).getTime() -
		getPublishedInstant(a.data).getTime();
	if (instantDifference !== 0) return instantDifference;

	return a.id.localeCompare(b.id);
}
