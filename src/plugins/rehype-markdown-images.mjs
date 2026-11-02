import fs from "node:fs/promises";
import path from "node:path";
import { fromHtml } from "hast-util-from-html";
import sharp from "sharp";
import { isImageOnOwnLine } from "./markdown/core/image-line.mjs";

/**
 * rehype 插件：Markdown 图片通用增强。
 *
 * 语法：`![图片描述 w-50%](图片链接 "图片标题")`
 * - `w-N%`（1~100）写在 alt 文本中，解析后从 alt 移除并作为显示宽度（居中）；
 * - `"图片标题"` 渲染为图片下方的可见图注；
 * - 独占一行的图片在带标题或宽度令牌时包装为 `<figure>`，否则仅补齐
 *   `loading="lazy"` / `decoding="async"`，不改变既有排版。
 * - 原始 HTML `<img>` 使用同一套规则；匹配配置域名时补充
 *   `referrerpolicy="no-referrer"`。
 *
 * 跳过规则：画廊（.image-grid）与 Mermaid 容器内的图片不重复增强，
 * 携带 `data-no-enhance` 的节点同样跳过。
 * 必须注册在 rehypeComponents 之后，确保 :::grid 已渲染出跳过类名。
 */

const WIDTH_TOKEN = /(?:^|\s)w-(\d{1,3})%(?=\s|$)/g;
const SKIP_CLASSES = new Set(["image-grid", "markdown-mermaid"]);

