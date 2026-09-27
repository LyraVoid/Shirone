import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BANGUMI_API_BASE = "https://api.bgm.tv";
const USER_AGENT = "Shirone/1.0 (https://github.com/shirone; AnimeSync)";

// Package mode runs this provider from node_modules, so the user's project
// root must come from the process rather than the module's own location.
const projectRoot = process.cwd();
const COVERS_DIR = join(projectRoot, "public/assets/anime/covers");
const BANGUMI_REFERER = "https://bgm.tv/";
const COVER_EXTENSIONS = ["webp", "jpg", "png", "gif", "avif"];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const STATUS_COLLECTIONS = [
	{ type: 3, status: "watching" },
	{ type: 2, status: "completed" },
	{ type: 1, status: "planned" },
	{ type: 4, status: "onHold" },
	{ type: 5, status: "dropped" },
];

function extractStudioFromInfobox(infobox) {
	if (!Array.isArray(infobox)) return undefined;
	const targetKeys = [
		"动画制作",
		"制作",
		"製作",
		"开发",
		"Animation Production",
	];

	for (const key of targetKeys) {
		const item = infobox.find((i) => i.key === key);
		if (item) {
			if (typeof item.value === "string" && item.value.trim()) {
				return item.value.trim();
			}
			if (Array.isArray(item.value)) {
				const validItem = item.value.find(
					(v) => v && (v.v || typeof v === "string"),
				);
				if (validItem) {
					return typeof validItem === "string"
						? validItem.trim()
						: validItem.v?.trim();
				}
			}
		}
	}
	return undefined;
}

function detectImageExtension(buffer, contentType) {
	if (buffer && buffer.length >= 4) {
		// JPEG: FF D8 FF
		if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
			return "jpg";
		}
		// PNG: 89 50 4E 47
		if (
			buffer[0] === 0x89 &&
			buffer[1] === 0x50 &&
			buffer[2] === 0x4e &&
			buffer[3] === 0x47
		) {
			return "png";
		}
		// WebP: RIFF ... WEBP (52 49 46 46 .... 57 45 42 50)
		if (
			buffer.length >= 12 &&
			buffer[0] === 0x52 &&
			buffer[1] === 0x49 &&
			buffer[2] === 0x46 &&
			buffer[3] === 0x46 &&
			buffer[8] === 0x57 &&
			buffer[9] === 0x45 &&
			buffer[10] === 0x42 &&
			buffer[11] === 0x50
		) {
			return "webp";
		}
		// GIF: 47 49 46 38
		if (
			buffer[0] === 0x47 &&
			buffer[1] === 0x49 &&
			buffer[2] === 0x46 &&
			buffer[3] === 0x38
		) {
			return "gif";
		}
		// AVIF: ....ftypavif
		if (buffer.length >= 12) {
			const sub = buffer.subarray(4, 12).toString("binary");
			if (sub === "ftypavif" || sub === "ftypavis") {
				return "avif";
			}
		}
	}

	if (contentType) {
		const ct = contentType.toLowerCase();
		if (ct.includes("image/webp")) return "webp";
		if (ct.includes("image/png")) return "png";
		if (ct.includes("image/jpeg") || ct.includes("image/jpg")) return "jpg";
		if (ct.includes("image/gif")) return "gif";
		if (ct.includes("image/avif")) return "avif";
	}

	return "jpg";
}

/**
 * 查找已缓存的本地封面：命中时跳过网络下载，避免重复同步重复拉取。
 */
function findCachedCover(id) {
	if (!id) return undefined;
	for (const ext of COVER_EXTENSIONS) {
		const fileName = `bgm_${id}.${ext}`;
		if (existsSync(join(COVERS_DIR, fileName))) {
			return `/assets/anime/covers/${fileName}`;
		}
	}
	return undefined;
}

/**
 * 将 Bangumi 封面下载到站内 public/assets/anime/covers/（local 模式）。
 * Bangumi 图片 CDN 不支持 B 站式 `@` 处理参数，故原图下载后按魔数修正扩展名。
 */
