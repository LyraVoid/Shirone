import { rm, writeFile } from "node:fs/promises";

// Created only by this spec and removed afterwards; never ship demo content.
const file = new URL(
	"../../src/content/moments/zz-encrypted-probe.md",
	import.meta.url,
);
let owned = false;

export async function createEncryptedMoment() {
	const frontmatter = [
		"---",
		"published: 2026-11-12T10:00:00+08:00",
		"location: Probe location",
		"mood: material-symbols:lock-outline-rounded",
		"tags:",
		"  - probe-public",
		"  - probe-daily",
		"images:",
		"  - src: /images/moments/girls-roll/roll-1.webp",
		"    alt: Probe photo one",
		"  - src: /images/moments/girls-roll/roll-2.webp",
		"    alt: Probe photo two",
		"encrypted: true",
		'password: "shirone-probe"',
		'passwordHint: "Encrypted moment probe"',
		"---",
		"",
		"Encrypted probe body with a **bold** phrase.",
		"",
		"Second protected paragraph.",
		"",
	].join("\n");
	// `wx` fails instead of overwriting a file the developer put there.
	await writeFile(file, frontmatter, { flag: "wx" });
	owned = true;
}

export async function removeEncryptedMoment() {
	if (!owned) return;
	await rm(file, { force: true });
	owned = false;
}
