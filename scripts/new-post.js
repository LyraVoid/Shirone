/* This is a script to create a new post markdown file with front-matter */

import fs from "node:fs";
import path from "node:path";

/**
 * 站点时区（IANA 名）解析。
 *
 * 必须用站点时区、不能用机器时区：`validatePublicationMetadata()`
 * （src/utils/content-date.ts）按 `siteConfig.timeZone` 把 `publishedAt` 映射成
 * 日历日期再与 `published` 比对，两者不在同一天会直接构建报错。
 * 若用「机器本地日期 + 固定偏移」，机器时区与站点时区不在同一天时
 * （例如 UTC 机器在 16:00–24:00 之间，此时站点时区已是次日）就会写出必然失败的文章。
 *
 * 优先级：`SHIRONE_TZ` 环境变量 → 内容仓覆盖层 → `src/config/siteConfig.ts` → 机器时区。
 */
const SITE_TIME_ZONE_FILES = [
	// 内容分离模式：由内容仓 config/site.yaml 生成，site 领域下可能有 timeZone
	"src/user/user-config.ts",
	"src/config/siteConfig.ts",
];

function readTimeZoneLiteral(file, { onlySiteDomain = false } = {}) {
	if (!fs.existsSync(file)) return null;
	const source = fs.readFileSync(file, "utf8");
	// 覆盖层里其它领域也可能出现 timeZone，先裁出 `const site` 这一段
	const scope = onlySiteDomain
		? source.match(
				/(?:^|\n)const\s+site[\s\S]*?(?=\nconst\s|\nexport\s|$)/,
			)?.[0]
		: source;
	return scope?.match(/\btimeZone\s*:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? null;
}

function resolveSiteTimeZone() {
	const override = process.env.SHIRONE_TZ?.trim();
	if (override) return override;
	for (const [index, file] of SITE_TIME_ZONE_FILES.entries()) {
		const literal = readTimeZoneLiteral(file, { onlySiteDomain: index === 0 });
		if (literal) return literal;
	}
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** 指定时区下「现在」的日历日期与带偏移的精确时间（h23 避免 24:00 这种写法）。 */
function getZonedNow(timeZone) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-US", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
			timeZoneName: "longOffset",
		})
			.formatToParts(new Date())
			.map((part) => [part.type, part.value]),
	);
	// `longOffset` 对 UTC 只返回 "GMT"，这里补成 +00:00
	const offset = (parts.timeZoneName ?? "GMT").replace("GMT", "") || "+00:00";
	const date = `${parts.year}-${parts.month}-${parts.day}`;

	return {
		date,
		datetime: `${date}T${parts.hour}:${parts.minute}:${parts.second}${offset}`,
	};
}

const args = process.argv.slice(2);

if (args.length === 0) {
	console.error(`Error: No filename argument provided
Usage: npm run new-post -- <filename>`);
	process.exit(1); // Terminate the script and return error code 1
}

let fileName = args[0];

// Add .md extension if not present
const fileExtensionRegex = /\.(md|mdx)$/i;
if (!fileExtensionRegex.test(fileName)) {
	fileName += ".md";
}

const targetDir = "./src/content/posts/";
const fullPath = path.join(targetDir, fileName);

if (fs.existsSync(fullPath)) {
	console.error(`Error: File ${fullPath} already exists `);
	process.exit(1);
}

// recursive mode creates multi-level directories
const dirPath = path.dirname(fullPath);
if (!fs.existsSync(dirPath)) {
	fs.mkdirSync(dirPath, { recursive: true });
}

// 写入前先解析时区，非法配置不要留下半成品文件
const timeZone = resolveSiteTimeZone();
let zonedNow;
try {
	zonedNow = getZonedNow(timeZone);
} catch {
	console.error(
		`Error: invalid time zone "${timeZone}" (fix siteConfig.timeZone or set SHIRONE_TZ)`,
	);
	process.exit(1);
}

// `published` 与 `publishedAt` 出自同一次时区换算，保证在站点时区下同一天
const content = `---
title: ${args[0]}
published: ${zonedNow.date}
publishedAt: ${zonedNow.datetime}
description: ''
image: ''
tags: []
category: ''
draft: false 
lang: ''
---
`;

fs.writeFileSync(path.join(targetDir, fileName), content);

console.log(`Post ${fullPath} created`);
