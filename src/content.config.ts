import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const postsCollection = defineCollection({
	loader: glob({ base: "./src/content/posts", pattern: "**/*.{md,mdx}" }),
	schema: z.object({
		title: z.string(),
		published: z.date(),
		publishedAt: z.date().optional(),
		updated: z.date().optional(),
		updatedAt: z.date().optional(),
		pinned: z.boolean().optional().default(false),
		draft: z.boolean().optional().default(false),
		comment: z.boolean().optional().default(true),
		description: z.string().optional().default(""),
		image: z.string().optional().default(""),
		tags: z.array(z.string()).optional().default([]),
		category: z.string().optional().nullable().default(""),
		/** 所属系列 slug（空 = 不属于任何系列；单归属；落库前统一 trim） */
		series: z
			.string()
			.optional()
			.default("")
			.transform((value) => value.trim()),
		/** 系列内顺序；缺省回退为按发布日期排 */
		seriesOrder: z.number().int().optional(),
		lang: z.string().optional().default(""),

		/* 单篇版权覆写（省略字段回退到全站 licenseConfig；字符串简写许可证名称） */
		license: z
			.union([
				z.string(),
				z.object({
					enable: z.boolean().optional(),
					name: z.string().optional(),
					url: z.string().optional(),
					/** 作者：字符串或 { name, url } */
					author: z
						.union([
							z.string(),
							z.object({
								name: z.string().optional(),
								url: z.string().optional(),
							}),
						])
						.optional(),
					/** 转载来源链接；留空表示原创 */
					source: z.string().optional(),
				}),
			])
			.optional(),

		/* Post Encryption */
		encrypted: z.boolean().optional().default(false),
		password: z
			.union([z.string(), z.number()])
			.transform((v) => String(v))
			.optional(),
		passwordHint: z.string().optional().default(""),
		hideHomeContent: z.boolean().optional().default(true),

		/* Post alias & custom permalink */
		alias: z.string().optional(),
		permalink: z.string().optional(),

		/* For internal use */
		prevUrl: z.string().optional(),
		nextUrl: z.string().optional(),
		prevTitle: z.string().default(""),
		prevSlug: z.string().default(""),
		nextTitle: z.string().default(""),
		nextSlug: z.string().default(""),
	}),
});

const specCollection = defineCollection({
	loader: glob({ base: "./src/content/spec", pattern: "**/*.{md,mdx}" }),
	schema: z.object({}),
});

/**
 * 系列实体集合：每篇 = 一个系列。body 是可选总览，未写则系列页仅列文章。
 * defaultCategory 是回退值（显式 category 优先），解析见 utils/series-utils.ts。
 */
const seriesCollection = defineCollection({
	loader: glob({ base: "./src/content/series", pattern: "**/*.md" }),
	schema: z.object({
		title: z.string(),
		status: z.enum(["ongoing", "completed"]).optional().default("ongoing"),
		defaultCategory: z.string().optional().default(""),
	}),
});

const momentsCollection = defineCollection({
	loader: glob({ base: "./src/content/moments", pattern: "**/*.md" }),
	schema: z.object({
		published: z.date(),
		pinned: z.boolean().optional().default(false),
		location: z.string().optional().default(""),
		/** Mood icon (Iconify name, e.g. `material-symbols:sentiment-excited-outline-rounded`). */
		mood: z.string().optional().default(""),
		tags: z.array(z.string()).optional().default([]),
		images: z
			.array(
				z.object({
					src: z.string(),
					alt: z.string().optional().default(""),
				}),
			)
			.optional()
			.default([]),
		/* Moment encryption */
		encrypted: z.boolean().optional().default(false),
		password: z
			.union([z.string(), z.number()])
			.transform((value) => String(value))
			.optional(),
		passwordHint: z.string().optional().default(""),
		draft: z.boolean().optional().default(false),
	}),
});

export const collections = {
	posts: postsCollection,
	spec: specCollection,
	series: seriesCollection,
	moments: momentsCollection,
} as const;