function classNames(node) {
	const value = node?.properties?.className ?? node?.properties?.class;
	if (Array.isArray(value)) return value.map(String);
	return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

function hasNoEnhance(node) {
	const properties = node?.properties;
	return (
		properties &&
		("dataNoEnhance" in properties || "data-no-enhance" in properties)
	);
}

function shouldSkipEnhancement(ancestors, image) {
	return [...ancestors, image].some(
		(node) =>
			hasNoEnhance(node) ||
			node?.tagName === "figure" ||
			classNames(node).some((className) => SKIP_CLASSES.has(className)),
	);
}

function domainPatternToRegExp(pattern) {
	const escaped = pattern
		.trim()
		.toLowerCase()
		.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*");
	return escaped ? new RegExp(`^${escaped}$`, "i") : null;
}

/**
 * 判断 HTTP(S) 图片 URL 是否匹配精确域名或通配符域名。
 *
 * @param {unknown} url 图片 URL。
 * @param {unknown[]} patterns 域名模式列表。
 * @returns {boolean}
 */
export function matchesNoReferrerDomain(url, patterns = []) {
	if (
		typeof url !== "string" ||
		!/^https?:\/\//i.test(url) ||
		!Array.isArray(patterns) ||
		patterns.length === 0
	) {
		return false;
	}

	try {
		const hostname = new URL(url).hostname;
		return patterns.some((pattern) => {
			const matcher = domainPatternToRegExp(String(pattern));
			return matcher?.test(hostname) ?? false;
		});
	} catch {
		return false;
	}
}

/**
 * 解析可选的 `w-N%` 宽度令牌；非法值（越界/格式错误）保留在 alt 中。
 *
 * @param {unknown} value alt 原始值。
 * @returns {{ alt: string, width?: number }}
 */
export function parseMarkdownImageAlt(value) {
	const alt = typeof value === "string" ? value : String(value ?? "");
	let width;
	const cleaned = alt.replace(WIDTH_TOKEN, (token, rawWidth) => {
		const candidate = Number.parseInt(rawWidth, 10);
		if (width === undefined && candidate >= 1 && candidate <= 100) {
			width = candidate;
			return "";
		}
		return token;
	});

	return {
		alt: cleaned.replace(/\s{2,}/g, " ").trim(),
		width,
	};
}

function appendStyle(current, declaration) {
	const style = typeof current === "string" ? current.trim() : "";
	if (!style) return declaration;
	return `${style.replace(/;?$/, ";")} ${declaration}`;
}

function createFigure(image, title) {
	return {
		type: "element",
		tagName: "figure",
		properties: { className: ["markdown-image-figure"] },
		children: [
			image,
			...(title
				? [
						{
							type: "element",
							tagName: "figcaption",
							properties: { className: ["markdown-image-caption"] },
							children: [{ type: "text", value: title }],
						},
					]
				: []),
		],
	};
}

function isWhitespaceText(node) {
	return node?.type === "text" && !node.value.trim();
}

function onlyImageChild(node) {
	const meaningful = (node.children ?? []).filter(
		(child) => !isWhitespaceText(child),
	);
	return meaningful.length === 1 && meaningful[0]?.tagName === "img"
		? meaningful[0]
		: null;
}

async function readImageDimensions(src, filePath) {
	if (!src || /^(?:https?:|data:|\/\/)/i.test(src)) return undefined;
	const candidates = [];
	if (src.startsWith("/")) {
		candidates.push(path.join(process.cwd(), "public", src.slice(1)));
	} else if (filePath) {
		candidates.push(path.resolve(path.dirname(filePath), src));
	}
	for (const candidate of candidates) {
		try {
			await fs.access(candidate);
			const metadata = await sharp(candidate).metadata();
			if (metadata.width && metadata.height) {
				return { width: metadata.width, height: metadata.height };
			}
		} catch {
			// Missing or unsupported files are left untouched for runtime handling.
		}
	}
	return undefined;
}

async function enhanceImage(image, ancestors, allowFigure, options, filePath) {
	image.properties ??= {};
	const properties = image.properties;
	// 零额外负担：所有正文图片统一惰性加载与异步解码
	properties.loading ??= "lazy";
	properties.decoding ??= "async";
	if (properties.width == null || properties.height == null) {
		const dimensions = await readImageDimensions(
			String(properties.src ?? ""),
			filePath,
		);
		if (dimensions) {
			properties.width ??= dimensions.width;
			properties.height ??= dimensions.height;
		}
	}
	if (
		matchesNoReferrerDomain(
			String(properties.src ?? ""),
			options.noReferrerDomains,
		)
	) {
		properties.referrerPolicy = "no-referrer";
	}

	if (shouldSkipEnhancement(ancestors, image)) return image;

	const parsedAlt = parseMarkdownImageAlt(properties.alt);
	properties.alt = parsedAlt.alt;
	if (parsedAlt.width !== undefined) {
		properties.style = appendStyle(
			properties.style,
			`width: ${parsedAlt.width}%; display: block; margin-inline: auto;`,
		);
	}

	const title =
		typeof properties.title === "string" ? properties.title.trim() : "";
	// figure 包装仅限独立成段的图片；混排文本中的图片包 figure 会产生无效嵌套
	return allowFigure && (title || parsedAlt.width !== undefined)
		? createFigure(image, title)
		: image;
}

async function transformChildren(
	parent,
	ancestors,
	options,
	filePath,
	allowFigure = true,
) {
	const nextChildren = [];
	const canWrapChildImage = allowFigure && parent.tagName !== "p";

	for (const child of parent.children ?? []) {
		if (child.type === "raw" && /<img\b/i.test(child.value ?? "")) {
			const fragment = fromHtml(child.value, { fragment: true });
			await transformChildren(
				fragment,
				ancestors,
				options,
				filePath,
				canWrapChildImage,
			);
			nextChildren.push(...fragment.children);
			continue;
		}

		if (child.type !== "element") {
			nextChildren.push(child);
			continue;
		}

		if (child.tagName === "p") {
			const image = onlyImageChild(child);
			if (image) {
				nextChildren.push(
					await enhanceImage(
						image,
						[...ancestors, child],
						true,
						options,
						filePath,
					),
				);
				continue;
			}

			const children = child.children ?? [];
			const images = children.map(
				(node, index) =>
					node.tagName === "img" &&
					isImageOnOwnLine(children, index) &&
					!shouldSkipEnhancement([...ancestors, child], node) &&
					(Boolean(node.properties?.title?.trim()) ||
						parseMarkdownImageAlt(node.properties?.alt).width !== undefined),
			);
			if (allowFigure && images.some(Boolean)) {
				let inline = [];
				for (let index = 0; index < children.length; index++) {
					const node = children[index];
					if (!images[index]) {
						inline.push(node);
						continue;
					}
					if (inline.some((item) => !isWhitespaceText(item))) {
						const paragraph = { ...child, children: inline };
						await transformChildren(
							paragraph,
							[...ancestors, paragraph],
							options,
							filePath,
							false,
						);
						nextChildren.push(paragraph);
					}
					inline = [];
					nextChildren.push(
						await enhanceImage(
							node,
							[...ancestors, child],
							true,
							options,
							filePath,
						),
					);
				}
				if (inline.some((item) => !isWhitespaceText(item))) {
					const paragraph = { ...child, children: inline };
					await transformChildren(
						paragraph,
						[...ancestors, paragraph],
						options,
						filePath,
						false,
					);
					nextChildren.push(paragraph);
				}
				continue;
			}
		}

		if (child.tagName === "img") {
			nextChildren.push(
				await enhanceImage(
					child,
					ancestors,
					canWrapChildImage,
					options,
					filePath,
				),
			);
			continue;
		}

		await transformChildren(
			child,
			[...ancestors, child],
			options,
			filePath,
			canWrapChildImage,
		);
		nextChildren.push(child);
	}

	parent.children = nextChildren;
}

/**
 * 对 Markdown 图片应用统一的宽度/图注/惰性加载规则。
 */
export function rehypeMarkdownImages(options = {}) {
	const normalizedOptions = {
		noReferrerDomains: Array.isArray(options.noReferrerDomains)
			? options.noReferrerDomains
			: [],
	};

	return async (tree, file) => {
		await transformChildren(tree, [], normalizedOptions, file?.path, true);
	};
}
