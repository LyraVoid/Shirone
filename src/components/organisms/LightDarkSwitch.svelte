<script lang="ts">
import Menu from "@components/atoms/navigation/Menu.svelte";
import { AUTO_MODE, DARK_MODE, LIGHT_MODE } from "@constants/constants.ts";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import {
	applyThemeToDocument,
	getStoredTheme,
	setTheme,
} from "@utils/setting-utils.ts";
import { onMount } from "svelte";
import type { LIGHT_DARK_MODE } from "@/types/config.ts";

let mode: LIGHT_DARK_MODE = $state(AUTO_MODE);
let menuOpen = $state(false);
let isDesktop = $state(false);

onMount(() => {
	mode = getStoredTheme();
	const darkModePreference = window.matchMedia("(prefers-color-scheme: dark)");
	const changeThemeWhenSchemeChanged: Parameters<
		typeof darkModePreference.addEventListener<"change">
	>[1] = (_e) => {
		applyThemeToDocument(mode);
	};
	darkModePreference.addEventListener("change", changeThemeWhenSchemeChanged);

	const desktopQuery = window.matchMedia("(min-width: 1024px)");
	isDesktop = desktopQuery.matches;
	const onDesktopChange = (e: MediaQueryListEvent) => {
		isDesktop = e.matches;
	};
	desktopQuery.addEventListener("change", onDesktopChange);

	return () => {
		darkModePreference.removeEventListener(
			"change",
			changeThemeWhenSchemeChanged,
		);
		desktopQuery.removeEventListener("change", onDesktopChange);
	};
});

const seq: LIGHT_DARK_MODE[] = [LIGHT_MODE, DARK_MODE, AUTO_MODE];

function switchScheme(newMode: LIGHT_DARK_MODE) {
	mode = newMode;
	setTheme(newMode);
	menuOpen = false;
}

function toggleScheme() {
	let i = 0;
	for (; i < seq.length; i++) {
		if (seq[i] === mode) {
			break;
		}
	}
	switchScheme(seq[(i + 1) % seq.length]);
}

function onMainButtonClick() {
	if (isDesktop) {
		menuOpen = !menuOpen;
	} else {
		toggleScheme();
	}
}
</script>

<!-- z-50 make the menu higher than other float panels -->
<div class="relative z-50 flex h-10 w-10 shrink-0 items-center justify-center">
    <button aria-label={i18n(I18nKey.lightDarkMode)} aria-haspopup="menu" aria-expanded={menuOpen}
            class="m3-state-layer relative inline-flex items-center justify-center rounded-full h-10 w-10 border-none cursor-pointer select-none text-[var(--on-surface)]"
            style="font-size: 1.25rem; line-height: 1; --m3e-state-color: var(--on-surface); --m3e-focus-outline: var(--on-surface);"
            id="scheme-switch" onclick={onMainButtonClick}>
        <div class="absolute" class:opacity-0={mode !== LIGHT_MODE}>
            <Icon icon="material-symbols:wb-sunny-outline-rounded" class="text-[1.25rem]"></Icon>
        </div>
        <div class="absolute" class:opacity-0={mode !== DARK_MODE}>
            <Icon icon="material-symbols:dark-mode-outline-rounded" class="text-[1.25rem]"></Icon>
        </div>
        <div class="absolute" class:opacity-0={mode !== AUTO_MODE}>
            <Icon icon="material-symbols:radio-button-partial-outline" class="text-[1.25rem]"></Icon>
        </div>
    </button>

    <Menu bind:open={menuOpen} label="Light/Dark Mode" class="absolute top-11 right-0 hidden lg:block">
        <button class="m3-menu-item" class:selected={mode === LIGHT_MODE}
                onclick={() => switchScheme(LIGHT_MODE)}>
            <Icon icon="material-symbols:wb-sunny-outline-rounded" class="text-[1.25rem]"></Icon>
            {i18n(I18nKey.lightMode)}
        </button>
        <button class="m3-menu-item" class:selected={mode === DARK_MODE}
                onclick={() => switchScheme(DARK_MODE)}>
            <Icon icon="material-symbols:dark-mode-outline-rounded" class="text-[1.25rem]"></Icon>
            {i18n(I18nKey.darkMode)}
        </button>
        <button class="m3-menu-item" class:selected={mode === AUTO_MODE}
                onclick={() => switchScheme(AUTO_MODE)}>
            <Icon icon="material-symbols:radio-button-partial-outline" class="text-[1.25rem]"></Icon>
            {i18n(I18nKey.systemMode)}
        </button>
    </Menu>
</div>
