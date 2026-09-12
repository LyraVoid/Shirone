import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	animeConfig,
	resolveAnimeOptions,
} from "../../src/config/animeConfig.ts";
import {
	normalizeAnimeItem,
	sortAnimeList,
} from "../../src/utils/anime/normalize.ts";
import { loadEnvFile } from "./load-env.mjs";
import { fetchBangumiData } from "./providers/bangumi.mjs";
import { fetchBilibiliData } from "./providers/bilibili.mjs";
import { commitSnapshot, isSnapshotStale } from "./snapshot-store.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

// 加载环境变量
loadEnvFile();

const SENSITIVE_PATTERNS = [
	/\bSESSDATA\b/i,
	/\bcookie\s*[:=]/i,
	/\bauthorization\s*[:=]/i,
	/\baccess_token\b/i,
	/\brefresh_token\b/i,
	/\bcsrf\b/i,
];

function scanForSensitiveData(jsonString) {
	for (const pattern of SENSITIVE_PATTERNS) {
		if (pattern.test(jsonString)) {
			throw new Error(
				`Security Violation: Forbidden sensitive pattern detected in snapshot data: ${pattern.toString()}`,
			);
		}
	}
}

/**
 * 同步单个 provider 的数据到快照文件。
 *
 * 写入目标恒为 `<provider>.json`（基线语义：自定义 `source.file` 是使用者输入，永不触碰）。
 * 抓取结果为空且 `keepLastValid` 开启时保留已有有效快照：打印警告后正常返回（不视为失败，
 * 部署流水线无需因「有意保留旧档」而中断）。
 */
async function syncProvider(providerName, targetDir, keepLastValid) {
	console.log("\n========================================");
	console.log(`Starting sync for provider: ${providerName.toUpperCase()}`);
	console.log("========================================");

	let fetchResult;

	if (providerName === "bangumi") {
		const bgmConfig = animeConfig.providers?.bangumi;
		if (!bgmConfig?.userId || bgmConfig.userId === "your-bangumi-id") {
			throw new Error(
				"Bangumi userId is not configured in src/config/animeConfig.ts",
			);
		}
		fetchResult = await fetchBangumiData(bgmConfig);
	} else if (providerName === "bilibili") {
		const biliConfig = animeConfig.providers?.bilibili;
		if (!biliConfig?.vmid || biliConfig.vmid === "your-bilibili-vmid") {
			throw new Error(
				"Bilibili vmid is not configured in src/config/animeConfig.ts",
			);
		}
		fetchResult = await fetchBilibiliData(biliConfig);
	} else {
		throw new Error(`Unsupported anime provider: ${providerName}`);
	}

	const normalizedItems = [];
	for (const rawItem of fetchResult.rawItems) {
		const item = normalizeAnimeItem(rawItem);
		if (item) {
			normalizedItems.push(item);
		}
	}

	const sortedItems = sortAnimeList(normalizedItems);

	const snapshot = {
		schemaVersion: 1,
		provider: providerName,
		fetchedAt: new Date().toISOString(),
		accountRef: String(fetchResult.accountRef || ""),
		items: sortedItems,
	};

	const jsonContent = JSON.stringify(snapshot, null, 2);

	// 敏感凭据扫描
	scanForSensitiveData(jsonContent);

	const targetFile = join(targetDir, `${providerName}.json`);
	const tempFile = join(targetDir, `.temp-${providerName}-${Date.now()}.json`);

	// 空结果不覆盖有效快照（snapshot.keepLastValid），其余情况原子写入
	const outcome = commitSnapshot({
		targetFile,
		tempFile,
		jsonContent,
		itemCount: sortedItems.length,
		keepLastValid,
	});

	if (outcome === "kept") {
		console.warn(
			`[anime-sync] ⚠ Provider "${providerName}" returned 0 items; ` +
				`kept the last valid snapshot at ${targetFile} ` +
				"(snapshot.keepLastValid = true). " +
				'Set "snapshot.keepLastValid: false" to allow empty snapshots.',
		);
		return;
	}

	console.log(
		`[anime-sync] ✓ Successfully synced ${sortedItems.length} items to ${targetFile}`,
	);
}

function isProviderConfigured(providerName) {
	if (providerName === "bangumi") {
		const bgmConfig = animeConfig.providers?.bangumi;
		return Boolean(
			bgmConfig?.enable &&
				bgmConfig.userId &&
				bgmConfig.userId !== "your-bangumi-id",
		);
	}
	if (providerName === "bilibili") {
		const biliConfig = animeConfig.providers?.bilibili;
		return Boolean(
			biliConfig?.enable &&
				biliConfig.vmid &&
				biliConfig.vmid !== "your-bilibili-vmid",
		);
	}
	return false;
}

function parseCliArgs() {
	const args = process.argv.slice(2);
	let provider = null;
	let ifStale = false;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--provider" && args[i + 1]) {
			provider = args[i + 1].toLowerCase();
			i++;
		} else if (args[i].startsWith("--provider=")) {
			provider = args[i].split("=")[1].toLowerCase();
		} else if (args[i] === "--if-stale") {
			ifStale = true;
		}
	}

	return { provider, ifStale };
}

async function main() {
	const resolved = resolveAnimeOptions(animeConfig);
	const { provider: cliProvider, ifStale } = parseCliArgs();

	const targetDir = join(projectRoot, resolved.snapshot.directory);

	let providersToSync = [];
	if (cliProvider === "all") {
		providersToSync = ["bangumi", "bilibili"];
	} else if (cliProvider === "bangumi" || cliProvider === "bilibili") {
		providersToSync = [cliProvider];
	} else if (resolved.source.kind === "snapshot" && resolved.source.provider) {
		if (isProviderConfigured(resolved.source.provider)) {
			providersToSync = [resolved.source.provider];
		} else {
			console.log(
				`[anime-sync] Provider "${resolved.source.provider}" configured in source.provider is not fully enabled or has placeholder ID. Skipping sync.`,
			);
			process.exit(0);
		}
	} else {
		// 默认检查哪些 provider 配置了有效 ID 并启用
		if (isProviderConfigured("bangumi")) {
			providersToSync.push("bangumi");
		}
		if (isProviderConfigured("bilibili")) {
			providersToSync.push("bilibili");
		}
		if (providersToSync.length === 0) {
			console.log(
				"[anime-sync] No active provider specified or enabled with valid ID.",
			);
			console.log(
				"Usage: node scripts/anime/sync.mjs --provider <bangumi|bilibili|all>",
			);
			process.exit(0);
		}
	}

	if (ifStale) {
		providersToSync = providersToSync.filter((p) =>
			isSnapshotStale(
				join(targetDir, `${p}.json`),
				resolved.snapshot.staleAfterDays,
			),
		);

		if (providersToSync.length === 0) {
			console.log(
				`[anime-sync] All active snapshots are fresh (< ${resolved.snapshot.staleAfterDays} days old). Skipping sync due to --if-stale.`,
			);
			process.exit(0);
		}
	}

	let hasError = false;
	for (const p of providersToSync) {
		try {
			await syncProvider(p, targetDir, resolved.snapshot.keepLastValid);
		} catch (error) {
			hasError = true;
			console.error(
				`[anime-sync] ✘ Failed to sync provider "${p}":`,
				error.message,
			);
		}
	}

	if (hasError) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("[anime-sync] Fatal error:", err);
	process.exit(1);
});
