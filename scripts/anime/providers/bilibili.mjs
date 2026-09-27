import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Package mode runs this provider from node_modules, so the user's project
// root must come from the process rather than the module's own location.
const projectRoot = process.cwd();
const API_BASE = "https://api.bilibili.com/x/space/bangumi/follow/list";
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const STATUS_MAP = [
	{ followStatus: 2, status: "watching" },
	{ followStatus: 3, status: "completed" },
	{ followStatus: 1, status: "planned" },
];

function parseBiliProgress(rawProgress) {
	if (typeof rawProgress === "number" && Number.isFinite(rawProgress)) {
		return Math.max(0, Math.floor(rawProgress));
	}
	if (typeof rawProgress === "string" && rawProgress.trim()) {
		const match = rawProgress.match(/(\d+)/);
		if (match) {
			return Number.parseInt(match[1], 10) || 0;
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

	return "webp";
}

async function downloadCoverLocally(coverUrl, id, coverConfig = {}) {
	if (!coverUrl || !coverUrl.startsWith("http")) return undefined;

	try {
		const coversDir = join(projectRoot, "public/assets/anime/covers");
		if (!existsSync(coversDir)) {
			mkdirSync(coversDir, { recursive: true });
		}

		let targetUrl = coverUrl;
		// 若启用了 useWebp（默认 true），B站图片 URL 追加裁剪尺寸与 webp 转换参数，避免 2MB 原图直落盘
		if (coverConfig.useWebp !== false && !targetUrl.includes("@")) {
			targetUrl = `${targetUrl}@220w_280h.webp`;
		}

		const res = await fetch(targetUrl, {
			headers: {
				"User-Agent": USER_AGENT,
				Referer: "https://www.bilibili.com/",
			},
			signal: AbortSignal.timeout(10000),
		});

		if (res.ok) {
			const arrayBuf = await res.arrayBuffer();
			const buffer = Buffer.from(arrayBuf);
			const ext = detectImageExtension(buffer, res.headers.get("content-type"));
			const fileName = `bili_${id}.${ext}`;
			const filePath = join(coversDir, fileName);

			writeFileSync(filePath, buffer);
			return `/assets/anime/covers/${fileName}`;
		}
	} catch (error) {
		console.warn(
			`[Bilibili] Failed to download cover locally for ${id}: ${error.message}`,
		);
	}
	return undefined;
}

/**
 * 获取 B 站单个状态下的追番列表分页
 */
async function fetchFollowStatusList(
	vmid,
	followStatus,
	status,
	sessdata,
	options,
) {
	const pageSize = Math.min(Math.max(10, options.pageSize || 30), 50);
	const maxItems = options.maxItems || 300;
	const minDelayMs = options.minDelayMs || 300;

	const headers = {
		"User-Agent": USER_AGENT,
		Referer: "https://space.bilibili.com/",
		Accept: "application/json",
	};
	if (sessdata) {
		headers.Cookie = `SESSDATA=${sessdata};`;
	}

	let pn = 1;
	let hasMore = true;
	const collected = [];

	while (hasMore && collected.length < maxItems) {
		const url = `${API_BASE}?type=1&follow_status=${followStatus}&vmid=${encodeURIComponent(vmid)}&ps=${pageSize}&pn=${pn}`;

		let res;
		try {
			const response = await fetch(url, {
				headers,
				signal: AbortSignal.timeout(15000),
			});
			if (!response.ok) {
				console.warn(
					`   [Bilibili] HTTP error ${response.status} for status ${status}`,
				);
				break;
			}
			res = await response.json();
		} catch (error) {
			console.warn(
				`   [Bilibili] Network error for status ${status}: ${error.message}`,
			);
			break;
		}

		if (res?.code !== 0) {
			if (res?.code === 53013 || res?.code === -400 || res?.code === -401) {
				console.warn(
					`   [Bilibili] Privacy or auth issue (code ${res.code}): ${res.message}. Provide valid SESSDATA if private.`,
				);
			} else {
				console.warn(
					`   [Bilibili] API returned code ${res?.code}: ${res?.message}`,
				);
			}
			break;
		}

		const list = res?.data?.list;
		const total = res?.data?.total ?? 0;

		if (Array.isArray(list) && list.length > 0) {
			collected.push(...list);
			if (
				list.length < pageSize ||
				collected.length >= total ||
				collected.length >= maxItems
			) {
				hasMore = false;
			} else {
				pn++;
				await delay(minDelayMs);
			}
		} else {
			hasMore = false;
		}
	}

	return collected.map((item) => ({ item, status }));
}

/**
 * Bilibili 提供方数据抓取入口
 */
export async function fetchBilibiliData(bilibiliConfig) {
	const vmid = bilibiliConfig.vmid?.trim();
	if (!vmid) {
		throw new Error(
			"Bilibili vmid is required in animeConfig.providers.bilibili.vmid",
		);
	}

	const sessdataEnvName = bilibiliConfig.sessdataEnv || "BILI_SESSDATA";
	const sessdata = process.env[sessdataEnvName] || "";
	const coverConfig = bilibiliConfig.cover || { mode: "local", useWebp: true };
	const requestOptions = bilibiliConfig.request || {};

	console.log(
		`[Bilibili] Starting sync for vmid: ${vmid} (credentials: ${sessdata ? "SESSDATA provided" : "public only"})...`,
	);

	const allEntries = [];
	for (const { followStatus, status } of STATUS_MAP) {
		console.log(
			`[Bilibili] Fetching follow list for status "${status}" (follow_status=${followStatus})...`,
		);
		const entries = await fetchFollowStatusList(
			vmid,
			followStatus,
			status,
			sessdata,
			requestOptions,
		);
		allEntries.push(...entries);
		console.log(
			`[Bilibili] Fetched ${entries.length} items for status "${status}".`,
		);
	}

	console.log(
		`[Bilibili] Total items collected: ${allEntries.length}. Normalizing...`,
	);

	const rawAnimeItems = [];

	for (const { item, status } of allEntries) {
		const title = item.title || "";
		if (!title.trim()) continue;

		const mediaId = item.media_id ? String(item.media_id) : undefined;
		const seasonId = item.season_id ? String(item.season_id) : undefined;
		const idKey = seasonId || mediaId || Math.random().toString(36).slice(2);

		const rating =
			typeof item.rating?.score === "number" && item.rating.score > 0
				? item.rating.score
				: 0;

		const watched = parseBiliProgress(item.progress);
		const total =
			typeof item.total_count === "number" && item.total_count > 0
				? item.total_count
				: 0;
		const progress = watched !== undefined ? { watched, total } : undefined;

		// 封面处理
		let cover = item.cover || "";
		if (cover) {
			if (cover.startsWith("http://"))
				cover = cover.replace("http://", "https://");
			if (cover.startsWith("//")) cover = `https:${cover}`;
		}

		if (coverConfig.mode === "local" && cover) {
			const localCover = await downloadCoverLocally(cover, idKey, coverConfig);
			cover = localCover || cover;
		} else if (coverConfig.mode === "remote" && cover) {
			if (coverConfig.useWebp !== false && !cover.includes("@")) {
				cover = `${cover}@220w_280h.webp`;
			}
			if (coverConfig.mirror) {
				cover = `${coverConfig.mirror.replace(/\/+$/, "")}/${cover.replace(/^https?:\/\//, "")}`;
			}
		} else if (coverConfig.mode === "none") {
			cover = "";
		}

		// 提取年份
		const rawDate = item.publish?.release_date || item.publish?.pub_time || "";
		let year = "";
		if (rawDate) {
			const match = String(rawDate).match(/(\d{4})/);
			if (match) year = match[1];
		}

		// 描述
		let description = item.evaluate || item.summary || "";
		if (description) {
			description = description.replace(/\n+/g, " ").trim();
		}

		// 制作/地区
		let studio;
		if (Array.isArray(item.areas) && item.areas.length > 0) {
			studio = item.areas[0]?.name;
		}

		// 标签/题材
		let genres = [];
		if (typeof item.styles === "string") {
			genres = item.styles.split(/[、,/\s]+/).filter(Boolean);
		} else if (Array.isArray(item.styles)) {
			genres = item.styles
				.map((s) => (typeof s === "string" ? s : s?.name))
				.filter(Boolean);
		}

		// 外链
		let link = item.url;
		if (!link) {
			if (mediaId) {
				link = `https://www.bilibili.com/bangumi/media/md${mediaId}`;
			} else if (seasonId) {
				link = `https://www.bilibili.com/bangumi/play/ss${seasonId}`;
			}
		}

		rawAnimeItems.push({
			title,
			status,
			rating,
			progress,
			cover: cover || undefined,
			link: link || undefined,
			description: description || undefined,
			year,
			studio,
			genres,
			identity: {
				provider: "bilibili",
				seasonId,
				sourceId: mediaId,
			},
		});
	}

	return {
		provider: "bilibili",
		accountRef: vmid,
		rawItems: rawAnimeItems,
	};
}
