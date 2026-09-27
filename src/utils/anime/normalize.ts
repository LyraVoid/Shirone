import type { AnimeItem, AnimeStatus } from "../../data/anime.ts";
import type { AnimeIdentity, AnimeSnapshot } from "../../types/animeConfig.ts";

const VALID_STATUSES = new Set<AnimeStatus>([
	"watching",
	"completed",
	"planned",
	"onHold",
	"dropped",
]);

const STATUS_ORDER: Record<AnimeStatus, number> = {
	completed: 0,
	watching: 1,
	planned: 2,
	onHold: 3,
	dropped: 4,
};

const SAFE_HTTPS_URL = /^https:\/\/[^\s/$.?#].[^\s]*$/i;
const SAFE_RELATIVE_PATH = /^\/[a-zA-Z0-9_\-./]+$/;

/**
 * 校验并清洗 URL / 图片地址（只允许 HTTPS 或站内相对路径，阻断 javascript: 与非法 scheme）
 */
export function sanitizeMediaUrl(url: unknown): string | undefined {
	if (typeof url !== "string") return undefined;
	const trimmed = url.trim();
	if (!trimmed) return undefined;

	if (trimmed.startsWith("//")) {
		return `https:${trimmed}`;
	}

	if (trimmed.startsWith("http://")) {
		// 自动升级为 https
		return trimmed.replace(/^http:\/\//i, "https://");
	}

	if (SAFE_HTTPS_URL.test(trimmed)) {
		return trimmed;
	}

	if (SAFE_RELATIVE_PATH.test(trimmed)) {
		return trimmed;
	}

	return undefined;
}

/**
 * 校验并清洗外链（只允许安全的 https 链接）
 */
export function sanitizeExternalLink(link: unknown): string | undefined {
	if (typeof link !== "string") return undefined;
	const trimmed = link.trim();
	if (!trimmed) return undefined;

	if (trimmed.startsWith("http://")) {
		return trimmed.replace(/^http:\/\//i, "https://");
	}

	if (SAFE_HTTPS_URL.test(trimmed)) {
		return trimmed;
	}

	return undefined;
}

/**
 * 从日期字符串中提取 4 位年份
 */
export function extractYear(rawDate: unknown): string {
	if (typeof rawDate === "number" && rawDate > 1900 && rawDate < 2100) {
		return String(Math.floor(rawDate));
	}
	if (typeof rawDate !== "string") return "";
	const match = rawDate.trim().match(/(\d{4})/);
	return match ? match[1] : "";
}

/**
 * 清洗并截断简介文本（去除 HTML 标签、特殊控制字符与多余换行）
 */
export function sanitizeDescription(
	rawDesc: unknown,
	maxLength = 500,
): string | undefined {
	if (typeof rawDesc !== "string") return undefined;
	const cleaned = rawDesc
		.replace(/<[^>]*>/g, "") // 剥除 HTML 标签
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/[\r\n\t]+/g, " ")
		.trim();

	if (!cleaned) return undefined;
	if (cleaned.length <= maxLength) return cleaned;
	return `${cleaned.slice(0, maxLength)}…`;
}

/**
 * 校验并清洗题材标签数组（去重、去空、截取合理数量）
 */
export function sanitizeGenres(rawGenres: unknown, maxCount = 6): string[] {
	if (!Array.isArray(rawGenres)) return [];
	const set = new Set<string>();
	for (const item of rawGenres) {
		if (typeof item === "string") {
			const trimmed = item.trim().replace(/^#+/, "");
			if (trimmed && trimmed.length <= 30) {
				set.add(trimmed);
			}
		}
		if (set.size >= maxCount) break;
	}
	return Array.from(set);
}

/**
 * 校验并标准化单条番剧条目
 */
export function normalizeAnimeItem(raw: unknown): AnimeItem | null {
	if (!raw || typeof raw !== "object") return null;

	const record = raw as Record<string, unknown>;

	// 1. 标题校验：必填，非空字符串
	if (typeof record.title !== "string" || !record.title.trim()) {
		return null;
	}
	const title = record.title.trim();

	// 2. 状态校验：必须是五态之一
	const rawStatus = String(record.status || "");
	let status: AnimeStatus | null = null;
	if (VALID_STATUSES.has(rawStatus as AnimeStatus)) {
		status = rawStatus as AnimeStatus;
	} else if (rawStatus.toLowerCase() === "onhold") {
		status = "onHold";
	}
	if (!status) {
		return null;
	}

	// 3. 评分校验：0–10 的有限数字
	let rating = 0;
	if (typeof record.rating === "number" && Number.isFinite(record.rating)) {
		rating = Math.max(0, Math.min(10, Math.round(record.rating * 10) / 10));
	}

	// 4. 进度校验：watched / total
	let progress: { watched: number; total: number } | undefined;
	if (record.progress && typeof record.progress === "object") {
		const rawProgress = record.progress as Record<string, unknown>;
		let watched = 0;
		let total = 0;
		let hasWatched = false;
		if (
			typeof rawProgress.watched === "number" &&
			Number.isFinite(rawProgress.watched)
		) {
			watched = Math.max(0, Math.floor(rawProgress.watched));
			hasWatched = true;
		}
		if (
			typeof rawProgress.total === "number" &&
			Number.isFinite(rawProgress.total)
		) {
			total = Math.max(0, Math.floor(rawProgress.total));
		}
		if (hasWatched || total > 0) {
			if (total > 0 && watched > total) {
				watched = total;
			}
			progress = { watched, total };
		}
	} else if (
		typeof record.progress === "number" &&
		Number.isFinite(record.progress)
	) {
		const watched = Math.max(0, Math.floor(record.progress));
		progress = { watched, total: 0 };
	}

	// 5. 封面与外链
	const cover = sanitizeMediaUrl(record.cover);
	const link = sanitizeExternalLink(record.link);

	// 6. 描述、年份、制作组与题材
	const description = sanitizeDescription(record.description);
	const year = extractYear(record.year);
	const studio =
		typeof record.studio === "string" && record.studio.trim()
			? record.studio.trim()
			: undefined;
	const genres = sanitizeGenres(record.genres ?? record.genre);

	// 7. 时间区间
	let period: { start: string; end: string } | undefined;
	if (record.period && typeof record.period === "object") {
		const p = record.period as Record<string, unknown>;
		const start = typeof p.start === "string" ? p.start.trim() : "";
		const end = typeof p.end === "string" ? p.end.trim() : "";
		if (start || end) {
			period = { start, end };
		}
	}

	// 8. 标识符
	let identity: AnimeIdentity | undefined;
	if (record.identity && typeof record.identity === "object") {
		const idRec = record.identity as Record<string, unknown>;
		if (
			idRec.provider === "local" ||
			idRec.provider === "bangumi" ||
			idRec.provider === "bilibili"
		) {
			identity = {
				provider: idRec.provider,
				sourceId:
					typeof idRec.sourceId === "string" ? idRec.sourceId : undefined,
				seasonId:
					typeof idRec.seasonId === "string" ? idRec.seasonId : undefined,
				subjectId:
					typeof idRec.subjectId === "string" ? idRec.subjectId : undefined,
			};
		}
	}

	const item: AnimeItem = {
		title,
		status,
		rating,
		year,
		genres,
		...(progress ? { progress } : {}),
		...(cover ? { cover } : {}),
		...(link ? { link } : {}),
		...(description ? { description } : {}),
		...(studio ? { studio } : {}),
		...(period ? { period } : {}),
		...(identity ? { identity } : {}),
	};

	return item;
}

/**
 * 稳定排序番剧列表（先按状态优先级排序，再按年份倒序，最后按标题稳定排序）
 */
export function sortAnimeList(items: AnimeItem[]): AnimeItem[] {
	return [...items].sort((a, b) => {
		const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
		if (statusDiff !== 0) return statusDiff;

		const yearA = Number.parseInt(a.year, 10) || 0;
		const yearB = Number.parseInt(b.year, 10) || 0;
		if (yearB !== yearA) return yearB - yearA;

		return a.title.localeCompare(b.title, "en", { sensitivity: "base" });
	});
}

/**
 * 校验并解析快照内容（支持 Envelope 结构与兼容旧数组）
 */
export function parseAnimeSnapshot(
	jsonContent: string,
): { items: AnimeItem[]; envelope?: AnimeSnapshot } | null {
	try {
		const parsed = JSON.parse(jsonContent);
		if (!parsed) return null;

		// 格式 A：标准 Envelope
		if (
			typeof parsed === "object" &&
			!Array.isArray(parsed) &&
			parsed.schemaVersion === 1 &&
			Array.isArray(parsed.items)
		) {
			const items: AnimeItem[] = [];
			for (const rawItem of parsed.items) {
				const item = normalizeAnimeItem(rawItem);
				if (item) items.push(item);
			}
			return {
				items: sortAnimeList(items),
				envelope: {
					schemaVersion: 1,
					provider: parsed.provider,
					fetchedAt: parsed.fetchedAt || new Date().toISOString(),
					accountRef: String(parsed.accountRef || ""),
					items,
				},
			};
		}

		// 格式 B：裸数组（迁移兼容期）
		if (Array.isArray(parsed)) {
			const items: AnimeItem[] = [];
			for (const rawItem of parsed) {
				const item = normalizeAnimeItem(rawItem);
				if (item) items.push(item);
			}
			return { items: sortAnimeList(items) };
		}

		return null;
	} catch {
		return null;
	}
}
