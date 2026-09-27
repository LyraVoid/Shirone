/**
 * 番剧数据接入层：数据源分发 + 状态呈现元数据。
 *
 * 页面只依赖 getAnimeList(): Promise<AnimeItem[]> —— 数据源差异被收敛在这里：
 * - local：src/data/anime.ts 手写数据（默认，零外部依赖，极速稳定）；
 * - snapshot：读取 scripts/anime-sync.mjs 生成的本地脱敏快照（src/data/anime-snapshots/）；
 *   支持版本化 Envelope 封装，在快照丢失或异常时按配置回退至 local 或 empty，保证页面永不白屏；
 * - dev 动态热加载：在开发模式 (pnpm dev) 下，当配置了 fetchOnDev: true 时支持实时动态拉取 Bangumi/Bilibili 数据并自动同步快照。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { animeConfig, resolveAnimeOptions } from "../config/animeConfig.ts";
import { type AnimeItem, animeData } from "../data/anime.ts";
import type { ResolvedAnimeOptions } from "../types/animeConfig.ts";
import {
	normalizeAnimeItem,
	parseAnimeSnapshot,
	sortAnimeList,
} from "./anime/normalize.ts";
import { ANIME_STATUS_META } from "./anime/status.ts";

export { ANIME_STATUS_META };

async function fetchDevLiveSnapshot(
	provider: "bangumi" | "bilibili",
	options: ResolvedAnimeOptions,
): Promise<AnimeItem[] | null> {
	try {
		console.log(`[anime-dev] Live fetching ${provider} data for dev server...`);
		let rawItems: unknown[] = [];
		let accountRef = "";

		if (provider === "bangumi") {
			const bgmConfig = animeConfig.providers?.bangumi;
			if (
				!bgmConfig?.enable ||
				!bgmConfig?.userId ||
				bgmConfig.userId === "your-bangumi-id"
			) {
				return null;
			}
			const { fetchBangumiData } = await import(
				"../../scripts/anime/providers/bangumi.mjs"
			);
			const res = await fetchBangumiData(bgmConfig);
			rawItems = res.rawItems;
			accountRef = res.accountRef;
		} else if (provider === "bilibili") {
			const biliConfig = animeConfig.providers?.bilibili;
			if (
				!biliConfig?.enable ||
				!biliConfig?.vmid ||
				biliConfig.vmid === "your-bilibili-vmid"
			) {
				return null;
			}
			const { fetchBilibiliData } = await import(
				"../../scripts/anime/providers/bilibili.mjs"
			);
			const res = await fetchBilibiliData(biliConfig);
			rawItems = res.rawItems;
			accountRef = res.accountRef;
		}

		const items: AnimeItem[] = [];
		for (const raw of rawItems) {
			const item = normalizeAnimeItem(raw);
			if (item) items.push(item);
		}

		const sorted = sortAnimeList(items);

		if (sorted.length === 0) {
			// 空抓取结果不落盘：dev 场景只在快照文件缺失时走到这里，若把空结果写成文件，
			// 后续启动会因「文件已存在」永远跳过实时拉取，空基线将一直生效。
			console.warn(
				"[anime-dev] ⚠ Live fetch returned 0 items; snapshot file not written.",
			);
			return null;
		}

		// 异步更新本地快照文件
		const filename = options.source.file || `${provider}.json`;
		const dir = isAbsolute(options.snapshot.directory)
			? options.snapshot.directory
			: resolve(process.cwd(), options.snapshot.directory);
		const filePath = join(dir, filename);

		const envelope = {
			schemaVersion: 1,
			provider,
			fetchedAt: new Date().toISOString(),
			accountRef,
			items: sorted,
		};

		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(filePath, JSON.stringify(envelope, null, 2), "utf-8");
		console.log(
			`[anime-dev] ✓ Live fetched ${sorted.length} items and updated ${filePath}`,
		);

		return sorted;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.warn(
			`[anime-dev] ⚠ Live fetch failed (${msg}), falling back to disk snapshot.`,
		);
		return null;
	}
}

/**
 * 获取番剧渲染列表
 * @param customOptions 可选的覆盖配置（用于测试或指定运行时选项）
 */
export async function getAnimeList(
	customOptions?: ResolvedAnimeOptions,
): Promise<AnimeItem[]> {
	const options = customOptions ?? resolveAnimeOptions(animeConfig);

	if (!options.enable) {
		return [];
	}

	if (options.source.kind === "local") {
		return animeData;
	}

	if (options.source.kind === "snapshot") {
		const filename = options.source.file;
		if (!filename) {
			return handleFallback(options, "No snapshot file specified");
		}

		const dir = isAbsolute(options.snapshot.directory)
			? options.snapshot.directory
			: resolve(process.cwd(), options.snapshot.directory);
		const filePath = join(dir, filename);
		const provider = options.source.provider;
		const isDev = Boolean(
			typeof import.meta !== "undefined" &&
				(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV,
		);

		// 如果快照文件尚不存在，但在开发模式下开启了 fetchOnDev，自动发起实时拉取并保存快照
		if (!existsSync(filePath)) {
			if (
				isDev &&
				options.source.fetchOnDev !== false &&
				(provider === "bangumi" || provider === "bilibili")
			) {
				const liveItems = await fetchDevLiveSnapshot(provider, options);
				if (liveItems && liveItems.length > 0) {
					return liveItems;
				}
			}
			return handleFallback(options, `Snapshot file not found: ${filePath}`);
		}

		try {
			const content = readFileSync(filePath, "utf-8");
			const result = parseAnimeSnapshot(content);

			if (!result || !Array.isArray(result.items)) {
				return handleFallback(
					options,
					`Failed to parse snapshot schema: ${filePath}`,
				);
			}

			// 检查快照时效（仅在控制台输出构建提示，不破坏静态渲染）
			if (result.envelope?.fetchedAt) {
				const fetchedTime = new Date(result.envelope.fetchedAt).getTime();
				if (!Number.isNaN(fetchedTime)) {
					const ageDays = (Date.now() - fetchedTime) / (1000 * 60 * 60 * 24);
					if (ageDays > options.snapshot.staleAfterDays) {
						console.warn(
							`[anime] ⚠ Snapshot "${filename}" is stale (${Math.floor(ageDays)} days old, fetched at ${result.envelope.fetchedAt}). Run "pnpm anime:sync" to refresh.`,
						);
					}
				}
			}

			// 开发模式下若快照与当前配置的账号不一致，给出明确指引
			if (isDev && result.envelope) {
				const configuredAccount =
					options.source.provider === "bangumi"
						? animeConfig.providers?.bangumi?.userId
						: animeConfig.providers?.bilibili?.vmid;
				if (
					configuredAccount &&
					result.envelope.accountRef &&
					result.envelope.accountRef !== configuredAccount
				) {
					console.warn(
						`[anime] ⚠ Snapshot accountRef ("${result.envelope.accountRef}") does not match configured userId ("${configuredAccount}"). Run "pnpm anime:sync" to fetch latest data.`,
					);
				}
			}

			return result.items;
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			return handleFallback(
				options,
				`Error reading snapshot file ${filePath}: ${msg}`,
			);
		}
	}

	return animeData;
}

function handleFallback(
	options: ResolvedAnimeOptions,
	reason: string,
): AnimeItem[] {
	console.warn(`[anime] ⚠ ${reason}. Falling back to "${options.fallback}".`);
	if (options.fallback === "local") {
		return animeData;
	}
	return [];
}
