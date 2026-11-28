/**
 * 移除文件扩展名（.md, .mdx, .markdown）
 */
export function removeFileExtension(id: string): string {
	return id.replace(/\.(md|mdx|markdown)$/i, "");
}

import { permalinkConfig } from "../config/permalinkConfig.ts";
import { siteConfig } from "../config/siteConfig.ts";

export interface PermalinkDateParts {
	year: string;
	month: string;
	day: string;
	hour: string;
	minute: string;
	second: string;
}

// 缓存按发布时间升序排列的文章 ID -> 序号映射（签名比对，内容变更即重建）
let postIdMap: Map<string, number> | null = null;
let postIdMapSignature: string | null = null;

export interface PostLikeForIdMap {
	id: string;
	data: {
		published: Date;
		publishedAt?: Date;
		draft?: boolean;
	};
}

function postSetSignature(posts: Array<PostLikeForIdMap>): string {
	return posts
		.map((post) => {
			const instant = post.data.publishedAt ?? post.data.published;
			return `${post.id}:${instant.getTime()}:${post.data.draft === true ? "draft" : "published"}`;
		})
		.join("\n");
}

/**
 * 比较两篇文章的发布时间（升序排序，最早发布的在前）
 */
export function comparePublishedDatesAscending(
	a: PostLikeForIdMap,
	b: PostLikeForIdMap,
): number {
	const instantA = a.data.publishedAt ?? a.data.published;
	const instantB = b.data.publishedAt ?? b.data.published;
	const timeDiff = instantA.getTime() - instantB.getTime();
	if (timeDiff !== 0) return timeDiff;
	return a.id.localeCompare(b.id);
}

/**
 * 初始化文章 ID 序号映射
 * 按发布时间升序排列（最早的文章 post_id = 1），草稿文章不参与编号
 */
export function initPostIdMap(
	posts: Array<PostLikeForIdMap>,
): Map<string, number> {
	// dev 热重载/内容集合变更后会再次调用：签名比对，集合变化即重建，
	// 否则 %post_id% 会继续引用上一次构建的陈旧缓存
	const signature = postSetSignature(posts);
	if (postIdMap && postIdMapSignature === signature) {
		return postIdMap;
	}

	const nonDraftPosts = posts.filter((post) => post.data.draft !== true);
	const sorted = [...nonDraftPosts].sort(comparePublishedDatesAscending);

	postIdMap = new Map();
	sorted.forEach((post, index) => {
		postIdMap?.set(post.id, index + 1);
	});
	postIdMapSignature = signature;

	return postIdMap;
}

/**
 * 获取文章的数字序号 ID
 *
 * 未初始化时抛错：静默返回 0 会让 %post_id% 渲染成字面 0（错误 slug 且难以发现）。
 * 初始化后的未知 ID（如 dev 下的草稿）仍返回 0。
 */
export function getPostNumericId(postId: string): number {
	if (!postIdMap) {
		throw new Error(
			"initPostIdMap() must run before getPostNumericId(); without it %post_id% would silently render 0.",
		);
	}
	return postIdMap.get(postId) ?? 0;
}

/**
 * 清除文章 ID 映射缓存（供测试或热重载）
 */
export function clearPostIdMap(): void {
	postIdMap = null;
	postIdMapSignature = null;
}

// F-8：permalink 唯一性登记。构建期的路径去重只在多路由冲突时生效
// （见集成层 prerenderConflictBehavior），dev 下不会检查；这里在
// getStaticPaths 生成期立即拒绝被两篇文章同时占用的 permalink。
const permalinkOwners = new Map<string, string>();

/**
 * 登记 permalink slug；同一 slug 已被其他文章占用时抛错
 */
export function reservePermalinkSlug(slug: string, entryId: string): void {
	const normalized = slug.replace(/^\/+/, "").replace(/\/+$/, "");
	const owner = permalinkOwners.get(normalized);
	if (owner && owner !== entryId) {
		throw new Error(
			`Duplicate permalink "/${normalized}/": posts "${owner}" and "${entryId}" both resolve to it. Give one of them a unique custom permalink or alias.`,
		);
	}
	permalinkOwners.set(normalized, entryId);
}

/**
 * 清除 permalink 登记表（供测试或热重载）
 */
export function clearPermalinkReservations(): void {
	permalinkOwners.clear();
}

/**
 * 解析文章日期的年月日时分秒（遵循站点配置的 IANA 时区）
 */
