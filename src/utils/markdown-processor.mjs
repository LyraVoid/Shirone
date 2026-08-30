import { unified } from "@astrojs/markdown-remark";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeComponents from "rehype-components"; /* Render the custom directive content */
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive"; /* Handle directives */
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";
import { siteConfig } from "../config/siteConfig.ts";
import { i18n } from "../i18n/translation.ts";
import { remarkCodeTree } from "../plugins/markdown/code/remark-code-tree.mjs";
import { remarkFileTree } from "../plugins/markdown/code/remark-file-tree.mjs";
import { CodeTreeComponent } from "../plugins/markdown/containers/rehype-code-tree.mjs";
import {
	CollapsePanelsComponent,
	rehypeCollapseGroups,
} from "../plugins/markdown/containers/rehype-collapse-panels.mjs";
import {
	FieldComponent,
	FieldGroupComponent,
} from "../plugins/markdown/containers/rehype-fields.mjs";
import { FileTreeComponent } from "../plugins/markdown/containers/rehype-file-tree.mjs";
import {
	OptionGroupsComponent,
	rehypeOptionGroupIds,
} from "../plugins/markdown/containers/rehype-option-groups.mjs";
import { StepsComponent } from "../plugins/markdown/containers/rehype-steps.mjs";
import { remarkAbbreviations } from "../plugins/markdown/remark-abbreviations.mjs";
import { remarkAcFun } from "../plugins/markdown/remark-acfun.mjs";
import { remarkAdmonitions } from "../plugins/markdown/remark-admonitions.mjs";
import { remarkArtPlayer } from "../plugins/markdown/remark-artplayer.mjs";
import { remarkAudioReader } from "../plugins/markdown/remark-audio-reader.mjs";
import { remarkBilibili } from "../plugins/markdown/remark-bilibili.mjs";
import { remarkCollapsePanels } from "../plugins/markdown/remark-collapse-panels.mjs";
import { remarkContentAnnotations } from "../plugins/markdown/remark-content-annotations.mjs";
import { remarkFields } from "../plugins/markdown/remark-fields.mjs";
import { remarkIncludes } from "../plugins/markdown/remark-includes.mjs";
import { remarkMarker } from "../plugins/markdown/remark-marker.mjs";
import { remarkOptionGroups } from "../plugins/markdown/remark-option-groups.mjs";
import { remarkYouTube } from "../plugins/markdown/remark-youtube.mjs";
import { AcFunComponent } from "../plugins/rehype-component-acfun.mjs";
import { AdmonitionComponent } from "../plugins/rehype-component-admonition.mjs";
import { ArtPlayerComponent } from "../plugins/rehype-component-artplayer.mjs";
import { AudioReaderComponent } from "../plugins/rehype-component-audio-reader.mjs";
import { BilibiliComponent } from "../plugins/rehype-component-bilibili.mjs";
import { GithubCardComponent } from "../plugins/rehype-component-github-card.mjs";
import { ImageGridComponent } from "../plugins/rehype-component-image-grid.mjs";
import { MarkerComponent } from "../plugins/rehype-component-marker.mjs";
import { SpoilerComponent } from "../plugins/rehype-component-spoiler.mjs";
import { YouTubeComponent } from "../plugins/rehype-component-youtube.mjs";
import { rehypeMarkdownImages } from "../plugins/rehype-markdown-images.mjs";
import { rehypeResponsiveTables } from "../plugins/rehype-responsive-tables.mjs";
import { parseDirectiveNode } from "../plugins/remark-directive-rehype.js";
import { remarkEscapeNumericColons } from "../plugins/remark-escape-numeric-colons.mjs";
import { remarkExcerpt } from "../plugins/remark-excerpt.js";
import { remarkFeatureProbes } from "../plugins/remark-feature-probes.mjs";
import { remarkMermaid } from "../plugins/remark-mermaid.mjs";
import { remarkReadingTime } from "../plugins/remark-reading-time.mjs";

