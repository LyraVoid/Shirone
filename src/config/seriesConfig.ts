import type { SeriesConfig } from "../types/seriesConfig.ts";
import { withUserConfig } from "../utils/config-overlay.ts";

export const seriesConfig: SeriesConfig = withUserConfig("series", {
	enable: true,
	title: "$t:series",
	// 空 = 使用动态汇总（「x 个系列 · y 篇文章」）
	description: "",
	cardPosition: "bottom",
});
