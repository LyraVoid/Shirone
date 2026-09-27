<script lang="ts">
import AccentBar from "@components/atoms/display/AccentBar.svelte";
import PanelStack from "@components/atoms/display/PanelStack.svelte";
import SegmentedButton from "@components/atoms/selection/SegmentedButton.svelte";
import Slider from "@components/atoms/selection/Slider.svelte";
import Switch from "@components/atoms/selection/Switch.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import {
	defaultMode,
	flipToMode,
	getStoredMode,
	LAYOUT_MODE_CHANGE_EVENT,
	storeMode,
} from "@utils/layout-mode";
import {
	MC_SPECS,
	MC_STYLES,
	type McSpec,
	type McStyle,
	resolveScheme,
} from "@utils/mc-utils";
import {
	getDefaultHue,
	getDefaultTextureOpacity,
	getDefaultTexturePreset,
	getHue,
	getMotionPreference,
	getStoredTextureOpacity,
	getStoredTexturePreset,
	getStoredWallpaperMode,
	setHue,
	setMotionPreference,
	setTextureOpacity,
	setTexturePreset,
	setWallpaperMode,
} from "@utils/setting-utils";
import { getSpec, getStyle, setSpec, setStyle } from "@utils/theme-utils";
import { onMount } from "svelte";
import {
	getDefaultSpec,
	getDefaultStyle,
	resolveDisplaySettings,
	siteConfig,
} from "@/config";
import type { WallpaperMode } from "@/types/config";
import type { PostListMode } from "@/types/postListConfig";
import type { TexturePreset } from "@/types/textureConfig";

let { class: className = "" }: { class?: string } = $props();

const displayConfig = resolveDisplaySettings();

const defaultHue = getDefaultHue();
const defaultStyle = getDefaultStyle() as McStyle;
const defaultSpec = getDefaultSpec() as McSpec;
let hue = $state(getHue());
let style = $state<McStyle>(getStyle());
let spec = $state<McSpec>(getSpec());
let dark = $state(
	typeof document !== "undefined" &&
		document.documentElement.classList.contains("dark"),
);

let motionReduced = $state(false);

// 文章列表布局（list/grid）：初始值取访客偏好，变化时存储 + FLIP 重排
const defaultLayoutMode = defaultMode();
let postListMode = $state<PostListMode>(getStoredMode());
let lastAppliedMode = postListMode;
const defaultWallpaperMode = siteConfig.wallpaperMode.defaultMode;
let wallpaperMode = $state<WallpaperMode>(getStoredWallpaperMode());
let lastAppliedWallpaperMode = wallpaperMode;

// 背景纹理预设与浓度
const defaultTexturePreset = getDefaultTexturePreset();
const defaultTextureOpacity = getDefaultTextureOpacity();
let texturePreset = $state<TexturePreset>(getStoredTexturePreset());
let lastAppliedTexturePreset = texturePreset;
let textureOpacity = $state<number>(getStoredTextureOpacity());

const textureOptions: {
	value: TexturePreset;
	labelKey: I18nKey;
	icon: string;
}[] = [
	{
		value: "none",
		labelKey: I18nKey.texturePresetNone,
		icon: "material-symbols:block-rounded",
	},
	{
		value: "starlight",
		labelKey: I18nKey.texturePresetStarlight,
		icon: "material-symbols:auto-awesome-outline-rounded",
	},
	{
		value: "cyber-dots",
		labelKey: I18nKey.texturePresetCyberDots,
		icon: "material-symbols:grid-view-rounded",
	},
	{
		value: "topography",
		labelKey: I18nKey.texturePresetTopography,
		icon: "material-symbols:waves-rounded",
	},
	{
		value: "geometric",
		labelKey: I18nKey.texturePresetGeometric,
		icon: "material-symbols:category-outline-rounded",
	},
	{
		value: "sakura",
		labelKey: I18nKey.texturePresetSakura,
		icon: "material-symbols:local-florist-outline-rounded",
	},
];