async function downloadCoverLocally(coverUrl, id, coverConfig = {}) {
	if (!coverUrl?.startsWith("http")) return undefined;

	const cached = findCachedCover(id);
	if (cached) return cached;

	try {
		if (!existsSync(COVERS_DIR)) {
			mkdirSync(COVERS_DIR, { recursive: true });
		}

		// 优先请求 WebP，CDN/反向代理支持时直接落盘更小的体积
		const headers = {
			"User-Agent": USER_AGENT,
			Referer: BANGUMI_REFERER,
		};
		if (coverConfig.useWebp !== false) {
			headers.Accept = "image/webp,image/avif,image/*,*/*;q=0.8";
		}

		const res = await fetch(coverUrl, {
			headers,
			signal: AbortSignal.timeout(10000),
		});

		if (res.ok) {
			const buffer = Buffer.from(await res.arrayBuffer());
			const ext = detectImageExtension(buffer, res.headers.get("content-type"));
			const fileName = `bgm_${id}.${ext}`;
			const filePath = join(COVERS_DIR, fileName);

			writeFileSync(filePath, buffer);
			return `/assets/anime/covers/${fileName}`;
		}
	} catch (error) {
		console.warn(
			`[Bangumi] Failed to download cover locally for ${id}: ${error.message}`,
		);
	}
	return undefined;
}

async function fetchJson(url, timeoutMs = 15000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				"User-Agent": USER_AGENT,
				Accept: "application/json",
			},
		});
		if (!res.ok) {
			return { ok: false, status: res.status, statusText: res.statusText };
		}
		const data = await res.json();
		return { ok: true, data };
	} catch (error) {
		return { ok: false, error };
	} finally {
		clearTimeout(timer);
	}
}

async function fetchSubjectDetail(subjectId) {
	const res = await fetchJson(
		`${BANGUMI_API_BASE}/v0/subjects/${subjectId}`,
		10000,
	);
	if (res.ok && res.data) {
		return res.data;
	}
	return null;
}

/**
 * 获取单个状态类别的用户收藏列表
 */
async function fetchCollectionType(userId, type, status, options) {
	const pageSize = Math.min(Math.max(10, options.pageSize || 50), 100);
	const maxItems = options.maxItems || 100;
	const minDelayMs = options.minDelayMs || 200;

	let offset = 0;
	let hasMore = true;
	const collected = [];

	while (hasMore && collected.length < maxItems) {
		const limit = Math.min(pageSize, maxItems - collected.length);
		const url = `${BANGUMI_API_BASE}/v0/users/${encodeURIComponent(userId)}/collections?subject_type=2&type=${type}&limit=${limit}&offset=${offset}`;

		const res = await fetchJson(url);
		if (!res.ok) {
			if (res.status === 404) {
				console.log(
					`   [Bangumi] User ${userId} has no data or 404 for type ${type}`,
				);
				return [];
			}
			console.warn(
				`   [Bangumi] Request failed for type ${type}: HTTP ${res.status || res.error?.message}`,
			);
			break;
		}

		const data = res.data;
		if (data && Array.isArray(data.data) && data.data.length > 0) {
			collected.push(...data.data);
			if (
				data.data.length < limit ||
				collected.length >= (data.total || maxItems)
			) {
				hasMore = false;
			} else {
				offset += limit;
				await delay(minDelayMs);
			}
		} else {
			hasMore = false;
		}
	}

	return collected.map((item) => ({ item, status }));
}

/**
 * Bangumi 提供方数据抓取入口
 */
