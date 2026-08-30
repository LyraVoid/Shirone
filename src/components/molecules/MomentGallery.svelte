<script lang="ts">
/**
 * 动态图片画廊（分子）：两段式看图。
 * 网格态：按数量自适应（1 单图直进灯箱 / 2 与 4 双列方格 / 3 拼 1大+2小 /
 * 5+ 三列封顶 6 块 +N 折叠，桌面端限宽防格子过大）。
 * 查看器态：卡片内展开主舞台 + tonal 圆形前后切换 + 计数 chip + 缩略图条
 * （active 高亮并自动居中），点大图或「查看原图」经 Fancybox API 进灯箱轮播。
 * 键盘：←/→ 切换、Home/End 首尾、Esc 收起；开合带焦点管理与 emphasized 入场动效。
 */
import IconButton from "@components/atoms/action/IconButton.svelte";
import LoadingIndicator from "@components/atoms/feedback/LoadingIndicator.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import type { MomentImage } from "@utils/content-utils";
import { openFancyboxGallery } from "@utils/fancybox-handler";
import { prefersReducedMotion } from "@utils/motion";
import { tick } from "svelte";

let { images = [] as MomentImage[] }: { images?: MomentImage[] } = $props();

const MAX_TILES = 6;

let viewing = $state(false);
let index = $state(0);
let viewerEl: HTMLElement | undefined = $state();
let gridEl: HTMLElement | undefined = $state();
let thumbEls: HTMLElement[] = [];
/** 收起后焦点返回被点击的瓦片（记索引：开查看器时网格已卸载） */
let lastIndex = 0;

/** 瓦片图片加载进度：lazy 触发 loadstart 后才挂载指示器（离屏瓦片不空转 rAF） */
let startedTiles = $state(new Set<string>());
let loadedTiles = $state(new Set<string>());
let loadedViewerImages = $state(new Set<string>());

const current = $derived(images[index] ?? images[0]);
const visibleImages = $derived(
	images.length > MAX_TILES ? images.slice(0, MAX_TILES) : images,
);
const remainder = $derived(
	images.length > MAX_TILES ? images.length - MAX_TILES : 0,
);
const gridVariant = $derived.by(() => {
	if (images.length === 1) return "single";
	/* 3 图走「1 大 + 2 小」拼图，避免双列网格的 2+1 孤儿行 */
	if (images.length === 3) return "mosaic";
	if (images.length <= 4) return "pair";
	return "trio";
});

function openViewer(i: number) {
	lastIndex = i;
	index = i;
	viewing = true;
}

async function collapseViewer() {
	viewing = false;
	// 等网格重新挂载后，把焦点还给当初点击的瓦片
	await tick();
	(gridEl?.children[lastIndex] as HTMLButtonElement | undefined)?.focus({
		preventScroll: true,
	});
}

function openLightbox(i: number) {
	void openFancyboxGallery(
		images.map((image) => ({
			src: image.src,
			caption: image.alt || undefined,
		})),
		i,
	);
}

function go(delta: number) {
	const next = index + delta;
	if (next >= 0 && next < images.length) index = next;
}

function handleKeydown(event: KeyboardEvent) {
	switch (event.key) {
		case "ArrowLeft":
			event.preventDefault();
			go(-1);
			break;
		case "ArrowRight":
			event.preventDefault();
			go(1);
			break;
		case "Home":
			event.preventDefault();
			index = 0;
			break;
		case "End":
			event.preventDefault();
			index = images.length - 1;
			break;
		case "Escape":
			event.preventDefault();
			collapseViewer();
			break;
	}
}

function tileLabel(i: number) {
	return `${i18n(I18nKey.openImage)} ${i + 1}`;
}

function thumbnailSrc(image: MomentImage) {
	return image.thumbnailSrc ?? image.src;
}

function markViewerImageLoaded(src: string) {
	loadedViewerImages = new Set(loadedViewerImages).add(src);
}

function tileSizes(i: number) {
	if (gridVariant === "single")
		return "(max-width: 639px) calc(100vw - 6.25rem), 480px";
	if (gridVariant === "pair")
		return "(max-width: 639px) calc((100vw - 6.75rem) / 2), 240px";
	if (gridVariant === "mosaic" && i === 0)
		return "(max-width: 639px) calc((100vw - 6.75rem) * 0.66), 320px";
	if (gridVariant === "mosaic")
		return "(max-width: 639px) calc((100vw - 6.75rem) * 0.33), 160px";
	return "(max-width: 639px) calc((100vw - 7.25rem) / 3), 200px";
}

// 打开时聚焦查看器容器（键盘立即可用）
$effect(() => {
	if (viewing) viewerEl?.focus();
});

// 缩略图条：active 项滚动居中（reduced-motion 直接跳转）
$effect(() => {
	if (!viewing) return;
	thumbEls[index]?.scrollIntoView({
		behavior: prefersReducedMotion() ? "auto" : "smooth",
		block: "nearest",
		inline: "center",
	});
});
</script>

