/**
 * 日历取数：聚合全部文章的发布日（dateKey → 当日文章）。
 * SSR 直出（侧栏静态渲染在 Swup 容器外，不走 API 端点）；
 * 模块级备忘化，多页面渲染共享一次汇总。
 * 日期口径与文章卡片一致（formatDateToYYYYMMDD，UTC 字段直取）。
 */
import { getSortedPosts } from "./content-utils";
import { formatDateToYYYYMMDD } from "./date-utils";
import { getPostUrl } from "./url-utils.ts";

export interface CalendarPost {
	id: string;
	title: string;
	/** 文章 URL（/posts/<slug>/） */
	url: string;
	/** 发布日 dateKey（YYYY-MM-DD，与 dateMap 键一致） */
	date: string;
}

export interface CalendarData {
	/** dateKey → 当日文章（按发布时间倒序，列表展开展示用） */
	postsByDate: Record<string, CalendarPost[]>;
	/** 有文章月份列表（升序 YYYY-MM），跳月导航用（跳过空月） */
	activeMonths: string[];
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

let cache: CalendarData | null = null;

export async function getCalendarData(): Promise<CalendarData> {
	if (cache) return cache;

	const posts = await getSortedPosts();
	const postsByDate: Record<string, CalendarPost[]> = {};
	const activeMonthSet = new Set<string>();

	for (const post of posts) {
		const date = formatDateToYYYYMMDD(post.data.published);
		if (!DAY_KEY.test(date)) continue;
		const item: CalendarPost = {
			id: post.id,
			title: post.data.title,
			url: getPostUrl(post),
			date,
		};
		const postsForDate = postsByDate[date] ?? [];
		postsForDate.push(item);
		postsByDate[date] = postsForDate;
		activeMonthSet.add(date.slice(0, 7));
	}

	const activeMonths = Array.from(activeMonthSet).sort();

	cache = { postsByDate, activeMonths };
	return cache;
}
