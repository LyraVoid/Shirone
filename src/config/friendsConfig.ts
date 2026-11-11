import type { FriendsConfig } from "../types/friendsConfig.ts";
import { withUserConfig } from "../utils/config-overlay.ts";

export const friendsConfig: FriendsConfig = withUserConfig("friends", {
	enable: true,
	title: "$t:friends",
	description: "$t:friendsBanner",
	/** 页面每页条数（正整数），默认 12；省略或无效值回退 12。 */
	pageSize: 12,
});
