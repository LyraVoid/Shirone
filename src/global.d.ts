import type Swup from "swup";
import "@swup/scroll-plugin";

declare global {
	interface OddmiscStatsResult {
		pageviews: number;
		visitors: number;
		visits: number;
		_fromCache?: boolean;
	}

	interface OddmiscBrowserClient {
		getSiteStats: () => Promise<OddmiscStatsResult>;
		getPageStats: (path: string) => Promise<OddmiscStatsResult>;
		clearCache: () => void;
	}

	interface Window {
		swup?: Swup;
		oddmisc?: OddmiscBrowserClient;
		__shironeUmamiStatsPromises?: Record<string, Promise<OddmiscStatsResult>>;
		__shironeNavigationBound?: boolean;
		__shironeSidebarBound?: boolean;
		pagefind?: {
			search: (query: string) => Promise<{
				results: Array<{
					data: () => Promise<SearchResult>;
				}>;
			}>;
		};
	}
}

interface SearchResult {
	url: string;
	meta: {
		title: string;
	};
	excerpt: string;
	content?: string;
	word_count?: number;
	filters?: Record<string, unknown>;
	anchors?: Array<{
		element: string;
		id: string;
		text: string;
		location: number;
	}>;
	weighted_locations?: Array<{
		weight: number;
		balanced_score: number;
		location: number;
	}>;
	locations?: number[];
	raw_content?: string;
	raw_url?: string;
	sub_results?: SearchResult[];
}
