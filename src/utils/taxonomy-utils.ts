/**
 * 标签归一化与统计的纯函数（不依赖 astro:content，可在 node --test 下直接验证）。
 * 约定：trim 后的标签名是生成（链接/计数）与消费（归档过滤/分组）共用的唯一规范形式。
 */

/** trim + 去重 + 丢弃空串，保持首次出现顺序 */
export function normalizeTags(tags: string[] | undefined | null): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of tags ?? []) {
		const tag = raw.trim();
		if (!tag || seen.has(tag)) continue;
		seen.add(tag);
		result.push(tag);
	}
	return result;
}

/** 至少拥有一个（trim 后非空）标签的文章数——标签索引页副标题的文章口径 */
export function countTaggedPosts(
	posts: { data: { tags?: string[] } }[],
): number {
	return posts.filter((post) => normalizeTags(post.data.tags).length > 0)
		.length;
}
