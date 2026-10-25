<script lang="ts">
/**
 * M3E LoadingIndicator — 加载指示器原子（官方 LoadingIndicator.kt 移植）。
 * 形状数据来自 androidx.graphics.shapes 的 RoundedPolygon + Morph（feature-matching 后
 * 逐对 cubic 线性插值，见 loadingShapes.ts），与官方渲染完全同源：
 * - indeterminate：7 形状循环 morph（SoftBurst/Cookie9/Pentagon/Pill/Sunny/Cookie4/Oval，
 *   官方 IndeterminateIndicatorPolygons），每段 spring(damping 0.6, stiffness 200,
 *   visibilityThreshold 0.1) + 650ms 间隔（MorphIntervalMillis），逐段累计旋转 90°，
 *   整体线性旋转 4666ms/圈（GlobalRotationDurationMillis）；
 * - determinate：官方 DeterminateIndicatorPolygons（Circle 旋转 18° → SoftBurst），
 *   progress 0→1 线性 morph，逆时针旋转 -progress*180°；
 * - 指示器缩放 = calculateScaleFactor × ActiveIndicatorScale（38/48），居中于 48×48 容器；
 * - contained：官方 ContainedLoadingIndicator —— primary-container 圆形容器 +
 *   on-primary-container 指示器。
 * 用法：<LoadingIndicator />                    ← indeterminate
 *      <LoadingIndicator progress={0.6} />      ← determinate
 *      <LoadingIndicator contained />           ← 带容器
 */
import { onMount } from "svelte";
import { loadingShapes, type MorphData } from "./loadingShapes";

let {
	progress,
	color,
	size = 48,
	contained = false,
	containerColor,
	class: className = "",
}: {
	/** 0-1 定值；省略 = indeterminate（7 形状循环 morph） */
	progress?: number;
	/** 指示器颜色；默认 contained ? on-primary-container : primary（官方 ActiveIndicatorColor） */
	color?: string;
	/** 容器直径 px（官方 ContainerWidth/Height = 48） */
	size?: number;
	/** 带容器（官方 ContainedLoadingIndicator：primary-container 圆形容器） */
	contained?: boolean;
	/** 容器背景覆盖（默认 primary-container） */
	containerColor?: string;
	class?: string;
} = $props();

const isIndeterminate = $derived(progress === undefined);
const morphs = $derived(
	isIndeterminate
		? loadingShapes.indeterminate.morphs
		: loadingShapes.determinate.morphs,
);
const shapeScale = $derived(
	isIndeterminate
		? loadingShapes.indeterminate.scale
		: loadingShapes.determinate.scale,
);
const indicatorColor = $derived(
	color ?? (contained ? "var(--on-primary-container)" : "var(--primary)"),
);
const bgColor = $derived(
	containerColor ?? (contained ? "var(--primary-container)" : "transparent"),
);

const VIEW = 48; // 官方 ContainerWidth/Height
const ACTIVE = 38; // 官方 ActiveSize（38dp）
// normalized 0..1 → viewBox px：官方 size×scaleFactor = 48×(scale×38/48) = 38×scale
const unit = $derived(ACTIVE * shapeScale);

/** 线性插值匹配好的 cubic 对 → SVG path d（官方 Morph.asCubics → toPath，startAngle=0） */
function buildPath(morph: MorphData, t: number): string {
	const u = unit;
	const c = VIEW / 2;
	let d = "";
	for (let i = 0; i < morph.length; i++) {
		const a = morph[i][0];
		const b = morph[i][1];
		const x0 = (a[0] + (b[0] - a[0]) * t - 0.5) * u + c;
		const y0 = (a[1] + (b[1] - a[1]) * t - 0.5) * u + c;
		const c0x = (a[2] + (b[2] - a[2]) * t - 0.5) * u + c;
		const c0y = (a[3] + (b[3] - a[3]) * t - 0.5) * u + c;
		const c1x = (a[4] + (b[4] - a[4]) * t - 0.5) * u + c;
		const c1y = (a[5] + (b[5] - a[5]) * t - 0.5) * u + c;
		const x1 = (a[6] + (b[6] - a[6]) * t - 0.5) * u + c;
		const y1 = (a[7] + (b[7] - a[7]) * t - 0.5) * u + c;
		d +=
			(i === 0 ? `M${x0.toFixed(2)} ${y0.toFixed(2)}` : "") +
			"C" +
			c0x.toFixed(2) +
			" " +
			c0y.toFixed(2) +
			" " +
			c1x.toFixed(2) +
			" " +
			c1y.toFixed(2) +
			" " +
			x1.toFixed(2) +
			" " +
			y1.toFixed(2);
	}
	return `${d}Z`;
}