// 明暗切换时重算色卡（LightDarkSwitch 改 <html> 的 class）
onMount(() => {
	const observer = new MutationObserver(() => {
		dark = document.documentElement.classList.contains("dark");
	});
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	});
	motionReduced = getMotionPreference();
	return () => observer.disconnect();
});

/** 完整重置：色相 / 配色风格 / Color Spec / 列表布局 / 背景纹理 全部还原为站点默认（点击即生效，无确认弹窗） */
function confirmReset() {
	hue = defaultHue;
	style = defaultStyle;
	spec = defaultSpec;
	postListMode = defaultLayoutMode;
	wallpaperMode = defaultWallpaperMode;
	texturePreset = defaultTexturePreset;
	textureOpacity = defaultTextureOpacity;
}

/** 是否有可重置的偏离（控制 Reset 按钮可见性） */
const isDirty = $derived(
	hue !== defaultHue ||
		style !== defaultStyle ||
		spec !== defaultSpec ||
		postListMode !== defaultLayoutMode ||
		wallpaperMode !== defaultWallpaperMode ||
		texturePreset !== defaultTexturePreset ||
		textureOpacity !== defaultTextureOpacity,
);

$effect(() => {
	if (hue || hue === 0) setHue(hue);
});
$effect(() => {
	setStyle(style);
});
$effect(() => {
	setSpec(spec);
});
$effect(() => {
	setMotionPreference(motionReduced);
});
$effect(() => {
	if (wallpaperMode === lastAppliedWallpaperMode) return;
	lastAppliedWallpaperMode = wallpaperMode;
	setWallpaperMode(wallpaperMode);
});
$effect(() => {
	if (texturePreset === lastAppliedTexturePreset) return;
	lastAppliedTexturePreset = texturePreset;
	setTexturePreset(texturePreset);
});
$effect(() => {
	setTextureOpacity(textureOpacity);
});
$effect(() => {
	if (postListMode === lastAppliedMode) return;
	lastAppliedMode = postListMode;
	storeMode(postListMode);
	// 全局广播：番剧页等其它消费方（.anime-list）跟随切换并各自 FLIP
	window.dispatchEvent(
		new CustomEvent(LAYOUT_MODE_CHANGE_EVENT, {
			detail: { layout: postListMode },
		}),
	);
	// 首页才有 #post-list；其它页面仅存储偏好 + 事件同步，下次进首页生效
	const container = document.getElementById("post-list");
	if (container) flipToMode(container, postListMode);
});

function styleKey(s: McStyle): I18nKey {
	switch (s) {
		case "tonalSpot":
			return I18nKey.styleTonalSpot;
		case "vibrant":
			return I18nKey.styleVibrant;
		case "content":
			return I18nKey.styleContent;
		case "expressive":
			return I18nKey.styleExpressive;
		case "rainbow":
			return I18nKey.styleRainbow;
		case "fruitSalad":
			return I18nKey.styleFruitSalad;
		case "monochrome":
			return I18nKey.styleMonochrome;
		case "neutral":
			return I18nKey.styleNeutral;
		case "fidelity":
			return I18nKey.styleFidelity;
	}
}

/** 某个风格在当前色相/明暗/规范下的 primary/secondary/tertiary */
function styleColors(s: McStyle, h: number, d: boolean, sp: McSpec) {
	const scheme = resolveScheme(h, d, s, sp);
	return {
		primary: scheme.primary ?? "#888",
		secondary: scheme.secondary ?? "#888",
		tertiary: scheme.tertiary ?? "#888",
	};
}

/** 当前主色（标题右侧预览圆点） */
const currentColor = $derived(styleColors(style, hue, dark, spec).primary);

/** 9 个风格的色卡预览（3×3 网格） */
const stylePreviews = $derived(
	MC_STYLES.map((s) => ({
		style: s,
		label: i18n(styleKey(s)),
		colors: styleColors(s, hue, dark, spec),
	})),
);
</script>

