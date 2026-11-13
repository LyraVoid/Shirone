import { applyMirror, downloadCoverLocally } from "./cover.mjs";

const BANGUMI_API_BASE = "https://api.bgm.tv";
const USER_AGENT = "Shirone/1.0 (https://github.com/shirone; AnimeSync)";
// lain.bgm.tv 图片下载用浏览器 UA（与 API 请求的标识 UA 区分）
const IMAGE_USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
 * 按封面策略处理单条封面 URL（对齐 Bilibili 的 cover 配置语义）。
 * Bangumi 默认 remote：lain.bgm.tv 无防盗链，直链可显示，快照仅存 URL 字符串。
 */
function resolveBangumiCover(coverUrl, subjectId, coverConfig) {
	if (!coverUrl || coverConfig.mode === "none") {
		return { cover: undefined, download: null };
	}

	// 协议统一升级 https（与 Bilibili 提供方行为一致）
	let cover = coverUrl.startsWith("http://")
		? coverUrl.replace("http://", "https://")
		: coverUrl;

	if (coverConfig.mode === "local") {
		// 无 subjectId 时跳过下载、保留远程直链，避免生成随机文件名产生孤儿文件
		if (!subjectId) return { cover };
		return {
			cover,
			download: downloadCoverLocally(cover, `bgm_${subjectId}`, {
				headers: { "User-Agent": IMAGE_USER_AGENT },
				tag: "Bangumi",
			}),
		};
	}

	// remote（默认）：查询式代理原样拼接，路径式镜像补足分隔符（同 Bilibili 语义）
	cover = applyMirror(cover, coverConfig.mirror);
	return { cover };
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
	// 默认 remote：与 Bilibili（默认 local，因防盗链必须本地化）不同，bgm.tv 直链可直接展示
	const coverConfig = bangumiConfig.cover || { mode: "remote" };
	console.log(
		`[Bangumi] Cover mode: ${coverConfig.mode}${
			coverConfig.mode === "remote" && coverConfig.mirror ? " (mirror)" : ""
		}`,
	);
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

				const coverUrl =
					subject.images?.medium ||
					subject.images?.large ||
					subject.images?.common ||
					detail?.images?.medium ||
					detail?.images?.large ||
					"";
				const { cover: remoteCover, download: coverDownload } =
					resolveBangumiCover(coverUrl, subjectId, coverConfig);
				let cover = remoteCover;
				if (coverDownload) {
					// 下载失败时回退远程直链，封面不缺位
					cover = (await coverDownload) || remoteCover;
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