// ---- determinate：官方 activeMorphIndex/局部进度 + 逆时针旋转 -progress*180° ----
const detProgress = $derived(Math.max(0, Math.min(1, progress ?? 0)));
const detMorphIndex = $derived(
	Math.min(Math.floor(detProgress * morphs.length), morphs.length - 1),
);
const detLocal = $derived(
	detProgress === 1 && detMorphIndex === morphs.length - 1
		? 1
		: (detProgress * morphs.length) % 1,
);
const detPath = $derived(buildPath(morphs[detMorphIndex], detLocal));
const detRotation = $derived(-detProgress * 180);

// ---- indeterminate：spring + 650ms 间隔 + 累计 90°/段 + 4666ms 整体旋转 ----
const MORPH_INTERVAL = 650; // 官方 MorphIntervalMillis
const GLOBAL_ROTATION_MS = 4666; // 官方 GlobalRotationDurationMillis
let indetPath = $state("");
let indetRotation = $state(0);

let raf = 0;
let phase = 0;
let phaseStart = 0;
let springX = 0;
let springV = 0;
let targetAngle = 90; // 官方 morphRotationTargetAngle 初值 = QuarterRotation
let globalStart = 0;
let lastFrame = 0;

onMount(() => {
	const k = 200; // spring stiffness
	const damping = 2 * 0.6 * Math.sqrt(k); // 2×dampingRatio×sqrt(stiffness×mass)，mass=1
	phaseStart = performance.now();
	globalStart = phaseStart;
	lastFrame = phaseStart;

	const frame = (now: number) => {
		if (document.hidden) {
			raf = requestAnimationFrame(frame);
			return;
		}
		if (isIndeterminate) {
			const elapsed = now - phaseStart;
			if (elapsed >= MORPH_INTERVAL) {
				phase = (phase + 1) % morphs.length;
				springX = 0;
				springV = 0;
				targetAngle = (targetAngle + 90) % 360;
				phaseStart = now;
			}
			const dt = Math.min(Math.max((now - lastFrame) / 1000, 0.001), 0.05);
			// 半隐式欧拉积分（近似 Compose spring）
			const acc = -k * (springX - 1) - damping * springV;
			springV += acc * dt;
			springX += springV * dt;
			// visibilityThreshold=0.1：收敛后钉在实际终点（官方随即 snap 到下一段起点，视觉等价）
			if (Math.abs(1 - springX) < 0.1 && Math.abs(springV) < 0.05) {
				springX = 1;
				springV = 0;
			}
			springX = Math.max(-0.05, Math.min(1.15, springX));
			indetPath = buildPath(morphs[phase], springX);
			const globalRot = (((now - globalStart) / GLOBAL_ROTATION_MS) % 1) * 360;
			indetRotation = springX * 90 + targetAngle + globalRot;
		}
		lastFrame = now;
		raf = requestAnimationFrame(frame);
	};
	raf = requestAnimationFrame(frame);
	return () => cancelAnimationFrame(raf);
});

const pathD = $derived(isIndeterminate ? indetPath : detPath);
const rotation = $derived(isIndeterminate ? indetRotation : detRotation);
</script>

<div
	class="m3-loading {className}"
	class:m3-loading--contained={contained}
	style={`--m3-loading-size: ${size}px; --m3-loading-bg: ${bgColor};`}
	role="progressbar"
	aria-label="加载中"
	aria-valuenow={isIndeterminate ? undefined : detProgress}
>
	<svg
		class="m3-loading__indicator"
		viewBox="0 0 48 48"
		aria-hidden="true"
	>
		<path d={pathD} fill={indicatorColor} transform={`rotate(${rotation} 24 24)`}></path>
	</svg>
</div>

<style lang="stylus">
.m3-loading
    position: relative
    display: inline-flex
    align-items: center
    justify-content: center
    width: var(--m3-loading-size, 48px)
    height: var(--m3-loading-size, 48px)
    flex-shrink: 0

    &--contained
        // 官方 ContainedLoadingIndicator：CornerFull 圆形容器 + primary-container 背景
        border-radius: 50%
        background: var(--m3-loading-bg, var(--primary-container))
        overflow: hidden

    &__indicator
        display: block
        width: 100%
        height: 100%
</style>
