import type { CollectionEntry } from "astro:content";

export type PostSource = "static" | "backend";

export interface BackendTerm {
	id: number;
	slug: string;
	name: string;
	description?: string;
}

export interface BackendDocument {
	id: number;
	kind: string;
	slug: string;
	title: string;
	body: string;
	excerpt?: string;
	metadata?: Record<string, unknown>;
	status: "draft" | "published" | "archived";
	publishedAt?: string | null;
	createdAt: string;
	updatedAt: string;
	terms?: BackendTerm[];
}

export interface PostViewModel {
	source: PostSource;
	id: string;
	slug: string;
	kind: string;
	title: string;
	body: string;
	description: string;
	image: string;
	tags: string[];
	category: string;
	lang: string;
	published: Date;
	updated?: Date;
	pinned: boolean;
	draft: boolean;
	comment: boolean;
	status: BackendDocument["status"];
	metadata: Readonly<Record<string, unknown>>;
	terms: BackendTerm[];
	password?: string;
	passwordHint: string;
	hideHomeContent: boolean;
	permalink?: string;
	prevUrl?: string;
	nextUrl?: string;
	prevTitle: string;
	prevSlug: string;
	nextTitle: string;
	nextSlug: string;
}

function stringValue(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function booleanValue(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function requiredDate(value: unknown, field: string): Date {
	const date =
		value instanceof Date ? new Date(value) : new Date(String(value));
	if (Number.isNaN(date.getTime())) {
		throw new TypeError(`${field} must be a valid date`);
	}
	return date;
}

export function postViewModelFromStatic(
	entry: CollectionEntry<"posts">,
): PostViewModel {
	return {
		source: "static",
		id: entry.id,
		slug: entry.id.replace(/\.(?:md|mdx|markdown)$/i, ""),
		kind: "post",
		title: entry.data.title,
		body: entry.body ?? "",
		description: entry.data.description,
		image: entry.data.image,
		tags: [...entry.data.tags],
		category: entry.data.category ?? "",
		lang: entry.data.lang,
		published: new Date(entry.data.published),
		updated: entry.data.updated ? new Date(entry.data.updated) : undefined,
		pinned: entry.data.pinned,
		draft: entry.data.draft,
		comment: entry.data.comment,
		status: entry.data.draft ? "draft" : "published",
		metadata: entry.data,
		terms: [],
		password: entry.data.password,
		passwordHint: entry.data.passwordHint,
		hideHomeContent: entry.data.hideHomeContent,
		permalink: entry.data.permalink,
		prevUrl: entry.data.prevUrl,
		nextUrl: entry.data.nextUrl,
		prevTitle: entry.data.prevTitle,
		prevSlug: entry.data.prevSlug,
		nextTitle: entry.data.nextTitle,
		nextSlug: entry.data.nextSlug,
	};
}

export function postViewModelFromBackend(
	document: BackendDocument,
): PostViewModel {
	if (!document || typeof document !== "object") {
		throw new TypeError("backend document is required");
	}
	if (!document.slug || !document.title || typeof document.body !== "string") {
		throw new TypeError("backend document must include slug, title, and body");
	}

	const metadata = document.metadata ?? {};
	const published = requiredDate(
		document.publishedAt ?? document.createdAt,
		"publishedAt",
	);
	const updated = requiredDate(document.updatedAt, "updatedAt");

	return {
		source: "backend",
		id: String(document.id),
		slug: document.slug,
		kind: document.kind || "post",
		title: document.title,
		body: document.body,
		description: document.excerpt || stringValue(metadata.description),
		image: stringValue(metadata.image),
		tags: stringArray(metadata.tags),
		category: stringValue(metadata.category),
		lang: stringValue(metadata.lang),
		published,
		updated,
		pinned: booleanValue(metadata.pinned, false),
		draft: document.status === "draft",
		comment: booleanValue(metadata.comment, true),
		status: document.status,
		metadata,
		terms: [...(document.terms ?? [])],
		password: stringValue(metadata.password) || undefined,
		passwordHint: stringValue(metadata.passwordHint),
		hideHomeContent: booleanValue(metadata.hideHomeContent, true),
		permalink: stringValue(metadata.permalink) || undefined,
		prevUrl: undefined,
		nextUrl: undefined,
		prevTitle: "",
		prevSlug: "",
		nextTitle: "",
		nextSlug: "",
	};
}
