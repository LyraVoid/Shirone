/** Shared page window for static links and interactive lists. */
export function paginationPages(
	currentPage: number,
	totalPages: number,
	adjacent = 2,
): number[] {
	if (!Number.isSafeInteger(totalPages) || totalPages < 1) return [];
	const current = normalizePage(currentPage, totalPages);
	const neighbors =
		Number.isSafeInteger(adjacent) && adjacent >= 0 ? adjacent : 2;
	const visible = neighbors * 2 + 1;
	let left = Math.max(1, current - neighbors);
	const right = Math.min(totalPages, left + visible - 1);
	left = Math.max(1, right - visible + 1);
	const pages: number[] = [];
	if (left > 1) pages.push(1);
	if (left === 3) pages.push(2);
	if (left > 3) pages.push(-1);
	for (let page = left; page <= right; page++) pages.push(page);
	if (right < totalPages - 2) pages.push(-1);
	if (right === totalPages - 2) pages.push(totalPages - 1);
	if (right < totalPages) pages.push(totalPages);
	return pages;
}

export function normalizePage(value: unknown, totalPages: number): number {
	const page =
		typeof value === "number"
			? value
			: typeof value === "string" && /^\d+$/.test(value)
				? Number(value)
				: 1;
	return Number.isSafeInteger(page) && page > 0
		? Math.min(page, Math.max(1, totalPages))
		: 1;
}

export function normalizePageSize(value: unknown): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0
		? value
		: 12;
}
