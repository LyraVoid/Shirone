import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Created only by this spec and removed afterwards; never ship test/demo routes.
const directory = new URL(
	"../../src/pages/pagination-regression/",
	import.meta.url,
);
let owned = false;
export async function createPaginationPages() {
	await mkdir(directory); // Fail if a developer already owns this path.
	owned = true;
	for (const [name, anime, pageSize, delayed] of [
		["friends", false, 12],
		["anime", true, 12],
		["friends-delayed", false, 12, true],
		["anime-delayed", true, 12, true],
		["small", false, 5],
		["invalid", false, 0],
		["window", false, 10],
	]) {
		const source = [
			"---",
			'import MainGridLayout from "@layouts/MainGridLayout.astro";',
			'import Section from "@components/organisms/' +
				(anime ? "Anime" : "Friend") +
				'Section.svelte";',
			"const items = Array.from({length: 85}, (_, i) => ({",
			anime
				? 'title: "Anime " + String(i + 1).padStart(3, "0"), cover: "/pagination-media/anime-" + (i + 1) + ".svg", link: "https://example.test/" + i, status: i % 2 ? "completed" : "watching", rating: 8, year: "2026", genres: ["Fixture"]'
				: 'id: i, title: "Friend " + String(i + 1).padStart(3, "0"), imgurl: "/pagination-media/friend-" + (i + 1) + ".svg", desc: "Fixture", siteurl: "https://example.test/" + i, tags: [i % 2 ? "Beta" : "Alpha"]',
			"}));",
			"---",
			'<MainGridLayout title="Pagination fixture" page="' +
				(anime ? "anime" : "friends") +
				'">',
			'<a data-pagination-peer href="/pagination-regression/' +
				(anime ? "friends" : "anime") +
				'/">Peer</a>',
			"<Section " +
				(anime ? "animes" : "friends") +
				"={items} pageSize={" +
				pageSize +
				(delayed
					? '} client:media="(min-width: 1600px)" />'
					: "} client:visible />"),
			"</MainGridLayout>",
		].join("\n");
		await writeFile(new URL(`${name}.astro`, directory), source);
	}
}
export async function removePaginationPages() {
	// Fixed child path inside this workspace, created exclusively above.
	if (!owned) return;
	await rm(fileURLToPath(directory), { recursive: true });
	owned = false;
}
