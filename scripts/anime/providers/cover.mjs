import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Package mode runs providers from node_modules, so the user's project
// root must come from the process rather than the module's own location.
const projectRoot = process.cwd();

export const COVERS_DIR = join(projectRoot, "public/assets/anime/covers");
export const COVERS_PUBLIC_PATH = "/assets/anime/covers";

/**
 * 依据魔数嗅探图片真实格式，回退到 Content-Type，最终兜底 webp。
 * （B 站 CDN 对 .webp 请求参数可能仍返回 jpeg/png，文件名必须与字节一致）
 */
export function detectImageExtension(buffer, contentType) {
	if (buffer && buffer.length >= 4) {
		// JPEG: FF D8 FF
		if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
			return "jpg";
		}
		// PNG: 89 50 4E 47
		if (
			buffer[0] === 0x89 &&
			buffer[1] === 0x50 &&
			buffer[2] === 0x4e &&
			buffer[3] === 0x47
		) {
			return "png";
		}
		// WebP: RIFF ... WEBP (52 49 46 46 .... 57 45 42 50)
		if (
			buffer.length >= 12 &&
			buffer[0] === 0x52 &&
			buffer[1] === 0x49 &&
			buffer[2] === 0x46 &&
			buffer[3] === 0x46 &&
			buffer[8] === 0x57 &&
			buffer[9] === 0x45 &&
			buffer[10] === 0x42 &&
			buffer[11] === 0x50
		) {
			return "webp";
		}
		// GIF: 47 49 46 38
		if (
			buffer[0] === 0x47 &&
			buffer[1] === 0x49 &&
			buffer[2] === 0x46 &&
			buffer[3] === 0x38
		) {
			return "gif";
		}
		// AVIF: ....ftypavif
		if (buffer.length >= 12) {
			const sub = buffer.subarray(4, 12).toString("binary");
			if (sub === "ftypavif" || sub === "ftypavis") {
				return "avif";
			}
		}
	}

	if (contentType) {
		const ct = contentType.toLowerCase();
		if (ct.includes("image/webp")) return "webp";
		if (ct.includes("image/png")) return "png";
		if (ct.includes("image/jpeg") || ct.includes("image/jpg")) return "jpg";
		if (ct.includes("image/gif")) return "gif";
		if (ct.includes("image/avif")) return "avif";
	}

	return "webp";
}

/**
 * 把封面 URL 拼到镜像前缀后面。
 *
 * 查询式代理（如 `https://wsrv.nl/?url=`）原样接收完整 URL；路径式镜像
 * （如 `https://proxy.example.com/`）保证前缀与 URL 之间恰好一个 `/`，
 * 避免 `https://proxy.example.com` 拼出 `…comhttps://…` 这种非法地址。
 *
 * @param {string} coverUrl 完整封面 URL（已升级到 https）
 * @param {string | undefined} mirror 用户配置的镜像前缀
 * @returns {string} 拼接后的 URL；未配置镜像时原样返回
 */
export function applyMirror(coverUrl, mirror) {
	if (!coverUrl || !mirror) return coverUrl;
	if (mirror.includes("?")) return `${mirror}${coverUrl}`;
	return `${mirror.replace(/\/+$/, "")}/${coverUrl}`;
}

/**
 * 下载单张封面到站内静态目录（cover.mode = "local" 的共享实现）。
 *
 * @param {string} coverUrl 已完成协议升级与参数拼接的最终图片 URL
 * @param {string} fileNameStem 不含扩展名的文件名主体（如 "bili_12345" / "bgm_308479"）
 * @param {{ headers?: Record<string, string>, tag?: string }} options 请求头与日志标签
 * @returns {Promise<string | undefined>} 站内相对路径（如 "/assets/anime/covers/bgm_1.jpg"），失败时返回 undefined
 */
export async function downloadCoverLocally(
	coverUrl,
	fileNameStem,
	{ headers = {}, tag = "Cover" } = {},
) {
	if (!coverUrl || !coverUrl.startsWith("https://")) return undefined;

	try {
		if (!existsSync(COVERS_DIR)) {
			mkdirSync(COVERS_DIR, { recursive: true });
		}

		const res = await fetch(coverUrl, {
			headers,
			signal: AbortSignal.timeout(10000),
		});

		if (res.ok) {
			const arrayBuf = await res.arrayBuffer();
			const buffer = Buffer.from(arrayBuf);
			const ext = detectImageExtension(buffer, res.headers.get("content-type"));
			const fileName = `${fileNameStem}.${ext}`;
			const filePath = join(COVERS_DIR, fileName);

			writeFileSync(filePath, buffer);
			return `${COVERS_PUBLIC_PATH}/${fileName}`;
		}
	} catch (error) {
		console.warn(
			`   [${tag}] Failed to download cover locally for ${fileNameStem}: ${error.message}`,
		);
	}
	return undefined;
}
