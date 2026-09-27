import type {
	AnimeConfig,
	AnimeFallbackKind,
	AnimeProvider,
	AnimeSourceKind,
	ResolvedAnimeOptions,
} from "../types/animeConfig.ts";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Shirone 番剧页面与外部数据源配置
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 遵循「零额外负担」原则与双平面模型（`docs/remote-data-system.md`）：
 * - 本地模式 (local)：完全离线，直接使用 `src/data/anime.ts`，零网络、零构建脚本负担；
 * - 快照模式 (snapshot)：读取构建期抓取清洗后的本地脱敏 JSON 快照（`src/data/anime-snapshots/`）；
 * - 外部同步完全发生在显式 `pnpm anime:sync` 阶段，严禁页面运行时或默认构建时直接请求外部 API；
 * - 私密凭据（如 B站 SESSDATA）仅通过环境变量注入同步进程，绝不进入客户端代码与 Git 提交。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 【常用配置场景】
 * ─────────────────────────────────────────────────────────────────────────────
 * 场景 A：使用本地手写数据（默认，最稳定安全）
 *   ```ts
 *   source: { kind: "local" }
 *   ```
 *
 * 场景 B：使用 Bangumi 追番快照
 *   1. 填入你的 Bangumi 用户 ID，将 `providers.bangumi.enable` 置为 `true`；
 *   2. 将 `source` 设置为 `{ kind: "snapshot", provider: "bangumi" }`；
 *   3. 终端执行 `pnpm.cmd anime:sync --provider bangumi` 生成快照。
 *
 * 场景 C：使用 Bilibili 追番快照
 *   1. 填入你的 B 站 UID (`vmid`)，将 `providers.bilibili.enable` 置为 `true`；
 *   2. 若追番列表设为私密，在 `.env` 中配置 `BILI_SESSDATA="your_sessdata"`；
 *   3. 将 `source` 设置为 `{ kind: "snapshot", provider: "bilibili" }`；
 *   4. 终端执行 `pnpm.cmd anime:sync --provider bilibili` 生成快照。
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const animeConfig: AnimeConfig = withUserConfig("anime", {
	/** 是否启用番剧页；false 时导航入口同步隐藏，访问 /anime/ 跳转 404 */
	enable: true,
	title: "$t:anime",
	description: "$t:animeBanner",

	/** 主数据源选择 */
	source: {
		kind: "local",
		// provider: "bangumi",
		// file: "bangumi.json",
		// fetchOnDev: true,
	},

	/** 异常降级策略（快照丢失或解析失败时回退本地数据） */
	fallback: {
		kind: "local",
	},

	/** 外部提供方配置 */
	providers: {
		bangumi: {
			enable: false,
			userId: "", // 填入你的 Bangumi 数字 UID 或公开用户名（测试可填 "sai"）
			request: {
				pageSize: 50,
				maxItems: 300,
				minDelayMs: 200,
			},
		},
		bilibili: {
			enable: false,
			vmid: "", // 填入你的 B 站公开 UID
			sessdataEnv: "BILI_SESSDATA",
			cover: {
				mode: "local", // "local" 站内下载缓存（推荐）| "remote" 远程链接 | "none"
				useWebp: true,
			},
			request: {
				pageSize: 30,
				maxItems: 300,
				minDelayMs: 300,
			},
		},
	},

	/** 快照存储管理 */
	snapshot: {
		directory: "src/data/anime-snapshots",
		staleAfterDays: 30,
		keepLastValid: true,
	},
});

const SAFE_FILENAME_PATTERN = /^[a-zA-Z0-9_-]+\.json$/;

/**
 * 校验并解析 Anime 配置，返回只读的标准选项
 */
export function resolveAnimeOptions(config: AnimeConfig): ResolvedAnimeOptions {
	const enable = Boolean(config.enable);
	const fallback: AnimeFallbackKind =
		config.fallback?.kind === "empty" ? "empty" : "local";

	const directory =
		typeof config.snapshot?.directory === "string" &&
		config.snapshot.directory.trim() &&
		!config.snapshot.directory.includes("..")
			? config.snapshot.directory.trim().replace(/[\\/]+$/, "")
			: "src/data/anime-snapshots";

	const staleAfterDays =
		typeof config.snapshot?.staleAfterDays === "number" &&
		Number.isFinite(config.snapshot.staleAfterDays) &&
		config.snapshot.staleAfterDays > 0
			? Math.floor(config.snapshot.staleAfterDays)
			: 30;

	const keepLastValid = config.snapshot?.keepLastValid ?? true;

	const rawKind = config.source?.kind;
	let kind: AnimeSourceKind = "local";
	let provider: AnimeProvider | undefined;
	let file: string | undefined;

	if (rawKind === "snapshot") {
		const rawProvider = config.source?.provider;
		if (rawProvider === "bangumi" || rawProvider === "bilibili") {
			provider = rawProvider;
		}

		const rawFile = config.source?.file?.trim();
		if (
			rawFile &&
			SAFE_FILENAME_PATTERN.test(rawFile) &&
			// 若指定了 provider 但 file 误填了另一 provider 的 json，自动校正为对应 provider 的 json 文件
			!(provider === "bilibili" && rawFile === "bangumi.json") &&
			!(provider === "bangumi" && rawFile === "bilibili.json")
		) {
			file = rawFile;
		} else if (provider) {
			file = `${provider}.json`;
		}

		const fetchOnDev = config.source?.fetchOnDev ?? true;

		if (file) {
			kind = "snapshot";
		}

		return Object.freeze({
			enable,
			source: Object.freeze({
				kind,
				...(provider ? { provider } : {}),
				...(file ? { file } : {}),
				fetchOnDev,
			}),
			fallback,
			snapshot: Object.freeze({
				directory,
				staleAfterDays,
				keepLastValid,
			}),
		});
	}

	return Object.freeze({
		enable,
		source: Object.freeze({
			kind,
			...(provider ? { provider } : {}),
			...(file ? { file } : {}),
			fetchOnDev: config.source?.fetchOnDev ?? true,
		}),
		fallback,
		snapshot: Object.freeze({
			directory,
			staleAfterDays,
			keepLastValid,
		}),
	});
}

export const resolvedAnimeOptions: ResolvedAnimeOptions =
	resolveAnimeOptions(animeConfig);
