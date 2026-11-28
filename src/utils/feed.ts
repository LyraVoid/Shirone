import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { getPublishedInstant, getUpdatedInstant } from "@utils/content-date";
import { getSortedPosts } from "@utils/content-utils";
import { isEncryptedPost } from "@utils/post-encryption";
import { getPostUrl } from "@utils/url-utils";
import {
	cdata,
	escapeXml,
	renderFeedHtml,
	sanitizeMdxForFeed,
	stripInvalidXmlChars,
} from "./feed-text.mjs";

export interface FeedPostItem {
	id: string;
	title: string;
	link: string;
	pubDate: Date;
	updated: Date;
	description: string;
	contentHtml: string;
	category?: string;
	tags: string[];
	isEncrypted: boolean;
}

export async function getFeedPosts(site: URL): Promise<FeedPostItem[]> {
	const blog = await getSortedPosts();

	return Promise.all(
		blog.map(async (post) => {
			const isEncrypted = isEncryptedPost(post.data);
			let contentHtml: string;

			if (isEncrypted) {
				const notice = i18n(I18nKey.postRssEncryptedNotice);
				contentHtml = `<p><em>🔒 ${notice}</em></p>`;
			} else {
				const isMdx =
					post.filePath?.endsWith(".mdx") || post.id.endsWith(".mdx");
				const rawContent =
					typeof post.body === "string" ? post.body : String(post.body || "");
				const contentToRender = isMdx
					? sanitizeMdxForFeed(rawContent) || post.data.description || ""
					: rawContent;
				const cleanedContent = stripInvalidXmlChars(contentToRender);
				contentHtml = await renderFeedHtml(cleanedContent);
			}

			const postUrl = new URL(getPostUrl(post), site).href;
			const pubDate = getPublishedInstant(post.data);
			const updated = getUpdatedInstant(post.data);

			return {
				id: post.id,
				title: isEncrypted ? `🔒 ${post.data.title}` : post.data.title,
				link: postUrl,
				pubDate,
				updated,
				description:
					isEncrypted && post.data.hideHomeContent
						? i18n(I18nKey.postEncryptedSummary)
						: post.data.description || "",
				contentHtml,
				category: post.data.category || undefined,
				tags: post.data.tags || [],
				isEncrypted,
			};
		}),
	);
}

export interface BuildAtomXmlOptions {
	title: string;
	subtitle: string;
	lang: string;
	author: string;
	siteUrl: string;
	feedUrl: string;
	items: FeedPostItem[];
}

export function buildAtomXml({
	title,
	subtitle,
	lang,
	author,
	siteUrl,
	feedUrl,
	items,
}: BuildAtomXmlOptions): string {
	const latestUpdated = items.reduce(
		(latest, item) => (item.updated > latest ? item.updated : latest),
		new Date(0),
	);

	const entries = items
		.map(
			(item) => `  <entry>
    <title>${escapeXml(item.title)}</title>
    <link href="${escapeXml(item.link)}" rel="alternate" type="text/html"/>
    <id>${escapeXml(item.link)}</id>
    <published>${item.pubDate.toISOString()}</published>
    <updated>${item.updated.toISOString()}</updated>
    <summary>${escapeXml(item.description)}</summary>
    <content type="html">${cdata(item.contentHtml)}</content>
    <author><name>${escapeXml(author)}</name></author>${
			item.category
				? `
    <category term="${escapeXml(item.category)}"/>`
				: ""
		}
  </entry>`,
		)
		.join("\n");

	return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${escapeXml(lang)}">
  <title>${escapeXml(title)}</title>
  <subtitle>${escapeXml(subtitle)}</subtitle>
  <link href="${escapeXml(siteUrl)}" rel="alternate" type="text/html"/>
  <link href="${escapeXml(feedUrl)}" rel="self" type="application/atom+xml"/>
  <id>${escapeXml(siteUrl)}</id>
  <updated>${latestUpdated.toISOString()}</updated>
${entries}
</feed>
`;
}
