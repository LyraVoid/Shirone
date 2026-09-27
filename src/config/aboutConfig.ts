import type { AboutConfig } from "../types/aboutConfig.ts";
import { withUserConfig } from "../utils/config-overlay.ts";

export const aboutConfig: AboutConfig = withUserConfig("about", {
	enable: true,
	title: "$t:about",
	description: "$t:about",
});
