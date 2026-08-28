import { h } from "hastscript";

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * Renders an SSR-readable repository card. The optional client runtime fills
 * dynamic GitHub repository data only after this directive is present.
 */
export function GithubCardComponent(properties, children) {
	if (Array.isArray(children) && children.length !== 0) return null;

	const repo = typeof properties.repo === "string" ? properties.repo : "";
	if (!REPOSITORY_PATTERN.test(repo)) return null;

	const [owner, name] = repo.split("/");
	return h(
		"a",
		{
			class: "card-github fetch-waiting m3-state-layer not-prose",
			dataGithubCard: true,
			dataGithubRepo: repo,
			href: `https://github.com/${repo}`,
			target: "_blank",
			rel: "noopener noreferrer",
		},
		[
			h("div", { class: "gc-titlebar" }, [
				h("div", { class: "gc-titlebar-left" }, [
					h("span", { class: "gc-owner" }, [
						h("img", {
							class: "gc-avatar",
							alt: "",
							referrerPolicy: "no-referrer",
							dataGithubAvatar: true,
						}),
						h("span", { dataGithubOwner: true }, owner),
					]),
					h("span", { class: "gc-divider", "aria-hidden": "true" }, "/"),
					h("strong", { class: "gc-repo" }, name),
				]),
				h("span", { class: "github-logo", "aria-hidden": "true" }),
			]),
			h("p", {
				class: "gc-description",
				dataGithubDescription: true,
			}),
			h("div", { class: "gc-infobar", dataGithubInfo: true }, [
				h("span", { class: "gc-stars", dataGithubStars: true }),
				h("span", { class: "gc-forks", dataGithubForks: true }),
				h("span", {
					class: "gc-license",
					dataGithubLicense: true,
				}),
				h("span", {
					class: "gc-language",
					dataGithubLanguage: true,
				}),
			]),
		],
	);
}
