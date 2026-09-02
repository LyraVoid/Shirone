export interface RuntimeMode {
	mode: "static" | "dynamic";
	apiBaseUrl: string | null;
}

export interface BackendClientOptions {
	baseUrl: string;
	fetchImpl?: typeof fetch;
	defaultHeaders?: HeadersInit;
}

export interface BackendClient {
	listContent(options?: {
		limit?: number;
		offset?: number;
		kind?: string;
	}): Promise<unknown>;
	getContent(slug: string): Promise<unknown>;
	listComments(slug: string): Promise<unknown>;
	register(account: unknown): Promise<unknown>;
	login(credentials: unknown): Promise<unknown>;
	logout(): Promise<null>;
	currentUser(): Promise<unknown>;
	createComment(slug: string, comment: unknown): Promise<unknown>;
	listManagedContent(options?: { limit?: number }): Promise<unknown>;
	createContent(content: unknown): Promise<unknown>;
	updateContent(id: number | string, content: unknown): Promise<unknown>;
}

export declare function resolveRuntimeMode(
	environment?: Record<string, string | undefined>,
): Readonly<RuntimeMode>;

export declare function createBackendClient(
	options: BackendClientOptions,
): Readonly<BackendClient>;
