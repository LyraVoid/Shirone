type GithubRepository = {
	description: string | null;
	forks_count: number;
	language: string | null;
	license: { spdx_id: string | null } | null;
	owner: { avatar_url: string | null } | null;
	stargazers_count: number;
};

const repositoryCache = new Map<string, GithubRepository>();
const activeRequests = new Map<Element, AbortController>();
let cleanupBound = false;

function select<T extends Element>(card: Element, selector: string): T | null {
	return card.querySelector<T>(selector);
}

function setOptionalText(
	card: Element,
	selector: string,
	value: string | null,
): boolean {
	const element = select<HTMLElement>(card, selector);
	if (!element) return false;

	if (!value) {
		element.hidden = true;
		return false;
	}

	element.textContent = value;
	element.hidden = false;
	return true;
}

function formatCount(value: number): string {
	return new Intl.NumberFormat(document.documentElement.lang || undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

function renderRepository(
	card: HTMLElement,
	repository: GithubRepository,
): void {
	setOptionalText(card, "[data-github-description]", repository.description);
	setOptionalText(
		card,
		"[data-github-stars]",
		formatCount(repository.stargazers_count),
	);
	setOptionalText(
		card,
		"[data-github-forks]",
		formatCount(repository.forks_count),
	);
	setOptionalText(
		card,
		"[data-github-license]",
		repository.license?.spdx_id ?? null,
	);
	setOptionalText(card, "[data-github-language]", repository.language);

	const info = select<HTMLElement>(card, "[data-github-info]");
	if (info)
		info.hidden = ![
			"[data-github-stars]",
			"[data-github-forks]",
			"[data-github-license]",
			"[data-github-language]",
		].some((selector) => !select<HTMLElement>(card, selector)?.hidden);

	const avatar = select<HTMLImageElement>(card, "[data-github-avatar]");
	if (avatar) {
		if (repository.owner?.avatar_url) {
			avatar.addEventListener(
				"error",
				() => {
					avatar.hidden = true;
				},
				{ once: true },
			);
			avatar.src = repository.owner.avatar_url;
			avatar.hidden = false;
		} else {
			avatar.hidden = true;
		}
	}

	card.classList.remove("fetch-waiting");
}

function hideDynamicDetails(card: HTMLElement): void {
	for (const selector of [
		"[data-github-description]",
		"[data-github-info]",
		"[data-github-avatar]",
	]) {
		const element = select<HTMLElement>(card, selector);
		if (element) element.hidden = true;
	}
}

function bindRequestCleanup(): void {
	if (cleanupBound) return;
	cleanupBound = true;
	document.addEventListener("swup:content:replace", () => {
		for (const controller of activeRequests.values()) controller.abort();
		activeRequests.clear();
	});
}

async function fetchRepository(
	repo: string,
	controller: AbortController,
): Promise<GithubRepository> {
	const cached = repositoryCache.get(repo);
	if (cached) return cached;

	const response = await fetch(`https://api.github.com/repos/${repo}`, {
		referrerPolicy: "no-referrer",
		signal: controller.signal,
	});
	if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

	const repository = (await response.json()) as GithubRepository;
	repositoryCache.set(repo, repository);
	return repository;
}

async function hydrateCard(card: HTMLElement): Promise<void> {
	if (card.dataset.githubState === "loading") return;
	const repo = card.dataset.githubRepo;
	if (!repo) return;

	const controller = new AbortController();
	const timeout = window.setTimeout(() => controller.abort(), 10_000);
	activeRequests.set(card, controller);
	card.classList.remove("fetch-error");
	card.classList.add("fetch-waiting");
	card.dataset.githubState = "loading";
	card.setAttribute("aria-busy", "true");

	try {
		const repository = await fetchRepository(repo, controller);
		if (!card.isConnected || controller.signal.aborted) return;
		renderRepository(card, repository);
		card.dataset.githubState = "ready";
	} catch (error) {
		if (!controller.signal.aborted) {
			hideDynamicDetails(card);
			card.classList.remove("fetch-waiting");
			card.classList.add("fetch-error");
			card.dataset.githubState = "error";
			console.warn(`Failed to load GitHub card for ${repo}`, error);
		}
	} finally {
		window.clearTimeout(timeout);
		activeRequests.delete(card);
		if (card.isConnected) card.setAttribute("aria-busy", "false");
	}
}

export function initGithubCards(root: ParentNode = document): void {
	bindRequestCleanup();
	const cards = [
		...(root instanceof HTMLElement && root.matches("[data-github-card]")
			? [root]
			: []),
		...root.querySelectorAll<HTMLElement>("[data-github-card]"),
	];
	for (const card of cards) void hydrateCard(card);
}
