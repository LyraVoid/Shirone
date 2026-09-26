/**
 * 友情链接数据源
 * 用于 /friends/ 页面展示
 */

export interface FriendItem {
	id: number;
	title: string;
	imgurl: string;
	desc: string;
	siteurl: string;
	tags: string[];
}

export const friendsData: FriendItem[] = [
	{
		id: 1,
		title: "Shirone",
		imgurl: "https://avatars.githubusercontent.com/u/225602409?v=4&s=640",
		desc: "Material 3 设计风格的开源博客主题",
		siteurl: "https://shirone.mysqil.com",
		tags: ["主题", "博客"],
	},
	{
		id: 2,
		title: "Astro",
		imgurl: "https://avatars.githubusercontent.com/u/44914786?v=4&s=640",
		desc: "以内容为核心的现代静态网站构建框架",
		siteurl: "https://astro.build",
		tags: ["框架", "开发"],
	},
];

export function getFriendsList(): FriendItem[] {
	return friendsData;
}

export function getShuffledFriendsList(): FriendItem[] {
	const shuffled = [...friendsData];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}
