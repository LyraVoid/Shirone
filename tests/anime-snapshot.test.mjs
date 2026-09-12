import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	commitSnapshot,
	isSnapshotStale,
	readSnapshotItemCount,
} from "../scripts/anime/snapshot-store.mjs";

function tempDir() {
	return mkdtempSync(join(tmpdir(), "shirone-anime-snapshot-"));
}

function writeSnapshot(root, relativePath, contents) {
	const absolute = join(root, relativePath);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, contents, "utf8");
	return absolute;
}

function readSnapshot(root, relativePath) {
	return readFileSync(join(root, relativePath), "utf8");
}

const NON_EMPTY_SNAPSHOT = JSON.stringify(
	{
		schemaVersion: 1,
		provider: "bilibili",
		fetchedAt: "2026-01-01T00:00:00.000Z",
		accountRef: "42",
		items: [{ title: "Lycoris Recoil" }],
	},
	null,
	2,
);

const EMPTY_SNAPSHOT = JSON.stringify(
	{
		schemaVersion: 1,
		provider: "bilibili",
		fetchedAt: "2026-02-02T00:00:00.000Z",
		accountRef: "42",
		items: [],
	},
	null,
	2,
);

function commit(
	root,
	{ jsonContent = EMPTY_SNAPSHOT, itemCount = 0, keepLastValid = true } = {},
) {
	const targetFile = join(root, "src/data/anime-snapshots/bilibili.json");
	const tempFile = join(
		root,
		"src/data/anime-snapshots/.temp-bilibili-test.json",
	);
	return commitSnapshot({
		targetFile,
		tempFile,
		jsonContent,
		itemCount,
		keepLastValid,
	});
}

