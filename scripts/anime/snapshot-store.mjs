import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

/**
 * 快照落盘决策与原子写入（供 `scripts/anime/sync.mjs` 与单元测试共用）。
 *
 * 快照文件的归属契约（见 `docs/remote-data-system.md`「番剧」一节）：
 * - `<provider>.json` 是 `anime:sync` 的唯一写入目标，语义为「基线 / last-known-good」：
 *   抓取结果为空且 `snapshot.keepLastValid` 开启时，若已存在非空有效快照则保留旧档；
 * - 自定义 `source.file`（如 `manual.json`）是使用者的纯静态输入，`anime:sync` 永不写入。
 */

/**
 * 读取目标快照的有效条目数。
 *
 * 文件缺失、损坏或缺少 `items` 数组时返回 0——它们都不构成「有效快照」，
 * 也就不值得为它们触发 keepLastValid 保护。
 */
export function readSnapshotItemCount(filePath) {
	if (!existsSync(filePath)) return 0;
	try {
		const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
		return Array.isArray(parsed?.items) ? parsed.items.length : 0;
	} catch {
		return 0;
	}
}

/**
 * 决定本次抓取结果如何落盘。
 *
 * - 抓取结果为空 + `keepLastValid` + 已存在非空快照 → 保留旧档，返回 `"kept"`，不写任何文件；
 * - 其余情况 → 原子写入（先写临时文件再 rename），返回 `"written"`；
 *   写失败时清理临时文件后向上抛出，已有快照不会被破坏。
 *
 * @returns {"written" | "kept"}
 */
export function commitSnapshot({
	targetFile,
	tempFile,
	jsonContent,
	itemCount,
	keepLastValid,
}) {
	if (
		itemCount === 0 &&
		keepLastValid &&
		readSnapshotItemCount(targetFile) > 0
	) {
		return "kept";
	}

	mkdirSync(dirname(targetFile), { recursive: true });

	try {
		// 原子写入：先写临时文件，成功后再替换正式快照
		writeFileSync(tempFile, jsonContent, "utf-8");
		renameSync(tempFile, targetFile);
		return "written";
	} catch (err) {
		if (existsSync(tempFile)) {
			try {
				unlinkSync(tempFile);
			} catch {}
		}
		throw err;
	}
}

/**
 * 判断快照是否「过期」——`--if-stale` 的过滤依据。
 *
 * - 文件缺失 / 解析失败 / 缺少 fetchedAt / 时间戳非法 → 视为过期（需要同步）；
 * - fetchedAt 兼容两种历史格式：顶层字段（本模块写入格式）与 envelope 包裹格式；
 * - 未来时间（时钟偏差）→ 视为新鲜（ageDays 为负）。
 */
export function isSnapshotStale(snapshotFile, staleAfterDays) {
	if (!existsSync(snapshotFile)) return true;
	try {
		const content = JSON.parse(readFileSync(snapshotFile, "utf8"));
		const fetchedAt = content.fetchedAt ?? content.envelope?.fetchedAt;
		if (!fetchedAt) return true;
		const fetchedTime = new Date(fetchedAt).getTime();
		if (Number.isNaN(fetchedTime)) return true;
		const ageDays = (Date.now() - fetchedTime) / (1000 * 60 * 60 * 24);
		return ageDays >= staleAfterDays;
	} catch {
		return true;
	}
}
