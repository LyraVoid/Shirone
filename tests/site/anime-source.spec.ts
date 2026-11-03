import { expect, test } from "@playwright/test";
import { resolveAnimeOptions } from "../../src/config/animeConfig.ts";
import { animeData } from "../../src/data/anime.ts";
import {
	normalizeAnimeItem,
	parseAnimeSnapshot,
	sanitizeExternalLink,
	sanitizeMediaUrl,
	sortAnimeList,
} from "../../src/utils/anime/normalize.ts";
import { getAnimeList } from "../../src/utils/anime-data.ts";

test.describe("Anime 数据源与配置解析契约", () => {
	test("AnimeCard: 无封面外链仍暴露番剧标题", async ({ page }) => {
		await page.goto("/anime/");
		await page.evaluate(async () => {
			const host = document.createElement("div");
			host.id = "anime-card-accessibility-probe";
			document.body.append(host);
			const { mountAnimeCardProbe } = await import(
				"/tests/site/fixtures/component-probes.ts"
			);
			mountAnimeCardProbe(host);
		});

		const link = page.locator(
			"#anime-card-accessibility-probe a.anime-card__cover",
		);
		await expect(link).toHaveCount(1);
		await expect(link.locator(".sr-only")).toHaveText("Accessible anime title");
		await expect(link).toHaveAccessibleName(/Accessible anime title/);
	});

	test("resolveAnimeOptions: 默认本地模式与配置安全解析", () => {
		const defaultResolved = resolveAnimeOptions({
			enable: true,
			source: { kind: "local" },
			fallback: { kind: "local" },
			providers: {
				bangumi: { enable: false, userId: "" },
				bilibili: { enable: false, vmid: "" },
			},
			snapshot: {
				directory: "src/data/anime-snapshots",
				staleAfterDays: 30,
				keepLastValid: true,
			},
		});

		expect(defaultResolved.enable).toBe(true);
		expect(defaultResolved.source.kind).toBe("local");
		expect(defaultResolved.fallback).toBe("local");
		expect(defaultResolved.snapshot.directory).toBe("src/data/anime-snapshots");
		expect(defaultResolved.snapshot.staleAfterDays).toBe(30);

		// 快照模式路径遍历防御
		const traversalResolved = resolveAnimeOptions({
			enable: true,
			source: {
				kind: "snapshot",
				provider: "bangumi",
				file: "../../passwords.json",
			},
			fallback: { kind: "empty" },
			providers: {
				bangumi: { enable: true, userId: "test" },
				bilibili: { enable: false, vmid: "" },
			},
			snapshot: {
				directory: "src/data/anime-snapshots/../",
				staleAfterDays: 0,
				keepLastValid: true,
			},
		});

		expect(traversalResolved.source.kind).toBe("snapshot");
		expect(traversalResolved.source.file).toBe("bangumi.json"); // 非法路径被纠正
		expect(traversalResolved.snapshot.directory).toBe(
			"src/data/anime-snapshots",
		);
		expect(traversalResolved.snapshot.staleAfterDays).toBe(30);
		expect(traversalResolved.fallback).toBe("empty");
	});

	test("normalizeAnimeItem: 字段清洗、范围约束与边界校验", () => {
		// 1. 无标题丢弃
		expect(normalizeAnimeItem({ title: "", status: "watching" })).toBeNull();
		expect(normalizeAnimeItem({ status: "watching" })).toBeNull();

		// 2. 合法字段标准化
		const item = normalizeAnimeItem({
			title: "  Frieren: Beyond Journey's End  ",
			status: "onHold",
			rating: 9.88,
			progress: { watched: 15, total: 28 },
			year: "2023-09-29",
			cover: "https://example.com/cover.webp",
			link: "https://bgm.tv/subject/400000",
			description: "<b>Epic journey</b> with magic.\n\nEnjoy!",
			genres: ["Adventure", "Fantasy", "#Adventure"],
			studio: "Madhouse",
			identity: {
				provider: "bangumi",
				subjectId: "400000",
			},
		});

		expect(item).not.toBeNull();
		expect(item?.title).toBe("Frieren: Beyond Journey's End");
		expect(item?.status).toBe("onHold");
		expect(item?.rating).toBe(9.9);
		expect(item?.progress).toEqual({ watched: 15, total: 28 });
		expect(item?.year).toBe("2023");
		expect(item?.cover).toBe("https://example.com/cover.webp");
		expect(item?.link).toBe("https://bgm.tv/subject/400000");
		expect(item?.description).toBe("Epic journey with magic. Enjoy!");
		expect(item?.genres).toEqual(["Adventure", "Fantasy"]);
		expect(item?.studio).toBe("Madhouse");
		expect(item?.identity?.provider).toBe("bangumi");

		// 3. 安全 URL 清洗
		expect(sanitizeMediaUrl("javascript:alert(1)")).toBeUndefined();
		expect(sanitizeMediaUrl("data:image/png;base64,123")).toBeUndefined();
		expect(sanitizeMediaUrl("//cdn.example.com/img.jpg")).toBe(
			"https://cdn.example.com/img.jpg",
		);
		expect(sanitizeMediaUrl("/assets/anime/local.webp")).toBe(
			"/assets/anime/local.webp",
		);
		expect(sanitizeExternalLink("javascript:void(0)")).toBeUndefined();
		expect(sanitizeExternalLink("http://example.com")).toBe(
			"https://example.com",
		);

		// 4. 进度溢出截断
		const overflow = normalizeAnimeItem({
			title: "Overflow",
			status: "watching",
			progress: { watched: 30, total: 12 },
		});
		expect(overflow?.progress).toEqual({ watched: 12, total: 12 });
	});

	test("sortAnimeList: 稳定排序（状态优先级 -> 年份倒序 -> 标题字典序）", () => {
		const items = [
			{
				title: "Alpha",
				status: "dropped" as const,
				rating: 6,
				progress: { watched: 1, total: 12 },
				year: "2020",
				genres: [],
			},
			{
				title: "Beta",
				status: "watching" as const,
				rating: 9,
				progress: { watched: 2, total: 12 },
				year: "2021",
				genres: [],
			},
			{
				title: "Gamma",
				status: "watching" as const,
				rating: 9,
				progress: { watched: 2, total: 12 },
				year: "2024",
				genres: [],
			},
			{
				title: "Delta",
				status: "completed" as const,
				rating: 10,
				progress: { watched: 12, total: 12 },
				year: "2023",
				genres: [],
			},
		];

		const sorted = sortAnimeList(items);
		expect(sorted[0].title).toBe("Delta");
		expect(sorted[1].title).toBe("Gamma");
		expect(sorted[2].title).toBe("Beta");
		expect(sorted[3].title).toBe("Alpha");
	});

	test("parseAnimeSnapshot: 解析 Envelope 结构与旧数据数组", () => {
		const envelopeData = {
			schemaVersion: 1,
			provider: "bangumi",
			fetchedAt: "2025-01-01T00:00:00.000Z",
			accountRef: "shirone",
			items: [
				{
					title: "Clannad",
					status: "completed",
					rating: 9.8,
					progress: { watched: 24, total: 24 },
					year: "2007",
					genres: ["Drama", "Romance"],
				},
			],
		};

		const resEnvelope = parseAnimeSnapshot(JSON.stringify(envelopeData));
		expect(resEnvelope).not.toBeNull();
		expect(resEnvelope?.items.length).toBe(1);
		expect(resEnvelope?.envelope?.provider).toBe("bangumi");
		expect(resEnvelope?.items[0].title).toBe("Clannad");

		const rawArrayData = [
			{
				title: "Steins;Gate",
				status: "completed",
				rating: 9.9,
				progress: { watched: 24, total: 24 },
				year: "2011",
				genres: ["Sci-Fi"],
			},
		];

		const resArray = parseAnimeSnapshot(JSON.stringify(rawArrayData));
		expect(resArray).not.toBeNull();
		expect(resArray?.items.length).toBe(1);
		expect(resArray?.items[0].title).toBe("Steins;Gate");
	});

	test("getAnimeList: 默认 local 数据与 fallback 机制", async () => {
		// 指定 local 模式
		const localList = await getAnimeList({
			enable: true,
			source: { kind: "local" },
			fallback: "local",
			snapshot: {
				directory: "src/data/anime-snapshots",
				staleAfterDays: 30,
				keepLastValid: true,
			},
		});
		expect(localList.length).toBe(animeData.length);
		expect(localList[0].title).toBe("Lycoris Recoil");

		// 当前快照模式
		const list = await getAnimeList();
		expect(list.length).toBeGreaterThan(0);

		// 禁用状态
		const disabledList = await getAnimeList({
			enable: false,
			source: { kind: "local" },
			fallback: "empty",
			snapshot: {
				directory: "src/data/anime-snapshots",
				staleAfterDays: 30,
				keepLastValid: true,
			},
		});
		expect(disabledList.length).toBe(0);

		// 快照丢失回退 local
		const fallbackLocal = await getAnimeList({
			enable: true,
			source: { kind: "snapshot", file: "non_existent.json" },
			fallback: "local",
			snapshot: {
				directory: "src/data/anime-snapshots",
				staleAfterDays: 30,
				keepLastValid: true,
			},
		});
		expect(fallbackLocal.length).toBe(animeData.length);

		// 快照丢失回退 empty
		const fallbackEmpty = await getAnimeList({
			enable: true,
			source: { kind: "snapshot", file: "non_existent.json" },
			fallback: "empty",
			snapshot: {
				directory: "src/data/anime-snapshots",
				staleAfterDays: 30,
				keepLastValid: true,
			},
		});
		expect(fallbackEmpty.length).toBe(0);
	});
});
