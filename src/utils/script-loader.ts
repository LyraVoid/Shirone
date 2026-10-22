const scriptCache = new Map<string, Promise<void>>();

/**
 * 确保指定 URL 的外部脚本在页面中只被加载一次。
 * 返回 Promise，若已在加载中或已完成则复用同一个 Promise。
 */
export function loadScriptOnce(url: string, timeoutMs?: number): Promise<void> {
	const normalizedUrl = url.trim();
	if (!normalizedUrl) {
		return Promise.reject(new Error("Empty script URL provided"));
	}

	const cached = scriptCache.get(normalizedUrl);
	if (cached) {
		return cached;
	}

	// 检查 DOM 中是否已有对应脚本标签（防御外部已插入场景）
	const existing = document.querySelector<HTMLScriptElement>(
		`script[src="${normalizedUrl}"]`,
	);
	if (existing) {
		const existingPromise = Promise.resolve();
		scriptCache.set(normalizedUrl, existingPromise);
		return existingPromise;
	}

	const promise = new Promise<void>((resolve, reject) => {
		const script = document.createElement("script");
		script.src = normalizedUrl;
		script.async = true;

		const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
		const cleanup = () => {
			script.onload = null;
			script.onerror = null;
			signal?.removeEventListener("abort", abort);
		};
		const fail = (reason: unknown) => {
			cleanup();
			// 失败或超时后清理缓存，允许用户重试。
			scriptCache.delete(normalizedUrl);
			script.remove();
			reject(reason);
		};
		const abort = () => fail(signal?.reason);
		script.onload = () => {
			cleanup();
			resolve();
		};
		script.onerror = () => fail(new Error("Failed to load external script"));
		signal?.addEventListener("abort", abort, { once: true });

		document.head.appendChild(script);
	});

	scriptCache.set(normalizedUrl, promise);
	return promise;
}
