import { mount, tick } from "svelte";
import Icon from "../../../src/components/atoms/display/Icon.svelte";
import AnimeCard from "../../../src/components/molecules/AnimeCard.svelte";
import CalendarView from "../../../src/components/molecules/CalendarView.svelte";
import ListPagination from "../../../src/components/molecules/ListPagination.svelte";
import { siteConfig } from "../../../src/config/siteConfig.ts";
import type { AnimeItem } from "../../../src/data/anime.ts";

export function mountIconProbe(target: HTMLElement, dataIcon?: string) {
	const props = {
		icon: "material-symbols:tag-rounded",
		...(dataIcon === undefined ? {} : { "data-icon": dataIcon }),
	};
	return mount(Icon, { target, props: props as never });
}

export function mountAnimeCardProbe(target: HTMLElement) {
	const anime: AnimeItem = {
		title: "Accessible anime title",
		link: "https://example.invalid/anime",
		status: "completed",
		rating: 8.5,
		year: "2026",
		genres: [],
	};
	return mount(AnimeCard, { target, props: { anime } });
}

export function mountCalendarProbe(target: HTMLElement, locale: string) {
	return mount(CalendarView, {
		target,
		props: {
			locale,
			startOfWeek: "mon",
			postsByDate: {},
			activeMonths: [],
			backTodayLabel: "Back to today",
			prevMonthLabel: "Previous month",
			nextMonthLabel: "Next month",
		},
	});
}

export async function mountPaginationProbe(target: HTMLElement) {
	const previousLang = siteConfig.lang;
	try {
		siteConfig.lang = "zh_CN";
		const component = mount(ListPagination, {
			target,
			props: { currentPage: 2, totalPages: 8, onpagechange: () => {} },
		});
		await tick();
		await tick();
		return component;
	} finally {
		siteConfig.lang = previousLang;
	}
}
