import type { CollectionEntry } from "astro:content";
import { createBackendClient, resolveRuntimeMode } from "./backend-client.mjs";
import {
	type BackendDocument,
	type PostViewModel,
	postViewModelFromBackend,
	postViewModelFromStatic,
} from "./post-view-model.ts";

export interface StaticPostSource {
	listPosts(): Promise<CollectionEntry<"posts">[]>;
	getPost?(slug: string): Promise<CollectionEntry<"posts"> | undefined>;
}

export interface ContentProviderOptions {
	environment?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
	defaultHeaders?: HeadersInit;
	staticSource?: StaticPostSource;
}

export interface PostContentProvider {
	readonly mode: "static" | "dynamic";
	listPosts(options?: { limit?: number }): Promise<PostViewModel[]>;
	listPostsPage(options?: {
		limit?: number;
		offset?: number;
	}): Promise<{ items: PostViewModel[]; total: number }>;
	getPost(slug: string): Promise<PostViewModel | undefined>;
}

function documentList(payload: unknown): BackendDocument[] {
	if (!payload || typeof payload !== "object") {
		throw new TypeError("backend content response must be an object");
	}
	const items = (payload as { items?: unknown }).items;
	if (!Array.isArray(items)) {
		throw new TypeError("backend content response must include an items array");
	}
	return items as BackendDocument[];
}

export function createPostContentProvider({
	environment = process.env,
	fetchImpl = globalThis.fetch,
	defaultHeaders,
	staticSource,
}: ContentProviderOptions = {}): PostContentProvider {
	const runtime = resolveRuntimeMode(environment);
	if (runtime.mode === "static") {
		return Object.freeze({
			mode: "static" as const,
			async listPosts({ limit }: { limit?: number } = {}) {
				if (!staticSource) {
					throw new Error("staticSource is required to read static posts");
				}
				const entries = await staticSource.listPosts();
				const selected =
					limit === undefined ? entries : entries.slice(0, limit);
				return selected.map(postViewModelFromStatic);
			},
			async listPostsPage({
				limit,
				offset = 0,
			}: {
				limit?: number;
				offset?: number;
			} = {}) {
				const entries = await this.listPosts();
				const start = Math.max(0, offset);
				const end = limit === undefined ? undefined : start + limit;
				return { items: entries.slice(start, end), total: entries.length };
			},
			async getPost(slug: string) {
				if (!staticSource?.getPost) {
					throw new Error(
						"staticSource.getPost is required to read a static post",
					);
				}
				const entry = await staticSource.getPost(slug);
				return entry ? postViewModelFromStatic(entry) : undefined;
			},
		});
	}

	if (!runtime.apiBaseUrl) {
		throw new Error("dynamic runtime requires an API base URL");
	}
	const client = createBackendClient({
		baseUrl: runtime.apiBaseUrl,
		fetchImpl,
		defaultHeaders,
	});
	return Object.freeze({
		mode: "dynamic" as const,
		async listPosts({ limit = 20 }: { limit?: number } = {}) {
			const documents = documentList(
				await client.listContent({ limit, kind: "post" }),
			);
			return documents
				.filter((document) => document.kind === "post")
				.map(postViewModelFromBackend);
		},
		async listPostsPage({
			limit = 20,
			offset = 0,
		}: {
			limit?: number;
			offset?: number;
		} = {}) {
			const payload = (await client.listContent({
				limit,
				offset,
				kind: "post",
			})) as {
				items?: unknown;
				total?: unknown;
			};
			return {
				items: documentList(payload).map(postViewModelFromBackend),
				total:
					typeof payload.total === "number"
						? payload.total
						: documentList(payload).length,
			};
		},
		async getPost(slug: string) {
			try {
				const document = (await client.getContent(slug)) as BackendDocument;
				return document.kind === "post"
					? postViewModelFromBackend(document)
					: undefined;
			} catch (error) {
				if (
					error instanceof Error &&
					"status" in error &&
					error.status === 404
				) {
					return undefined;
				}
				throw error;
			}
		},
	});
}