export async function fetchBangumiData(bangumiConfig) {
	const userId = bangumiConfig.userId?.trim();
	if (!userId) {
		throw new Error(
			"Bangumi userId is required in animeConfig.providers.bangumi.userId",
		);
	}

	const requestOptions = bangumiConfig.request || {};
	const coverConfig = bangumiConfig.cover || { mode: "local", useWebp: true };
	console.log(`[Bangumi] Starting sync for user: ${userId}...`);

	const allEntries = [];
	for (const { type, status } of STATUS_COLLECTIONS) {
		console.log(
			`[Bangumi] Fetching collection status "${status}" (type ${type})...`,
		);
		const entries = await fetchCollectionType(
			userId,
			type,
			status,
			requestOptions,
		);
		allEntries.push(...entries);
		console.log(
			`[Bangumi] Fetched ${entries.length} items for status "${status}".`,
		);
	}

	console.log(
		`[Bangumi] Total raw items collected: ${allEntries.length}. Fetching details with concurrency...`,
	);

	const rawAnimeItems = [];
	const CONCURRENCY = 6;
	const BATCH_DELAY = 100;

	for (let i = 0; i < allEntries.length; i += CONCURRENCY) {
		const batch = allEntries.slice(i, i + CONCURRENCY);
		const batchResults = await Promise.all(
			batch.map(async ({ item, status }) => {
				const subjectId = item.subject_id;
				const subject = item.subject || {};

				let detail = null;
				if (subjectId) {
					detail = await fetchSubjectDetail(subjectId);
				}

				const title =
					subject.name_cn ||
					subject.name ||
					detail?.name_cn ||
					detail?.name ||
					"";
				if (!title.trim()) return null;

				const rating =
					typeof item.rate === "number" && item.rate > 0
						? item.rate
						: typeof subject.score === "number"
							? subject.score
							: typeof detail?.rating?.score === "number"
								? detail.rating.score
								: 0;

				const watched = typeof item.ep_status === "number" ? item.ep_status : 0;
				const total =
					typeof subject.eps === "number" && subject.eps > 0
						? subject.eps
						: typeof detail?.eps === "number" && detail.eps > 0
							? detail.eps
							: typeof detail?.total_episodes === "number"
								? detail.total_episodes
								: 0;

				let cover =
					subject.images?.medium ||
					subject.images?.large ||
					subject.images?.common ||
					detail?.images?.medium ||
					detail?.images?.large ||
					"";

				// 封面处理：local 站内缓存（默认）/ remote 远程链接 / none 占位
				if (cover) {
					if (cover.startsWith("//")) cover = `https:${cover}`;
					if (cover.startsWith("http://")) {
						cover = cover.replace("http://", "https://");
					}

					const coverKey = subjectId
						? String(subjectId)
						: String(item.id || title)
								.replace(/[^a-zA-Z0-9_-]/g, "_")
								.slice(0, 64);

					if (coverConfig.mode === "local") {
						const localCover = await downloadCoverLocally(
							cover,
							coverKey,
							coverConfig,
						);
						cover = localCover || cover;
					} else if (coverConfig.mode === "remote") {
						if (coverConfig.mirror) {
							cover = `${coverConfig.mirror.replace(/\/+$/, "")}/${cover.replace(/^https?:\/\//, "")}`;
						}
					} else if (coverConfig.mode === "none") {
						cover = "";
					}
				}

				const rawDate = subject.date || detail?.date || "";
				const year = rawDate ? String(rawDate).slice(0, 4) : "";

				const description =
					detail?.summary ||
					subject.short_summary ||
					detail?.short_summary ||
					"";

				const studio = extractStudioFromInfobox(detail?.infobox);

				const rawTags = Array.isArray(subject.tags)
					? subject.tags
							.map((t) => (typeof t === "string" ? t : t?.name))
							.filter(Boolean)
					: Array.isArray(detail?.tags)
						? detail.tags
								.map((t) => (typeof t === "string" ? t : t?.name))
								.filter(Boolean)
						: [];

				const link = subjectId
					? `https://bgm.tv/subject/${subjectId}`
					: undefined;

				return {
					title,
					status,
					rating,
					progress: { watched, total },
					cover: cover || undefined,
					link,
					description: description || undefined,
					year,
					studio,
					genres: rawTags,
					identity: {
						provider: "bangumi",
						subjectId: subjectId ? String(subjectId) : undefined,
					},
				};
			}),
		);

		for (const res of batchResults) {
			if (res) rawAnimeItems.push(res);
		}

		const processedCount = Math.min(i + CONCURRENCY, allEntries.length);
		if (processedCount % 30 === 0 || processedCount === allEntries.length) {
			console.log(
				`[Bangumi] Processed ${processedCount}/${allEntries.length} items...`,
			);
		}

		if (i + CONCURRENCY < allEntries.length) {
			await delay(BATCH_DELAY);
		}
	}

	return {
		provider: "bangumi",
		accountRef: userId,
		rawItems: rawAnimeItems,
	};
}
