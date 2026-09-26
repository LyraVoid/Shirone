import type { ProfileConfig } from "@/types/config";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * 博主资料：头像 / 名称 / 简介 / 社交链接（侧栏 Profile 卡片、页脚、RSS 作者等消费）。
 * 类型见 src/types/config.ts。
 */
export const profileConfig: ProfileConfig = withUserConfig("profile", {
	avatar: "assets/images/yuno.webp", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
	name: "BoochiChaos",
	bio: "我是谁 我在哪 我不到啊",
	links: [
		//{
		//name: "X",
		//icon: "fa6-brands:x-twitter", // Visit https://icones.js.org/ for icon codes
		// You will need to install the corresponding icon set if it's not already included
		// `pnpm add @iconify-json/<icon-set-name>`
		//url: "https://x.com",
		//},
		{
			name: "Maill",
			icon: "icon-park-outline:maill-one",
			url: "mailto:ciallo@hxf1.dpdns.org",
		},
		{
			name: "Bilibili",
			icon: "fa6-brands:bilibili",
			url: "https://space.bilibili.com/689341156",
		},
		{
			name: "Steam",
			icon: "fa6-brands:steam",
			url: "https://steamcommunity.com/profiles/76561199125559574/",
		},
		{
			name: "GitHub",
			icon: "fa6-brands:github",
			url: "https://github.com/mefengxiao",
		},
	],
});