<div id="display-setting" class="float-panel float-panel-closed absolute transition-all w-80 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain m3-scroll-contain {className}">
    <PanelStack>
        <!-- 段一：主题配色（色相 + 风格九宫格 + Color Spec） -->
        <div class="p-4 flex flex-col gap-3">
            <div class="flex flex-row gap-2 items-center justify-between">
                <div class="flex gap-2 font-bold text-lg text-[var(--on-surface)] transition relative ml-3">
                    <AccentBar size="small" class="absolute -left-3 top-[0.33rem]" />
                    {i18n(I18nKey.themeColor)}
                    <button aria-label="Reset to Default" class="float-control w-7 h-7 rounded-md active:scale-90 will-change-transform flex items-center justify-center"
                            class:opacity-0={!isDirty} class:pointer-events-none={!isDirty} onclick={confirmReset}>
                        <Icon icon="fa6-solid:arrow-rotate-left" class="text-[0.875rem]"></Icon>
                    </button>
                </div>
                <div class="flex gap-1 items-center">
                    <!-- 当前色相值展示（段内用低一级容器色保持对比） -->
                    <div title={i18n(I18nKey.themeColor)}
                         class="h-7 min-w-16 px-1 rounded-(--shape-corner-m) flex items-center justify-center
                                bg-(--surface-container) text-sm font-bold text-(--on-surface)">
                        {hue}
                    </div>
                    <!-- 当前主色实时预览 -->
                    <div class="h-7 w-7 rounded-full" title={i18n(I18nKey.themeColor)}
                         style={`background: ${currentColor}; box-shadow: inset 0 0 0 1px var(--outline-variant)`}></div>
                </div>
            </div>
            <Slider bind:value={hue} min={0} max={360} step={5} label={i18n(I18nKey.themeColor)} />

            {#if displayConfig.colorStyle}
                <div class="flex flex-col gap-2 pt-1">
                    <span class="text-sm font-bold text-[var(--on-surface-variant)] ml-1">{i18n(I18nKey.colorStyle)}</span>
                    <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label={i18n(I18nKey.colorStyle)}>
                        {#each stylePreviews as p (p.style)}
                            <button
                                type="button"
                                role="radio"
                                aria-checked={style === p.style}
                                title={p.label}
                                aria-label={p.label}
                                class="m3-style-cell"
                                class:selected={style === p.style}
                                onclick={() => (style = p.style)}
                            >
                                <span class="m3-style-cell__dots">
                                    <span class="m3-style-cell__dot" style={`background: ${p.colors.primary}`}></span>
                                    <span class="m3-style-cell__dot" style={`background: ${p.colors.secondary}`}></span>
                                    <span class="m3-style-cell__dot" style={`background: ${p.colors.tertiary}`}></span>
                                </span>
                                <span class="m3-style-cell__name">{p.label}</span>
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}

            {#if displayConfig.colorSpec}
                <div class="flex flex-col gap-1.5 pt-1">
                    <span class="display-settings__section-label">{i18n(I18nKey.colorSpec)}</span>
                    <SegmentedButton
                        options={MC_SPECS.map((s) => ({
                            value: s,
                            label: s === "2021" ? i18n(I18nKey.spec2021) : i18n(I18nKey.spec2025),
                        }))}
                        bind:value={spec}
                        label={i18n(I18nKey.colorSpec)}
                    />
                </div>
            {/if}
        </div>

        <!-- 段二：界面布局（页面背景 + 列表布局 + 背景纹理） -->
        {#if displayConfig.wallpaperMode || displayConfig.layoutMode || displayConfig.texture}
            <div class="p-4 flex flex-col gap-3">
                {#if displayConfig.wallpaperMode}
                    <div class="flex flex-col gap-1.5">
                        <span class="display-settings__section-label">{i18n(I18nKey.wallpaperMode)}</span>
                        <SegmentedButton
                            options={[
                                { value: "none", label: i18n(I18nKey.wallpaperModeNone) },
                                { value: "banner", label: i18n(I18nKey.wallpaperModeBanner) },
                            ]}
                            bind:value={wallpaperMode}
                            label={i18n(I18nKey.wallpaperMode)}
                        />
                    </div>
                {/if}

                {#if displayConfig.layoutMode}
                    <div class="flex flex-col gap-1.5">
                        <span class="display-settings__section-label">{i18n(I18nKey.layoutMode)}</span>
                        <SegmentedButton
                            options={[
                                { value: "list", label: i18n(I18nKey.layoutList) },
                                { value: "grid", label: i18n(I18nKey.layoutGrid) },
                            ]}
                            bind:value={postListMode}
                            label={i18n(I18nKey.layoutMode)}
                        />
                    </div>
                {/if}

                {#if displayConfig.texture}
                    <div class="flex flex-col gap-2 pt-1">
                        <span class="display-settings__section-label">{i18n(I18nKey.texturePreset)}</span>
                        <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label={i18n(I18nKey.texturePreset)}>
                            {#each textureOptions as opt (opt.value)}
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={texturePreset === opt.value}
                                    title={i18n(opt.labelKey)}
                                    aria-label={i18n(opt.labelKey)}
                                    class="m3-style-cell"
                                    class:selected={texturePreset === opt.value}
                                    onclick={() => (texturePreset = opt.value)}
                                >
                                    <Icon icon={opt.icon} class="text-lg" />
                                    <span class="m3-style-cell__name">{i18n(opt.labelKey)}</span>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}

        <!-- 段三：动效与体验 -->
        {#if displayConfig.reduceMotion}
            <div class="p-4 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <Icon icon="material-symbols:motion-photos-off" class="text-lg text-[var(--primary)]" />
                    <span class="text-sm font-bold text-[var(--on-surface)]">{i18n(I18nKey.reduceMotion)}</span>
                </div>
                <Switch bind:checked={motionReduced} label={i18n(I18nKey.reduceMotion)} icons />
            </div>
        {/if}
    </PanelStack>
</div>


<style lang="stylus">
    .display-settings__section-label
        font: var(--m3e-type-label-large)
        font-weight: 700
        color: var(--on-surface-variant)
        margin-left: var(--m3e-space-1)

    .m3-style-cell
        display: flex
        flex-direction: column
        align-items: center
        justify-content: center
        gap: var(--m3e-space-1)
        padding: var(--m3e-space-2) var(--m3e-space-1)
        border: none
        border-radius: var(--shape-corner-m)
        background: transparent
        color: var(--on-surface-variant)
        font: var(--m3e-type-label-small)
        cursor: pointer
        user-select: none
        --m3e-state-color: var(--on-surface)
        transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard), color var(--m3e-duration-short) var(--m3e-easing-standard)
        &:hover
            background: unquote("color-mix(in oklab, var(--on-surface) 8%, transparent)")
        &.selected
            background: var(--secondary-container)
            color: var(--on-secondary-container)
            font-weight: 600
            color: var(--on-secondary-container)

        &__dots
            display: flex
            gap: 0.25rem

        &__dot
            width: 0.625rem
            height: 0.625rem
            border-radius: var(--shape-corner-full)
            box-shadow: unquote("inset 0 0 0 1px color-mix(in oklab, var(--on-surface) 20%, transparent)")

        &__name
            max-width: 100%
            overflow: hidden
            text-overflow: ellipsis
            white-space: nowrap

    :global(#display-setting.m3-scroll-contain)
        scrollbar-width: thin
        scrollbar-color: var(--scrollbar-bg) transparent
        -webkit-overflow-scrolling: touch
        &::-webkit-scrollbar
            width: 0.375rem
        &::-webkit-scrollbar-track
            background: transparent
        &::-webkit-scrollbar-thumb
            background: var(--scrollbar-bg)
            border-radius: var(--shape-corner-full)
            &:hover
                background: var(--scrollbar-bg-hover)
            &:active
                background: var(--scrollbar-bg-active)
</style>
