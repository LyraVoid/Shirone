/**
 * Convert an Astro-emitted asset URL into a path relative to `dist/`.
 * Astro prefixes emitted URLs with `base`, but `dist/` itself does not contain
 * that URL prefix. For example, `/Shirone/_astro/font.woff2` is stored at
 * `dist/_astro/font.woff2`, not `dist/Shirone/_astro/font.woff2`.
 */
export function resolveFontAssetPath(reference, baseUrl = "/") {
	const clean = reference
		.split(/[?#]/, 1)[0]
		.replace(/^["']|["']$/g, "");
	const normalizedBase = normalizeBase(baseUrl);
	let path = clean;

	if (normalizedBase !== "/") {
		const baseWithoutTrailingSlash = normalizedBase.slice(0, -1);
		if (path === baseWithoutTrailingSlash || path.startsWith(normalizedBase)) {
			path = path.slice(baseWithoutTrailingSlash.length) || "/";
		}
	}

	return path.replace(/^\.?\/?_astro\//, "_astro/");
}

function normalizeBase(value) {
	const raw = String(value ?? "/").trim();
	if (!raw || raw === "/") return "/";
	const path = raw.startsWith("/") ? raw : `/${raw}`;
	return `${path.replace(/\/+$/, "")}/`;
}
