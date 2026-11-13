<script lang="ts">
/**
 * 页面切换进度条：仅在 Swup 过渡期间显示 indeterminate 细条。
 * 顶栏覆盖 Banner 时贴住视口上沿，否则显示在顶栏下沿；
 * 渲染完成后淡出（类似浏览器标签加载指示，不常驻，避免干扰观感）。
 * 样式预设由 siteConfig.progressIndicator.style 控制：
 * dual 双向扫描（官方默认双线）/ single 单向扫描（单线）。
 */
import ProgressIndicator from "@components/atoms/feedback/ProgressIndicator.svelte";
import { onMount } from "svelte";
import { siteConfig } from "@/config";

let visible = $state(false);
const style = siteConfig.progressIndicator.style;

function show() {
	visible = true;
}

function hide() {
	visible = false;
}

onMount(() => {
	const endEvents = [
		"swup:page:view",
		"swup:visit:end",
		"swup:visit:abort",
		"swup:visit:fail",
		"swup:fetch:error",
		"swup:fetch:timeout",
	];
	document.addEventListener("swup:visit:start", show);
	for (const event of endEvents) document.addEventListener(event, hide);
	return () => {
		document.removeEventListener("swup:visit:start", show);
		for (const event of endEvents) document.removeEventListener(event, hide);
	};
});
</script>

<div
	class="route-progress route-progress--{style}"
	class:route-progress--visible={visible}
	aria-hidden="true"
>
	<ProgressIndicator indeterminate={style} />
</div>

<style lang="stylus">
.route-progress
	position: fixed
	top: 4rem
	left: 0
	right: 0
	height: 3px
	z-index: 65
	opacity: 0
	pointer-events: none
	transition:
		top var(--m3e-duration-short) var(--m3e-easing-standard),
		opacity var(--m3e-duration-short) var(--m3e-easing-standard)
	overflow: hidden

	&--visible
		opacity: 1

:global(body[data-banner-visible="true"][data-banner-scrolled="false"]) .route-progress
	top: 0

</style>
