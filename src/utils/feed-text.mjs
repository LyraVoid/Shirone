import sanitizeHtml from "sanitize-html";
import { siteMarkdownProcessor } from "./markdown-processor.mjs";

export function escapeXml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export function cdata(value) {
	return `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

export function stripInvalidXmlChars(str) {
	return str.replace(
		// biome-ignore lint/suspicious/noControlCharactersInRegex: https://www.w3.org/TR/xml/#charsets
		/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFDD0-\uFDEF\uFFFE\uFFFF]/g,
		"",
	);
}

const FENCE_OPENER = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSER = /^ {0,3}(`{3,}|~{3,})[\t ]*$/;

/** Splits source into fence segments (kept verbatim) and normal segments. */
function splitOutsideFences(source) {
	const segments = [];
	let fence = null;
	let buffer = [];
	for (const line of source.split("\n")) {
		// CRLF 换行时行尾残留 \r：围栏比较去掉它，缓冲保留原始行
		const compare = line.endsWith("\r") ? line.slice(0, -1) : line;
		if (fence) {
			buffer.push(line);
			const closer = compare.match(FENCE_CLOSER);
			if (
				closer &&
				closer[1][0] === fence.character &&
				closer[1].length >= fence.length
			) {
				fence = null;
				segments.push({ fenced: true, text: buffer.join("\n") });
				buffer = [];
			}
			continue;
		}
		const opener = compare.match(FENCE_OPENER);
		if (opener) {
			if (buffer.length > 0) {
				segments.push({ fenced: false, text: buffer.join("\n") });
			}
			buffer = [line];
			fence = { character: opener[1][0], length: opener[1].length };
			continue;
		}
		buffer.push(line);
	}
	if (buffer.length > 0) {
		segments.push({ fenced: Boolean(fence), text: buffer.join("\n") });
	}
	return segments;
}

function sanitizeMdxSegment(text) {
	return text
		.replace(/^import\s+[\s\S]*?['"][^'"]*['"];?\s*$/gm, "")
		.replace(
			/^export\s+(?:const|let|var|function|class|default)\s+[\s\S]*?;/gm,
			"",
		)
		.replace(/<[A-Z][A-Za-z0-9_]*(\s+[^>]*)?\/>/g, "")
		.replace(
			/<[A-Z][A-Za-z0-9_]*(\s+[^>]*)?>([\s\S]*?)<\/[A-Z][A-Za-z0-9_]*>/g,
			"$2",
		)
		.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

/** Strips MDX-only syntax while keeping fenced code examples intact. */
export function sanitizeMdxForFeed(raw) {
	const source = String(raw ?? "");
	return splitOutsideFences(source)
		.map((segment) =>
			segment.fenced ? segment.text : sanitizeMdxSegment(segment.text),
		)
		.join("\n")
		.trim();
}

let feedRendererPromise = null;

/** Renders Markdown through the full site remark/rehype pipeline (same as pages). */
export async function renderFeedHtml(markdown) {
	feedRendererPromise ??= siteMarkdownProcessor.createRenderer({});
	const renderer = await feedRendererPromise;
	const { code } = await renderer.render(markdown);
	return sanitizeHtml(code, {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
	});
}