export function getPostDateParts(
	published: Date,
	publishedAt?: Date,
	timeZone: string = siteConfig.timeZone,
): PermalinkDateParts {
	const instant = publishedAt ?? published;

	// 若未指定 publishedAt 且时间为 UTC 0 点，视为纯日期，使用 UTC 日期组件避免时区翻转
	const isDateOnly =
		!publishedAt &&
		published.getUTCHours() === 0 &&
		published.getUTCMinutes() === 0 &&
		published.getUTCSeconds() === 0;

	if (isDateOnly) {
		return {
			year: String(published.getUTCFullYear()),
			month: String(published.getUTCMonth() + 1).padStart(2, "0"),
			day: String(published.getUTCDate()).padStart(2, "0"),
			hour: "00",
			minute: "00",
			second: "00",
		};
	}

	try {
		const parts = new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
		}).formatToParts(instant);

		const values: Record<string, string> = {};
		for (const part of parts) {
			if (part.type !== "literal") {
				values[part.type] = part.value;
			}
		}

		return {
			year: values.year || String(instant.getFullYear()),
			month: values.month || String(instant.getMonth() + 1).padStart(2, "0"),
			day: values.day || String(instant.getDate()).padStart(2, "0"),
			hour: values.hour || "00",
			minute: values.minute || "00",
			second: values.second || "00",
		};
	} catch {
		return {
			year: String(instant.getFullYear()),
			month: String(instant.getMonth() + 1).padStart(2, "0"),
			day: String(instant.getDate()).padStart(2, "0"),
			hour: String(instant.getHours()).padStart(2, "0"),
			minute: String(instant.getMinutes()).padStart(2, "0"),
			second: String(instant.getSeconds()).padStart(2, "0"),
		};
	}
}

/**
 * 判断文章是否有自定义根路径 permalink
 */
export function hasCustomPermalink(post: {
	data?: { permalink?: string };
}): boolean {
	return Boolean(post.data?.permalink && post.data.permalink.trim().length > 0);
}

export type PostLikeForPermalink = {
	id?: string;
	slug?: string;
	filePath?: string;
	data: {
		title?: string;
		published?: Date;
		publishedAt?: Date;
		category?: string | null;
		permalink?: string;
		alias?: string;
		draft?: boolean;
	};
};

/**
 * 生成 permalink 相对 slug（不含 leading/trailing slashes）
 */
export function generatePermalinkSlug(post: PostLikeForPermalink): string {
	// 1. 若文章有自定义 permalink，最高优先级直接采用
	if (post.data?.permalink && post.data.permalink.trim().length > 0) {
		return post.data.permalink.replace(/^\/+/, "").replace(/\/+$/, "");
	}

	const postId =
		(post as { id?: string; slug?: string }).id ??
		(post as { id?: string; slug?: string }).slug ??
		"";
	const defaultSlug = removeFileExtension(postId);

	// 2. 若全局 permalink 未启用
	if (!permalinkConfig.enable) {
		if (post.data?.alias && post.data.alias.trim().length > 0) {
			let alias = post.data.alias.replace(/^\/+/, "").replace(/\/+$/, "");
			if (alias.startsWith("posts/")) {
				alias = alias.replace(/^posts\//, "");
			}
			return alias;
		}
		return defaultSlug;
	}

	// 3. 使用全局 permalink 模板
	const format = permalinkConfig.format || "%postname%";
	let rawPostname = defaultSlug;
	if (post.filePath) {
		const parts = post.filePath.split(/[/\\]/);
		const filename = parts[parts.length - 1];
		if (filename) {
			rawPostname = removeFileExtension(filename);
		}
	}

	const published = post.data.published ?? new Date();
	const dateParts = getPostDateParts(published, post.data.publishedAt);
	const category = post.data.category
		? String(post.data.category).trim()
		: "uncategorized";
	const numericId = getPostNumericId(postId);

	const slug = format
		.replace(/%year%/g, dateParts.year)
		.replace(/%monthnum%/g, dateParts.month)
		.replace(/%day%/g, dateParts.day)
		.replace(/%hour%/g, dateParts.hour)
		.replace(/%minute%/g, dateParts.minute)
		.replace(/%second%/g, dateParts.second)
		.replace(/%post_id%/g, String(numericId))
		.replace(/%postname%/g, defaultSlug)
		.replace(/%raw_postname%/g, rawPostname)
		.replace(/%category%/g, category);

	return slug.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * 获取文章的完整 permalink 路径（如 /my-post/ 或 /2024/12/post/）
 */
export function getPermalinkPath(post: PostLikeForPermalink): string {
	const slug = generatePermalinkSlug(post);
	const cleanSlug = slug.replace(/^\/+/, "").replace(/\/+$/, "");
	return `/${cleanSlug}/`;
}
