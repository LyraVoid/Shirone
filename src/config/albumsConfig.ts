import type { AlbumsConfig } from "../types/albumsConfig.ts";
import { withUserConfig } from "../utils/config-overlay.ts";

export const albumsConfig: AlbumsConfig = withUserConfig("albums", {
	enable: true,
	title: "$t:albums",
	description: "$t:albumsBanner",
});