// This processor is executed directly by Node tests, so avoid runtime imports
// of TypeScript enums (unsupported by Node's strip-only TypeScript loader).
const fieldI18nKeys = {
	required: "fieldRequired",
	optional: "fieldOptional",
	deprecated: "fieldDeprecated",
};

/**
 * 站点统一 Remark 插件链（单一事实来源）
 */
export const siteRemarkPlugins = [
	remarkEscapeNumericColons,
	remarkIncludes,
	remarkContentAnnotations,
	remarkAbbreviations,
	remarkAdmonitions,
	remarkCollapsePanels,
	remarkOptionGroups,
	remarkMarker,
	remarkMath,
	remarkFileTree,
	remarkCodeTree,
	remarkFields,
	remarkMermaid,
	remarkReadingTime,
	remarkExcerpt,
	remarkDirective,
	remarkAcFun,
	remarkAudioReader,
	remarkArtPlayer,
	remarkBilibili,
	remarkYouTube,
	remarkFeatureProbes,
	remarkSectionize,
	parseDirectiveNode,
];

/**
 * 站点统一 Rehype 插件链（单一事实来源）
 */
export const siteRehypePlugins = [
	rehypeKatex,
	rehypeSlug,
	rehypeCollapseGroups,
	rehypeOptionGroupIds,
	[
		rehypeComponents,
		{
			components: {
				acfun: AcFunComponent,
				"audio-reader": AudioReaderComponent,
				artplayer: ArtPlayerComponent,
				bilibili: BilibiliComponent,
				youtube: YouTubeComponent,
				collapse: CollapsePanelsComponent,
				tabs: OptionGroupsComponent,
				"file-tree": FileTreeComponent,
				"field-group": FieldGroupComponent,
				field: (properties, children) =>
					FieldComponent(
						{
							...properties,
							"label-required": i18n(fieldI18nKeys.required),
							"label-optional": i18n(fieldI18nKeys.optional),
							"label-deprecated": i18n(fieldI18nKeys.deprecated),
						},
						children,
					),
				"code-tree": CodeTreeComponent,
				steps: StepsComponent,
				github: GithubCardComponent,
				grid: ImageGridComponent,
				note: (x, y) => AdmonitionComponent(x, y, "note"),
				info: (x, y) => AdmonitionComponent(x, y, "info"),
				tip: (x, y) => AdmonitionComponent(x, y, "tip"),
				important: (x, y) => AdmonitionComponent(x, y, "important"),
				caution: (x, y) => AdmonitionComponent(x, y, "caution"),
				warning: (x, y) => AdmonitionComponent(x, y, "warning"),
				"admonition-details": (x, y) => AdmonitionComponent(x, y, "details"),
				"m3-mark": MarkerComponent,
				spoiler: SpoilerComponent,
			},
		},
	],
	[
		rehypeAutolinkHeadings,
		{
			behavior: "append",
			properties: {
				className: ["anchor"],
			},
			content: {
				type: "element",
				tagName: "span",
				properties: {
					className: ["anchor-icon"],
					"data-pagefind-ignore": true,
				},
				children: [
					{
						type: "text",
						value: "#",
					},
				],
			},
		},
	],
	// 图片通用增强（w-N% 宽度 / 标题图注 / 惰性加载）：殿后执行，
	// 确保 :::grid 等组件已渲染出跳过类名
	[
		rehypeMarkdownImages,
		{
			noReferrerDomains: siteConfig.imageOptimization?.noReferrerDomains ?? [],
		},
	],
	rehypeResponsiveTables,
];

/**
 * 站点统一 markdown 处理器（单一事实来源）。
 * astro.config.mjs 的 `markdown.processor` 与构建期离线渲染
 * （如动态页正文 → HTML 字符串）共用同一条 remark/rehype 插件链，
 * 避免两处配置漂移。
 */
export const siteMarkdownProcessor = unified({
	remarkPlugins: siteRemarkPlugins,
	rehypePlugins: siteRehypePlugins,
});
