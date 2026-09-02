const DYNAMIC_MODE = "dynamic";

export function resolveRuntimeMode(environment = process.env) {
	const mode =
		environment.SHIRONE_RUNTIME_MODE?.trim().toLowerCase() || "static";
	if (mode !== "static" && mode !== DYNAMIC_MODE) {
		throw new Error(`Unsupported SHIRONE_RUNTIME_MODE: ${mode}`);
	}
	if (mode === "static") {
		return Object.freeze({ mode: "static", apiBaseUrl: null });
	}
	const rawBaseUrl = environment.SHIRONE_API_URL?.trim();
	if (!rawBaseUrl) {
		throw new Error("SHIRONE_API_URL is required in dynamic mode");
	}
	const url = new URL(rawBaseUrl);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("SHIRONE_API_URL must use http or https");
	}
	return Object.freeze({
		mode: DYNAMIC_MODE,
		apiBaseUrl: url.toString().replace(/\/$/, ""),
	});
}

export function createBackendClient({ baseUrl, fetchImpl = globalThis.fetch }) {
	if (!baseUrl || typeof fetchImpl !== "function") {
		throw new TypeError("baseUrl and fetch implementation are required");
	}
	const request = async (path, options = {}) => {
		const response = await fetchImpl(`${baseUrl}${path}`, {
			...options,
			headers: { Accept: "application/json", ...options.headers },
		});
		if (!response.ok) {
			const error = new Error(
				`Shirone backend request failed: ${response.status}`,
			);
			error.status = response.status;
			throw error;
		}
		return response.json();
	};
	return Object.freeze({
		listContent: ({ limit = 20 } = {}) =>
			request(`/api/v1/content/?limit=${encodeURIComponent(limit)}`),
		getContent: (slug) =>
			request(`/api/v1/content/${encodeURIComponent(slug)}`),
		listComments: (slug) =>
			request(`/api/v1/content/${encodeURIComponent(slug)}/comments`),
	});
}