{#if viewing}
	<div
		class="moment-viewer"
		bind:this={viewerEl}
		role="group"
		aria-roledescription={i18n(I18nKey.imageViewer)}
		tabindex="-1"
		onkeydown={handleKeydown}
	>
		<div class="moment-viewer__bar">
			<span class="moment-viewer__counter" aria-live="polite">
				{index + 1} / {images.length}
			</span>
			<div class="moment-viewer__actions">
				<IconButton
					icon="material-symbols:open-in-full-rounded"
					variant="standard"
					size="xsmall"
					label={i18n(I18nKey.viewOriginal)}
					onclick={() => openLightbox(index)}
				/>
				<IconButton
					icon="material-symbols:contract-rounded"
					variant="standard"
					size="xsmall"
					label={i18n(I18nKey.backToGrid)}
					onclick={collapseViewer}
				/>
			</div>
		</div>

		<div class="moment-viewer__stage">
			<IconButton
				icon="material-symbols:chevron-left-rounded"
				variant="tonal"
				size="xsmall"
				label={i18n(I18nKey.previousImage)}
				disabled={index === 0}
				onclick={() => go(-1)}
			/>
			{#key index}
				<button
					type="button"
					class="moment-viewer__stage-btn"
					aria-label={current.alt
						? `${i18n(I18nKey.viewOriginal)}: ${current.alt}`
						: i18n(I18nKey.viewOriginal)}
					onclick={() => openLightbox(index)}
				>
					{#if !loadedViewerImages.has(current.src)}
						<span class="moment-viewer__stage-loading" aria-hidden="true">
							<LoadingIndicator contained size={32} />
						</span>
					{/if}
					<img
						src={current.src}
						alt=""
						loading="eager"
						decoding="async"
						class:moment-viewer__stage-img--loaded={loadedViewerImages.has(
							current.src,
						)}
						onload={() => markViewerImageLoaded(current.src)}
					/>
				</button>
			{/key}
			<IconButton
				icon="material-symbols:chevron-right-rounded"
				variant="tonal"
				size="xsmall"
				label={i18n(I18nKey.nextImage)}
				disabled={index === images.length - 1}
				onclick={() => go(1)}
			/>
		</div>

		{#if current.alt}
			<p class="moment-viewer__caption">{current.alt}</p>
		{/if}

		<div class="moment-viewer__thumbs hide-scrollbar">
			{#each images as image, i (image.src + i)}
				<button
					type="button"
					class="moment-viewer__thumb"
					class:moment-viewer__thumb--active={i === index}
					bind:this={thumbEls[i]}
					aria-label={tileLabel(i)}
					aria-current={i === index}
					onclick={() => (index = i)}
				>
					<img
						src={thumbnailSrc(image)}
						srcset={image.thumbnailSrcset}
						sizes="56px"
						alt=""
						loading="lazy"
						decoding="async"
					/>
				</button>
			{/each}
		</div>
	</div>
{:else}
	<div class="moment-card__gallery moment-card__gallery--{gridVariant}" bind:this={gridEl}>
		{#each visibleImages as image, i (image.src + i)}
			<button
				type="button"
				class="moment-card__tile"
				class:moment-card__tile--single={gridVariant === "single"}
				class:moment-card__tile--hero={gridVariant === "mosaic" && i === 0}
				aria-label={tileLabel(i)}
				onclick={() => (images.length === 1 ? openLightbox(0) : openViewer(i))}
			>
				{#if startedTiles.has(image.src) && !loadedTiles.has(image.src)}
					<span class="moment-card__tile-loading" aria-hidden="true">
						<LoadingIndicator contained size={28} />
					</span>
				{/if}
				<img
					src={thumbnailSrc(image)}
					srcset={image.thumbnailSrcset}
					sizes={tileSizes(i)}
					alt={image.alt}
					loading="lazy"
					decoding="async"
					class:moment-card__tile-img--loaded={loadedTiles.has(image.src)}
					onloadstart={() => (startedTiles = new Set(startedTiles).add(image.src))}
					onload={() => (loadedTiles = new Set(loadedTiles).add(image.src))}
				/>
				{#if remainder > 0 && i === MAX_TILES - 1}
					<span class="moment-card__more">+{remainder}</span>
				{/if}
			</button>
		{/each}
	</div>
{/if}

<style lang="stylus">
@import "../../styles/breakpoints.styl"

/* ===== 网格态（类名保持 moment-card__*，与卡片视觉一体） ===== */
.moment-card__gallery
	display: grid
	gap: 0.5rem
	margin-top: 0.875rem

	/* 桌面端限宽：多图网格的格子保持精致尺度，窄屏自然全宽 */
	&--pair
		grid-template-columns: repeat(2, 1fr)
		max-width: 30rem
	/* 3 图拼图：左大图跨两行 + 右侧两方格，整体拼成一个正方形 */
	&--mosaic
		grid-template-columns: 2fr 1fr
		grid-template-rows: 1fr 1fr
		max-width: 30rem
	&--trio
		grid-template-columns: repeat(3, 1fr)
		max-width: 38rem

.moment-card__tile
	position: relative
	display: flex
	padding: 0
	border: none
	overflow: hidden
	border-radius: var(--shape-corner-m)
	aspect-ratio: 1
	background: var(--surface-container-high)
	cursor: zoom-in
	&:focus-visible
		outline: 2px solid var(--primary)
		outline-offset: 2px
	> img
		display: block
		width: 100%
		height: 100%
		object-fit: cover
		/* 加载前隐藏（指示器占位），加载完成后淡入 */
		opacity: 0
		transition: opacity var(--m3e-duration-medium) var(--m3e-easing-standard)

		&.moment-card__tile-img--loaded
			opacity: 1

	/* 单图：固定 4:3 比例盒（限宽 30rem）。
	   不用自然尺寸：lazy 图片加载前无内在尺寸，fit-content 会塌成 0×0，
	   Chrome 对零尺寸元素的懒加载可能永不触发 */
	&--single
		aspect-ratio: 4 / 3
		width: 100%
		max-width: 30rem
		border-radius: var(--shape-corner-l)
		> img
			height: 100%
			object-fit: cover

	/* 拼图大图：跨两行由行高撑满（与右列两方格等比成正方形） */
	&--hero
		grid-row: span 2
		aspect-ratio: auto

/* 瓦片加载指示器：lazy 图开始加载后出现，加载完成即卸载（避免离屏空转） */
.moment-card__tile-loading
	position: absolute
	inset: 0
	display: flex
	align-items: center
	justify-content: center
	background: var(--surface-container-high)
	pointer-events: none

.moment-card__more
	position: absolute
	inset: 0
	display: flex
	align-items: center
	justify-content: center
	/* 图片折叠遮罩：站点规范允许的唯一固定黑/白叠加 */
	background: rgb(0 0 0 / 60%)
	color: rgb(255 255 255)
	font: var(--m3e-type-title-large)

/* ===== 查看器态（卡片内展开） ===== */
.moment-viewer
	display: flex
	flex-direction: column
	gap: 0.75rem
	margin-top: 0.875rem
	padding: 0.75rem
	border-radius: var(--shape-corner-l)
	background: var(--surface-container-low)
	border: 1px solid var(--outline-variant)
	outline: none
	animation: moment-viewer-in var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

	&__bar
		display: flex
		align-items: center
		justify-content: space-between
		gap: 0.5rem

	&__counter
		padding: 0.1875rem 0.625rem
		border-radius: var(--shape-corner-full)
		background: var(--surface-container-high)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-medium)
		font-variant-numeric: tabular-nums

	&__actions
		display: inline-flex
		gap: 0.25rem

	&__stage
		display: flex
		align-items: center
		gap: 0.5rem

	&__stage-btn
		position: relative
		flex: 1
		min-width: 0
		display: flex
		align-items: center
		justify-content: center
		aspect-ratio: 16 / 9
		max-height: 26rem
		padding: 0
		border: none
		background: var(--surface-container-high)
		border-radius: var(--shape-corner-m)
		overflow: hidden
		cursor: zoom-in
		&:focus-visible
			outline: 2px solid var(--primary)
			outline-offset: 2px
		> img
			display: block
			width: 100%
			height: 100%
			object-fit: contain
			opacity: 0
			transition: opacity var(--m3e-duration-short) var(--m3e-easing-standard)

		> img.moment-viewer__stage-img--loaded
			opacity: 1

	&__stage-loading
		position: absolute
		inset: 0
		display: grid
		place-items: center
		pointer-events: none

	&__caption
		margin: 0
		text-align: center
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)
		overflow: hidden
		text-overflow: ellipsis
		white-space: nowrap

	&__thumbs
		display: flex
		gap: 0.5rem
		overflow-x: auto
		padding-bottom: 0.25rem
		scroll-snap-type: x proximity

	&__thumb
		flex-shrink: 0
		width: 3.5rem
		height: 3.5rem
		padding: 0
		border: none
		overflow: hidden
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-high)
		opacity: 0.7
		cursor: pointer
		scroll-snap-align: center
		transition: opacity var(--m3e-duration-short) var(--m3e-easing-standard)
		&:hover
			opacity: 1
		&:focus-visible
			outline: 2px solid var(--primary)
			outline-offset: 2px
		> img
			display: block
			width: 100%
			height: 100%
			object-fit: cover

		&--active
			opacity: 1
			box-shadow: 0 0 0 2px var(--primary)
			&:hover
				opacity: 1

/* 查看器入场（emphasized-decelerate；reduced-motion 由全局 motion-reduced 规则禁用动画） */
@keyframes moment-viewer-in
	from
		opacity: 0
		transform: scale(0.98)
	to
		opacity: 1
		transform: scale(1)

@media (max-width: bp-sm - 1px)
	.moment-viewer
		&__stage-btn
			max-height: 18rem

		&__thumb
			width: 2.75rem
			height: 2.75rem

:global(html.motion-reduced) .moment-viewer__stage-btn > img
	transition: none

@media (prefers-reduced-motion: reduce)
	.moment-viewer__stage-btn > img
		transition: none
</style>