describe("anime snapshot commitSnapshot", () => {
	it("空结果 + keepLastValid + 已有非空快照 → 保留旧档不覆盖", () => {
		const root = tempDir();
		try {
			const targetFile = writeSnapshot(
				root,
				"src/data/anime-snapshots/bilibili.json",
				NON_EMPTY_SNAPSHOT,
			);

			const outcome = commit(root, { itemCount: 0, keepLastValid: true });

			assert.equal(outcome, "kept");
			assert.equal(readFileSync(targetFile, "utf8"), NON_EMPTY_SNAPSHOT);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("空结果 + keepLastValid + 无旧档 → 写入空快照（无档可保）", () => {
		const root = tempDir();
		try {
			const outcome = commit(root, { itemCount: 0, keepLastValid: true });

			assert.equal(outcome, "written");
			assert.equal(
				readSnapshot(root, "src/data/anime-snapshots/bilibili.json"),
				EMPTY_SNAPSHOT,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("空结果 + keepLastValid=false → 使用者显式退出保护，覆盖为空快照", () => {
		const root = tempDir();
		try {
			writeSnapshot(
				root,
				"src/data/anime-snapshots/bilibili.json",
				NON_EMPTY_SNAPSHOT,
			);

			const outcome = commit(root, { itemCount: 0, keepLastValid: false });

			assert.equal(outcome, "written");
			assert.equal(
				readSnapshot(root, "src/data/anime-snapshots/bilibili.json"),
				EMPTY_SNAPSHOT,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("空结果 + 旧档损坏 → 旧档不构成有效快照，允许覆盖", () => {
		const root = tempDir();
		try {
			writeSnapshot(root, "src/data/anime-snapshots/bilibili.json", "{oops");

			const outcome = commit(root, { itemCount: 0, keepLastValid: true });

			assert.equal(outcome, "written");
			assert.equal(
				readSnapshot(root, "src/data/anime-snapshots/bilibili.json"),
				EMPTY_SNAPSHOT,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("非空结果 → 正常覆盖且内容一致", () => {
		const root = tempDir();
		try {
			writeSnapshot(
				root,
				"src/data/anime-snapshots/bilibili.json",
				EMPTY_SNAPSHOT,
			);

			const outcome = commit(root, {
				jsonContent: NON_EMPTY_SNAPSHOT,
				itemCount: 1,
				keepLastValid: true,
			});

			assert.equal(outcome, "written");
			assert.equal(
				readSnapshot(root, "src/data/anime-snapshots/bilibili.json"),
				NON_EMPTY_SNAPSHOT,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("kept 路径不残留临时文件", () => {
		const root = tempDir();
		try {
			writeSnapshot(
				root,
				"src/data/anime-snapshots/bilibili.json",
				NON_EMPTY_SNAPSHOT,
			);

			commit(root, { itemCount: 0, keepLastValid: true });

			assert.equal(
				existsSync(
					join(root, "src/data/anime-snapshots/.temp-bilibili-test.json"),
				),
				false,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("anime snapshot readSnapshotItemCount", () => {
	it("缺失/损坏/非 envelope 结构均返回 0", () => {
		const root = tempDir();
		try {
			assert.equal(readSnapshotItemCount(join(root, "missing.json")), 0);

			const broken = writeSnapshot(root, "broken.json", "{oops");
			assert.equal(readSnapshotItemCount(broken), 0);

			const noItems = writeSnapshot(root, "no-items.json", '{"a":1}');
			assert.equal(readSnapshotItemCount(noItems), 0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("有效 envelope 返回条目数", () => {
		const root = tempDir();
		try {
			const file = writeSnapshot(root, "bilibili.json", NON_EMPTY_SNAPSHOT);
			assert.equal(readSnapshotItemCount(file), 1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("anime snapshot isSnapshotStale", () => {
	const DAY = 24 * 60 * 60 * 1000;
	const topLevel = (fetchedAt) =>
		JSON.stringify({
			schemaVersion: 1,
			provider: "bilibili",
			fetchedAt,
			accountRef: "",
			items: [],
		});

	it("文件缺失视为过期（需要同步）", () => {
		const root = tempDir();
		try {
			assert.equal(isSnapshotStale(join(root, "bilibili.json"), 30), true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("新鲜快照（顶层 fetchedAt）视为新鲜", () => {
		const root = tempDir();
		try {
			const file = writeSnapshot(
				root,
				"bilibili.json",
				topLevel(new Date().toISOString()),
			);
			assert.equal(isSnapshotStale(file, 30), false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("超过 staleAfterDays 的快照视为过期", () => {
		const root = tempDir();
		try {
			const file = writeSnapshot(
				root,
				"bilibili.json",
				topLevel(new Date(Date.now() - 31 * DAY).toISOString()),
			);
			assert.equal(isSnapshotStale(file, 30), true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("envelope 包裹的 fetchedAt 同样被识别（历史格式兼容）", () => {
		const root = tempDir();
		try {
			const file = writeSnapshot(
				root,
				"bilibili.json",
				JSON.stringify({
					envelope: {
						schemaVersion: 1,
						fetchedAt: new Date().toISOString(),
					},
					items: [],
				}),
			);
			assert.equal(isSnapshotStale(file, 30), false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("损坏 JSON 或缺失 fetchedAt 视为过期", () => {
		const root = tempDir();
		try {
			const broken = writeSnapshot(root, "bilibili.json", "{ not json");
			assert.equal(isSnapshotStale(broken, 30), true);
			const noTime = writeSnapshot(
				root,
				"other.json",
				JSON.stringify({ items: [] }),
			);
			assert.equal(isSnapshotStale(noTime, 30), true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("anime sync --if-stale CLI", () => {
	it("快照新鲜时跳过同步（不触达 provider）", (t) => {
		const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
		if (!existsSync(join(projectRoot, "src/user/user-config.ts"))) {
			t.skip(
				"src/user/user-config.ts 尚未生成（先运行 astro check / content:sync）",
			);
			return;
		}
		const snapshotDir = join(projectRoot, "src/data/anime-snapshots");
		const file = join(snapshotDir, "bilibili.json");
		const backup = existsSync(file) ? readFileSync(file) : null;
		try {
			mkdirSync(snapshotDir, { recursive: true });
			writeFileSync(
				file,
				JSON.stringify({
					schemaVersion: 1,
					provider: "bilibili",
					fetchedAt: new Date().toISOString(),
					accountRef: "",
					items: [],
				}),
			);
			const result = spawnSync(
				process.execPath,
				["scripts/anime/sync.mjs", "--provider", "bilibili", "--if-stale"],
				{ cwd: projectRoot, encoding: "utf8" },
			);
			assert.equal(result.status, 0, result.stderr);
			assert.match(result.stdout, /Skipping sync due to --if-stale/);
		} finally {
			if (backup) writeFileSync(file, backup);
			else rmSync(file, { force: true });
		}
	});
});
