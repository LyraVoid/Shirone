import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * Post schema — used by both source repo (inline) and package mode users
 * (inline in their `src/content.config.ts`).
 */
export const postSchema = z.object({
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
	/** Series slug the post belongs to (empty = none; single series per post). */
	series: z
		.string()
		.optional()
		.default("")
		.transform((value) => value.trim()),
	/** Position inside the series; falls back to publication order when absent. */
	seriesOrder: z.number().int().optional(),
	lang: z.string().optional().default(""),

	/* Post encryption */
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
});

/** Schema for the short-form "moments" timeline. */
export const momentSchema = z.object({
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
	draft: z.boolean().optional().default(false),
});

/** Schema for free-form spec pages (currently just `about.md`). */
export const specSchema = z.object({});

/**
 * Schema for series entities. Each entry is one series; the Markdown body is
 * the optional overview rendered on the series page.
 */
export const seriesSchema = z.object({
	title: z.string(),
	status: z.enum(["ongoing", "completed"]).optional().default("ongoing"),
	defaultCategory: z.string().optional().default(""),
});

/**
 * Helper to create a collection definition with the standard glob loader.
 * Package mode users can import this if they need custom paths.
 */
export function createCollection(
	key: "posts" | "moments" | "spec" | "series",
	base: string,
) {
	const loaders = {
		posts: glob({ base: `${base}/posts`, pattern: "**/*.{md,mdx}" }),
		moments: glob({ base: `${base}/moments`, pattern: "**/*.md" }),
		spec: glob({ base: `${base}/spec`, pattern: "**/*.{md,mdx}" }),
		series: glob({ base: `${base}/series`, pattern: "**/*.md" }),
	};
	const schemas = {
		posts: postSchema,
		moments: momentSchema,
		spec: specSchema,
		series: seriesSchema,
	};
	return defineCollection({
		loader: loaders[key],
		schema: schemas[key],
	});
}
