import { permalinkConfig } from "../config/permalinkConfig.ts";
import type I18nKey from "../i18n/i18nKey.ts";
import { i18n } from "../i18n/translation.ts";
import {
	generatePermalinkSlug,
	type PostLikeForPermalink,
} from "./permalink-utils.ts";

/**
 * 移除文件扩展名（.md, .mdx, .markdown）
 */
export function removeFileExtension(id: string): string {
	return id.replace(/\.(md|mdx|markdown)$/i, "");
}

export function pathsEqual(path1: string, path2: string): boolean {
	const normalizedPath1 = path1.replace(/^\/|\/$/g, "").toLowerCase();
	const normalizedPath2 = path2.replace(/^\/|\/$/g, "").toLowerCase();
	return normalizedPath1 === normalizedPath2;
}

function joinUrl(...parts: string[]): string {
	const joined = parts.join("/");
	return joined.replace(/\/+/g, "/");
}

export function getPostUrlBySlug(slug: string): string {
	let slugWithoutExt = removeFileExtension(slug)
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
	if (slugWithoutExt.startsWith("posts/")) {
		slugWithoutExt = slugWithoutExt.replace(/^posts\//, "");
	}
	return url(`/posts/${slugWithoutExt}/`);
}

export function getPostUrlByAlias(alias: string): string {
	let cleanAlias = alias.replace(/^\/+/, "").replace(/\/+$/, "");
	if (cleanAlias.startsWith("posts/")) {
		cleanAlias = cleanAlias.replace(/^posts\//, "");
	}
	return url(`/posts/${cleanAlias}/`);
}

export function getPostUrl(
	post:
		| PostLikeForPermalink
		| {
				id?: string;
				slug?: string;
				url?: string;
				data?: {
					alias?: string;
					permalink?: string;
					published?: Date;
					publishedAt?: Date;
					category?: string | null;
					draft?: boolean;
				};
		  },
): string {
	if ("url" in post && typeof post.url === "string" && post.url.length > 0) {
		return post.url;
	}

	if (post.data?.permalink && post.data.permalink.trim().length > 0) {
		const slug = post.data.permalink.replace(/^\/+/, "").replace(/\/+$/, "");
		return url(`/${slug}/`);
	}

	if (permalinkConfig.enable) {
		const slug = generatePermalinkSlug(post as PostLikeForPermalink);
		return url(`/${slug}/`);
	}

	if (post.data?.alias && post.data.alias.trim().length > 0) {
		return getPostUrlByAlias(post.data.alias);
	}

	const postId =
		(post as { id?: string; slug?: string }).id ??
		(post as { id?: string; slug?: string }).slug ??
		"";
	return getPostUrlBySlug(postId);
}

export function getTagUrl(tag: string): string {
	if (!tag) return url("/archive/");
	return url(`/archive/?tag=${encodeURIComponent(tag.trim())}`);
}

export function getCategoryUrl(category: string | null): string {
	if (
		!category ||
		category.trim() === "" ||
		category.trim().toLowerCase() ===
			i18n("uncategorized" as I18nKey).toLowerCase()
	)
		return url("/archive/?uncategorized=true");
	return url(`/archive/?category=${encodeURIComponent(category.trim())}`);
}

export function getSeriesUrl(series: string): string {
	if (!series?.trim()) return url("/series/");
	return url(`/series/${encodeURIComponent(series.trim())}/`);
}

export function getDir(path: string): string {
	const lastSlashIndex = path.lastIndexOf("/");
	if (lastSlashIndex < 0) {
		return "/";
	}
	return path.substring(0, lastSlashIndex + 1);
}

export function url(path: string, baseUrlOverride?: string): string {
	if (!path) {
		return baseUrlOverride ?? import.meta.env?.BASE_URL ?? "/";
	}
	if (
		path.startsWith("http://") ||
		path.startsWith("https://") ||
		path.startsWith("data:") ||
		path.startsWith("#") ||
		path.startsWith("mailto:") ||
		path.startsWith("tel:") ||
		path.startsWith("javascript:")
	) {
		return path;
	}
	const baseUrl = baseUrlOverride ?? import.meta.env?.BASE_URL ?? "/";
	const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;

	if (
		normalizedBase !== "/" &&
		(normalizedPath === baseUrl || normalizedPath.startsWith(normalizedBase))
	) {
		return normalizedPath;
	}
	return joinUrl("", baseUrl, path);
}

/**
 * 将相对路径或绝对路径解析为完整的绝对 URL（附带域名与 base 路径）。
 * 针对已包含协议的外部 URL 或 Data URL 原样返回；
 * 若未提供 baseOrigin 则回退为带 base 的相对路径。
 */
export function toAbsoluteUrl(
	path: string,
	baseOrigin?: string | URL,
	baseUrlOverride?: string,
): string {
	if (!path) return "";
	if (
		path.startsWith("http://") ||
		path.startsWith("https://") ||
		path.startsWith("data:")
	) {
		return path;
	}
	const pathWithBase = url(path, baseUrlOverride);
	if (!baseOrigin) return pathWithBase;
	try {
		return new URL(pathWithBase, baseOrigin).href;
	} catch {
		return pathWithBase;
	}
}
