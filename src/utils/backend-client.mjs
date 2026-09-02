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

export function createBackendClient({
	baseUrl,
	fetchImpl = globalThis.fetch,
	defaultHeaders = {},
}) {
	if (!baseUrl || typeof fetchImpl !== "function") {
		throw new TypeError("baseUrl and fetch implementation are required");
	}
	const request = async (path, options = {}) => {
		const response = await fetchImpl(`${baseUrl}${path}`, {
			credentials: "include",
			...options,
			headers: {
				Accept: "application/json",
				...defaultHeaders,
				...options.headers,
			},
		});
		if (!response.ok) {
			const error = new Error(
				`Shirone backend request failed: ${response.status}`,
			);
			error.status = response.status;
			throw error;
		}
		if (response.status === 204) return null;
		return response.json();
	};
	const jsonRequest = (path, method, body) =>
		request(path, {
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	return Object.freeze({
		listContent: ({ limit = 20, offset = 0, kind } = {}) => {
			const params = new URLSearchParams({
				limit: String(limit),
				offset: String(offset),
			});
			if (kind) params.set("kind", kind);
			return request(`/api/v1/content/?${params.toString()}`);
		},
		getContent: (slug) =>
			request(`/api/v1/content/${encodeURIComponent(slug)}`),
		listComments: (slug) =>
			request(`/api/v1/content/${encodeURIComponent(slug)}/comments`),
		register: (account) =>
			jsonRequest("/api/v1/auth/register", "POST", account),
		login: (credentials) =>
			jsonRequest("/api/v1/auth/login", "POST", credentials),
		logout: () => request("/api/v1/auth/logout", { method: "POST" }),
		currentUser: () => request("/api/v1/auth/me"),
		createComment: (slug, comment) =>
			jsonRequest(
				`/api/v1/content/${encodeURIComponent(slug)}/comments`,
				"POST",
				comment,
			),
		listManagedContent: ({ limit = 50 } = {}) =>
			request(`/api/v1/admin/content/?limit=${encodeURIComponent(limit)}`),
		createContent: (content) =>
			jsonRequest("/api/v1/admin/content/", "POST", content),
		updateContent: (id, content) =>
			jsonRequest(
				`/api/v1/admin/content/${encodeURIComponent(id)}`,
				"PUT",
				content,
			),
	});
}
