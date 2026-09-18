import type { CollectionEntry } from "astro:content";

export type SeriesEntity = CollectionEntry<"series">;

/**
 * 系列 slug 的唯一规范化点：schema 落在 `post.data.series` 上的是 trim 后的值，
 * 组件/工具再做比较时也走这里，避免「卡片显示正常但计数/分类回退失效」。
 * 另：系列实体必须平铺在 `content/series/` 根下，slug 即单个路由段，
 * 不使用 `a/b` 形式的嵌套目录。
 */
export function normaliseSeriesSlug(raw: string | null | undefined): string {
	return (raw ?? "").trim();
}

export interface SeriesPostRef {
	slug: string;
	title: string;
}

export interface SeriesContext {
	/** 系列 slug（集合条目 id） */
	slug: string;
	title: string;
	status: "ongoing" | "completed";
	defaultCategory: string;
	/** 系列内文章，按阅读顺序 */
	posts: SeriesPostRef[];
	total: number;
}

export interface SeriesPostContext extends SeriesContext {
	/** 当前文章在系列中的 1-based 位置 */
	index: number;
	prev: SeriesPostRef | null;
	next: SeriesPostRef | null;
}

/**
 * 从系列总览 Markdown 提取纯文本摘要（供系列索引页大卡片展示）。
 * 只做轻量清洗：去代码块/图片/标题标记/列表符号/强调符/HTML，
 * 链接保留锚文本；按词边界截断并追加省略号。
 */
export function excerptFromMarkdown(markdown: string, maxChars = 160): string {
	const text = markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^\s{0,3}#{1,6}\s+/gm, "")
		.replace(/^\s{0,3}>+\s?/gm, "")
		.replace(/^\s*[-*+]\s+/gm, "")
		.replace(/^\s*\d+\.\s+/gm, "")
		.replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim();

	if (text.length <= maxChars) return text;
	const cut = text.slice(0, maxChars);
	const lastSpace = cut.lastIndexOf(" ");
	return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export interface UnknownSeriesReference {
	/** 被引用但目录里不存在的系列 slug */
	slug: string;
	/** 第一个引用它的文章 slug（用于报错定位） */
	postSlug: string;
}

/**
 * 收集「文章引用了目录中不存在的系列」的引用（每个未知 slug 取首篇）。
 * 纯函数：调用方（数据层）决定如何提示；行为上这些引用会被静默忽略。
 */
export function findUnknownSeriesSlugs(
	posts: readonly { slug: string; series?: string }[],
	catalog: ReadonlyMap<string, unknown>,
): UnknownSeriesReference[] {
	const firstSeen = new Map<string, string>();
	for (const post of posts) {
		const seriesSlug = normaliseSeriesSlug(post.series);
		if (!seriesSlug || catalog.has(seriesSlug)) continue;
		if (!firstSeen.has(seriesSlug)) {
			firstSeen.set(seriesSlug, post.slug);
		}
	}
	return [...firstSeen.entries()].map(([slug, postSlug]) => ({
		slug,
		postSlug,
	}));
}

export interface SeriesMemberInput {
	slug: string;
	title: string;
	published: Date;
	/** 所属系列 slug（空 = 不属于任何系列） */
	series?: string;
	seriesOrder?: number;
}

/**
 * 系列内阅读顺序：显式 `seriesOrder` 优先；缺省回退为按发布日期升序。
 * 部分标注时，未标注的按日期排在已标注之后，保证确定性。
 */
export function orderSeriesMembers<T extends SeriesMemberInput>(
	members: readonly T[],
): T[] {
	return [...members].sort((a, b) => {
		const aOrder = typeof a.seriesOrder === "number" ? a.seriesOrder : null;
		const bOrder = typeof b.seriesOrder === "number" ? b.seriesOrder : null;
		if (aOrder !== null && bOrder !== null && aOrder !== bOrder) {
			return aOrder - bOrder;
		}
		if (aOrder !== null && bOrder === null) return -1;
		if (aOrder === null && bOrder !== null) return 1;
		const dateDiff = a.published.getTime() - b.published.getTime();
		return dateDiff !== 0 ? dateDiff : a.slug.localeCompare(b.slug);
	});
}

/**
 * 有效 category 的唯一解析点（回退链，非强制）：
 * 显式 post.category → series.defaultCategory → ""（未分类）。
 */
export function resolveSeriesPostCategory(
	category: string | null | undefined,
	seriesData: { defaultCategory?: string } | undefined,
): string {
	const explicit = (category ?? "").trim();
	if (explicit) return explicit;
	return (seriesData?.defaultCategory ?? "").trim();
}

export interface BuildSeriesContextsOptions {
	catalog: Map<string, SeriesEntity>;
	posts: readonly SeriesMemberInput[];
}

/**
 * 为每篇文章构建系列上下文（阅读顺序、index/total、组内上一篇/下一篇）。
 * 没有系列、或引用了目录中不存在的系列的文章 → 不生成上下文（不产生死链）。
 */
export function buildSeriesContexts(
	options: BuildSeriesContextsOptions,
): Map<string, SeriesPostContext> {
	const { catalog, posts } = options;

	const groups = new Map<string, SeriesMemberInput[]>();
	for (const post of posts) {
		const seriesSlug = normaliseSeriesSlug(post.series);
		if (!seriesSlug || !catalog.has(seriesSlug)) continue;
		const group = groups.get(seriesSlug) ?? [];
		group.push(post);
		groups.set(seriesSlug, group);
	}

	const contexts = new Map<string, SeriesPostContext>();
	for (const [slug, members] of groups) {
		const entity = catalog.get(slug);
		if (!entity) continue;
		const ordered = orderSeriesMembers(members);
		const refs: SeriesPostRef[] = ordered.map((member) => ({
			slug: member.slug,
			title: member.title,
		}));
		ordered.forEach((member, index) => {
			contexts.set(member.slug, {
				slug,
				title: entity.data.title,
				status: entity.data.status,
				defaultCategory: entity.data.defaultCategory,
				posts: refs,
				total: refs.length,
				index: index + 1,
				prev: index > 0 ? refs[index - 1] : null,
				next: index < refs.length - 1 ? refs[index + 1] : null,
			});
		});
	}

	return contexts;
}
