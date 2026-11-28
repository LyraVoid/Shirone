/**
 * rehype 组件：将 `:::grid` 容器指令渲染为响应式图片画廊网格。
 *
 * 指令属性：
 * - `columns` 1~6 的整数，默认 3，非法值回退默认；
 * - `aspect` 形如 `16 / 10` 的宽高比字符串，默认 `16 / 10`，非法值回退默认；
 * - `fit` `cover` | `contain`，默认 `cover`。
 *
 * 每个网格分配独立的 `data-fancybox` 分组 ID，
 */
import { h } from "hastscript";

// gallerySequence 仅兜底无位置信息的合成节点；正常 Markdown 网格的分组 ID
// 由首图 position 派生（文件内稳定），跨构建/同进程多站构建不再漂移。
let gallerySequence = 0;

const DEFAULT_COLUMNS = 3;
const DEFAULT_ASPECT_RATIO = "16 / 10";
const DEFAULT_FIT = "cover";
const MIN_COLUMNS = 1;
const MAX_COLUMNS = 6;

/**
 * 解析列数属性：仅接受 1~6 的整数，其余回退默认值。
 *
 * @param {unknown} value 指令属性原始值。
 * @returns {number}
 */
function parseColumns(value) {
	const columns = Number.parseInt(String(value ?? DEFAULT_COLUMNS), 10);
	return Number.isInteger(columns) &&
		columns >= MIN_COLUMNS &&
		columns <= MAX_COLUMNS
		? columns
		: DEFAULT_COLUMNS;
}

/**
 * 解析宽高比属性：接受 `宽 / 高` 形式且两者均大于 0，否则回退默认值。
 *
 * @param {unknown} value 指令属性原始值。
 * @returns {string} CSS `aspect-ratio` 可用的比例字符串。
 */
function parseAspectRatio(value) {
	if (typeof value !== "string") {
		return DEFAULT_ASPECT_RATIO;
	}

	const match = value.match(
		/^\s*(?<width>\d+(?:\.\d+)?)\s*\/\s*(?<height>\d+(?:\.\d+)?)\s*$/,
	);
	if (!match?.groups) {
		return DEFAULT_ASPECT_RATIO;
	}

	const { width, height } = match.groups;
	if (Number(width) <= 0 || Number(height) <= 0) {
		return DEFAULT_ASPECT_RATIO;
	}

	return `${width} / ${height}`;
}

/**
 * 解析填充方式属性：仅接受 `contain`，其余回退 `cover`。
 *
 * @param {unknown} value 指令属性原始值。
 * @returns {"cover" | "contain"}
 */
function parseFit(value) {
	return value === "contain" ? "contain" : DEFAULT_FIT;
}

/**
 * 从指令子树中递归收集全部 `<img>` 节点。
 *
 * @param {import('hast').RootContent[]} nodes 指令渲染后的 HAST 子节点。
 * @returns {import('hast').Element[]}
 */
function findImages(nodes = []) {
	const images = [];

	const visit = (node) => {
		if (!node || typeof node !== "object") {
			return;
		}

		if (node.type === "element" && node.tagName === "img") {
			images.push(node);
			return;
		}

		if (Array.isArray(node.children)) {
			for (const child of node.children) {
				visit(child);
			}
		}
	};

	for (const node of nodes) {
		visit(node);
	}

	return images;
}

/**
 * FNV-1a 32 位散列（十进制字符串）：把文档身份并入分组 ID，跨文档不碰撞。
 */
function hashString(value) {
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return String(hash >>> 0);
}

/**
 * 从首图 position + 文档身份派生分组 ID：确定性、文件内唯一，且不随构建次数漂移。
 * 同一文档重复渲染（相同 vfile 路径）→ 相同 ID；不同文档行号列号重复时由
 * 文档散列区分，共享处理器渲染多个文档也不会串组。
 *
 * @param {import('hast').Element[]} images 网格内图片节点。
 * @param {string} docKey 文档身份（vfile 路径；不可用时为空串）。
 * @returns {string}
 */
function deriveGalleryId(images, docKey) {
	const start = images[0]?.position?.start;
	if (start?.line != null) {
		// 有文档身份（vfile 路径）→ 文档散列保证跨文档不碰撞；
		// 无文档身份（如 moment 正文逐条渲染）→ 每次渲染分配独立序号，
		// 同页多正文即使首图行列相同也不会串组
		const doc = docKey ? `${hashString(docKey)}-` : `${gallerySequence++}-`;
		return `image-grid-${doc}${start.line}-${start.column ?? 0}`;
	}
	return `image-grid-${gallerySequence++}`;
}

/**
 * 将 `:::grid` 指令渲染为响应式图片画廊。
 *
 * @param {Record<string, unknown>} properties 指令属性。
 * @param {import('hast').RootContent[]} children 指令子节点。
 * @returns {import('hast').Element}
 */
export function ImageGridComponent(properties, children, context) {
	const images = findImages(children);
	if (images.length === 0) {
		return h(
			"div",
			{ class: "hidden" },
			'Invalid image grid. (Use a block directive containing one or more Markdown images: ":::grid ... :::")',
		);
	}

	const docKey = String(
		context?.vfile?.path ?? context?.vfile?.history?.[0] ?? "",
	);
	const galleryId = deriveGalleryId(images, docKey);
	const columns = parseColumns(properties?.columns);
	const aspectRatio = parseAspectRatio(properties?.aspect);
	const fit = parseFit(properties?.fit);

	const items = images.map((image) => {
		image.properties = image.properties ?? {};
		// 本地/远端图片统一惰性加载，避免画廊造成额外首屏请求负担
		image.properties.loading = image.properties.loading ?? "lazy";
		image.properties.decoding = image.properties.decoding ?? "async";

		const src = String(image.properties.src ?? "");
		const alt = String(image.properties.alt ?? "");
		const title = String(image.properties.title ?? "") || alt;

		const itemChildren = [
			h(
				"a",
				{
					class: "image-grid__link no-styling",
					href: src,
					"data-fancybox": galleryId,
					"data-no-swup": "true",
					"data-caption": title,
				},
				[image],
			),
		];
		if (title) {
			itemChildren.push(
				h("figcaption", { class: "image-grid__caption" }, title),
			);
		}

		return h("figure", { class: "image-grid__item" }, itemChildren);
	});

	return h(
		"div",
		{
			class: "image-grid",
			"data-columns": String(columns),
			style: `--image-grid-columns: ${columns}; --image-grid-aspect-ratio: ${aspectRatio}; --image-grid-fit: ${fit};`,
		},
		items,
	);
}
