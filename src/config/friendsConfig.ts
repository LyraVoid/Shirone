import type { FriendsConfig } from "../types/friendsConfig.ts";
import { withUserConfig } from "../utils/config-overlay.ts";

export const friendsConfig: FriendsConfig = withUserConfig("friends", {
	enable: true,
	title: "$t:friends",
	description: "$t:friendsBanner",
});
