<script lang="ts">
/**
 * M3E ProgressIndicator — 进度指示原子（官方 ProgressIndicator.kt / WavyProgressIndicator.kt 移植）。
 * variant: linear（4dp 高轨道）/ circular（圆环，size 直径 / strokeWidth 厚度可调）。
 * progress: 0-1 定值模式；省略/undefined = indeterminate。
 * 颜色：active = primary、track = surface-container-highest（官方默认）。
 *
 * indeterminate linear 精确复刻官方 FirstLine/SecondLine：4 个 head/tail 值驱动
 * 绘制（Line1 head 0→1000ms、tail 250→1250ms；Line2 head 650→1500ms、
 * tail 900→1750ms，总循环 1750ms），线从 head 生长、tail 消失，无跳变闪烁。
 * Web 用 @property CSS 变量 + keyframes 实现 head/tail 插值。
 *
 * wavy（官方 WavyProgressIndicator，Expressive 波浪形态）：
 *   linear wavy = 240×10dp 容器（LinearContainerWidth / WaveHeight），active 为波浪线
 *     （官方 fullProgressPath 二次贝塞尔，controlY = height - strokeWidth），
 *     determinate 振幅按 progress 阈值（≤0.1 / ≥0.95 → 0 直线，中间 → 1 满波），
 *     增大/减小分别用 500ms standard / emphasized-accelerate tween；
 *     indeterminate 固定振幅 1，双线 head/tail + 波横向流动（每波长一个周期）；
 *     波浪锚定轨道全局坐标（官方 PathMeasure 取样 [tail+shift, head+shift] 平移 -shift），
 *     窗口滑动时波浪相位不变、双线同相连续。
 *   circular wavy = 48×48 容器（WaveSize），圆 ↔ 星形齿 morph（9 齿，
 *     RoundedPolygon.star innerRadius 0.75 / 外角 0.35 smooth 0.4 / 内角 0.5），
 *     determinate 起点 3 点钟（官方未加基准旋转），indeterminate 三层动画：
 *     全局 1080° 匀速 + 附加步进 90°@300ms 停 1.2s（6000ms）+ 弧长 0.1↔0.87，
 *     起点 12 点钟（基准 +90°）。
 *     弧内齿形流动（dashoffset 前移一圈 + 同步反向旋转抵消，官方取样后 rotate(-shift)）。
 *
 * 用法：<ProgressIndicator progress={0.6} />
 *      <ProgressIndicator />                        ← indeterminate（dual 双线）
 *      <ProgressIndicator indeterminate="wave" />   ← 旧波浪（mask 流带）
 *      <ProgressIndicator indeterminate="single" />
 *      <ProgressIndicator variant="linear" wavy progress={0.6} />   ← 官方 wavy 线性
 *      <ProgressIndicator variant="circular" wavy />                ← 官方 wavy 圆形
 */
import {
	buildCircularStarPath,
	buildLinearWavePath,
	circularWavyVertexCount,
	cubicBezier,
} from "@utils/wavy-progress";
import { untrack } from "svelte";

let {
	variant = "linear",
	progress,
	label = "加载中",
	showStop = true,
	showThumb = false,
	containerWidth = undefined as number | undefined,
	indeterminate = "dual",
	color = "var(--primary)",
	trackColor = "var(--surface-container-highest)",
	ariaHidden = false,
	strokeCap = "round",
	gapSize = 4,
	size = undefined as number | undefined,
	strokeWidth = 4,
	wavy = false,
	wavelength = 0,
	waveSpeed = 0,
	amplitude,
	class: className = "",
}: {
	variant?: "linear" | "circular";
	/** 0-1 定值；undefined = indeterminate */
	progress?: number;
	label?: string;
	/** determinate linear 填充末端 stop 圆点（官方 StopSize 4dp），默认显示 */
	showStop?: boolean;
	/** determinate wavy 线性模式下在当前位置绘制一体化 Thumb 手柄 */
	showThumb?: boolean;
	/** 外部显式传入的容器宽度；若未传入则默认使用内部测量宽度或 240px 官方标准宽度 */
	containerWidth?: number;
	/** indeterminate 动画变体（linear：dual 双线官方默认 / wave 波浪 / single 单线；
		    circular：dual 官方弧伸缩 / single 固定弧 / wave 官方带弧度旋转组合） */
	indeterminate?: "dual" | "wave" | "single";
	/** active 指示器颜色（官方 color 参数） */
	color?: string;
	/** 仅作为视觉层时隐藏辅助技术语义，由外层交互控件提供标签。 */
	ariaHidden?: boolean;
	/** 轨道颜色（官方 trackColor 参数） */
	trackColor?: string;
	/** 线端形状：round 圆头（官方默认）/ butt 平头 */
	strokeCap?: "round" | "butt";
	/** active 与 track 之间的间隙 px（官方 gapSize 参数，默认 4） */
	gapSize?: number;
	/** circular 直径 px（默认 40；wavy 模式默认 48 = 官方 WaveSize；thick 变体 52+8） */
	size?: number;
	/** circular 描边厚度 px（官方 ActiveThickness/TrackThickness 默认 4；thick 变体 8） */
	strokeWidth?: number;
	/** 官方 Wavy 形态：linear = 波浪条，circular = 48×48 圆↔星 morph */
	wavy?: boolean;
	/** 波长 px（默认：linear determinate 40 / indeterminate 20，circular 15） */
	wavelength?: number;
	/** 波速 px/s（默认 = wavelength，即每秒移动一个波长） */
	waveSpeed?: number;
	/** 振幅：number = 固定值（indeterminate 默认 1）；(progress)=>number = 按进度
		    （determinate 默认官方 indicatorAmplitude：≤0.1 / ≥0.95 → 0，其余 → 1） */
	amplitude?: number | ((progress: number) => number);
	class?: string;
} = $props();

let measuredWidth = $state<number>(240);
const resolvedWidth = $derived(
	containerWidth !== undefined && containerWidth > 0
		? containerWidth
		: measuredWidth > 0
			? measuredWidth
			: 240,
);

// 响应式派生：progress 变化时实时重算（const 只算一次会导致滑块拖动不更新）
const determinate = $derived(progress !== undefined && progress >= 0);
const p = $derived(progress ?? 0);
const pct = $derived(determinate ? Math.max(0, Math.min(100, p * 100)) : 0);
// circular：动态尺寸（size 直径 / strokeWidth 厚度），wavy 默认 48（官方 WaveSize）
const resolvedSize = $derived(size ?? (wavy ? 48 : 40));
const circCenter = $derived(resolvedSize / 2);
const circR = $derived(Math.max((resolvedSize - strokeWidth) / 2, 0.5));
// 圆环周长 = 2πr（SVG 坐标系 = 实际像素，viewBox 随 size 动态生成）
const CIRC = $derived(2 * Math.PI * circR);
// circular gap 像素：官方 adjustedGapSize = gapSize + strokeWidth（round cap 弧端补偿）
const gapPx = $derived(gapSize + strokeWidth);

/* ===================== wavy（官方 WavyProgressIndicator） ===================== */
const WAVY_LINEAR_H = 10; // 官方 WaveHeight

const wavyLinearWaveLength = $derived(
	wavelength > 0 ? wavelength : determinate ? 40 : 20,
);
const wavyLinearWaveSpeed = $derived(
	waveSpeed > 0 ? waveSpeed : wavyLinearWaveLength,
);
// 实例级唯一 clipId，供 determinate wavy linear 模式裁切可视区域
const clipId = `pi-wavy-clip-${Math.random().toString(36).slice(2, 9)}`;

// 全宽路径 = 容器宽 + 左右各 2 个波长余量（官方 widthWithExtraPhase）
const wavyLinearPathW = $derived(resolvedWidth + wavyLinearWaveLength * 2);
// pathLength=100 归一化：1px 宽度对应的归一化长度
const wavyLinearUnitsPerPx = $derived(100 / wavyLinearPathW);
const wavyCapW = $derived(strokeCap === "butt" ? 0 : strokeWidth / 2);
// determinate active 头位置（官方 barHead.coerceIn(capW, width-capW)）
const wavyLinearHeadPx = $derived(
	determinate
		? Math.max(
				0,
				Math.min(
					resolvedWidth - wavyCapW,
					Math.max(wavyCapW, p * resolvedWidth),
				),
			)
		: 0,
);
const wavyLinearHeadUnits = $derived(wavyLinearHeadPx * wavyLinearUnitsPerPx);
// 一个波长的像素偏移（用于 CSS 流动平移）
const wavyLinearShiftPx = $derived(wavyLinearWaveLength);
// 波流动画时长（官方 (wavelength/waveSpeed)*1000ms）
const wavyLinearFlowMs = $derived(
	(wavyLinearWaveLength / wavyLinearWaveSpeed) * 1000,
);
// determinate track 起始 x（紧跟 head 后的 gap，无论滑到哪里都保持恒定间隙）
const wavyLinearTrackX1 = $derived(
	(() => {
		const head = wavyLinearHeadPx;
		const cap = wavyCapW;
		const effectiveGap = showThumb ? gapSize + 2 : gapSize;
		return Math.min(resolvedWidth, Math.max(cap, head + effectiveGap));
	})(),
);
const wavyLinearTrackX2 = $derived(resolvedWidth - wavyCapW);
// determinate stop 圆点（官方 drawStopIndicator：右端 4dp，progress 接近末端时缩小消失）
const wavyStop = $derived(
	(() => {
		const stopMax = Math.min(strokeWidth, 4);
		const offset = stopMax === strokeWidth ? 0 : strokeWidth / 4;
		const baseX = resolvedWidth - stopMax - offset;
		const progressX = wavyLinearHeadPx + wavyCapW;
		let size = stopMax;
		let x = baseX;
		if (baseX <= progressX) {
			size = Math.max(0, stopMax - (progressX - baseX));
			x = progressX;
		}
		return { x: x + size / 2, size };
	})(),
);

// circular wavy：顶点数 = max(5, round(2πr/波长))，星形内半径 0.75 / 外角 0.35 smooth 0.4 / 内角 0.5
const wavyCircWaveLength = $derived(wavelength > 0 ? wavelength : 15);
const wavyCircWaveSpeed = $derived(
	waveSpeed > 0 ? waveSpeed : wavyCircWaveLength,
);
const wavyCircNumVertices = $derived(
	circularWavyVertexCount(resolvedSize, strokeWidth, wavyCircWaveLength),
);
// 官方 offset 动画时长 = (波长/波速)*1000*顶点数
const wavyCircFlowMs = $derived(
	(wavyCircWaveLength / wavyCircWaveSpeed) * 1000 * wavyCircNumVertices,
);

// 官方 determinate 振幅回调：≤0.1 / ≥0.95 为 0（直线/圆），中间为 1（满波/满星）
const officialIndicatorAmplitude = (p: number): number =>
	p <= 0.1 || p >= 0.95 ? 0 : 1;

const wavyAmpTarget = $derived(
	wavy
		? determinate
			? typeof amplitude === "function"
				? amplitude(p)
				: (amplitude ?? officialIndicatorAmplitude(p))
			: typeof amplitude === "number"
				? amplitude
				: 1
		: 0,
);

// 初始振幅（SSR/首帧直接按当前 progress 得到正确形态，避免闪动）
function initialWavyAmp(): number {
	if (!wavy) return 0;
	if (typeof amplitude === "number") return amplitude;
	const hasProgress = typeof progress === "number" && progress >= 0;
	if (typeof amplitude === "function")
		return hasProgress ? amplitude(progress as number) : 1;
	return hasProgress ? officialIndicatorAmplitude(progress as number) : 1;
}
let wavyAmp = $state(initialWavyAmp());
let wavyAmpJob: number | null = null;
let wavyAmpInited = false;

// 振幅动画：官方 Increasing 500ms standard / Decreasing 500ms emphasized-accelerate
$effect(() => {
	const cleanup = (): void => {
		if (wavyAmpJob !== null) cancelAnimationFrame(wavyAmpJob);
		wavyAmpJob = null;
	};
	if (!wavy) return cleanup;
	const target = wavyAmpTarget;
	if (!wavyAmpInited) {
		wavyAmpInited = true;
		untrack(() => {
			wavyAmp = target;
		});
		return cleanup;
	}
	const current = untrack(() => wavyAmp);
	if (Math.abs(target - current) < 0.001) return cleanup;
	cleanup();
	const from = current;
	const easing =
		target > from ? cubicBezier(0.2, 0, 0, 1) : cubicBezier(0.3, 0, 0.8, 0.15);
	const start = performance.now();
	const duration = 500;
	const step = (now: number): void => {
		const t = Math.min((now - start) / duration, 1);
		untrack(() => {
			wavyAmp = from + (target - from) * easing(t);
		});
		if (t < 1) wavyAmpJob = requestAnimationFrame(step);
		else wavyAmpJob = null;
	};
	wavyAmpJob = requestAnimationFrame(step);
	return cleanup;
});

// wavy linear 波浪路径（随振幅更新；determinate 模式向左预留一个波长以消除平移闪烁）
const wavyLinearPathD = $derived(
	buildLinearWavePath(
		wavyLinearPathW,
		wavyLinearWaveLength,
		WAVY_LINEAR_H,
		strokeWidth,
		wavyAmp,
		determinate ? -wavyLinearWaveLength : 0,
	),
);

// wavy circular 星形路径（随振幅 morph）
const wavyStarD = $derived(
	buildCircularStarPath({
		numVertices: wavyCircNumVertices,
		innerRadius: 0.75,
		outerRounding: 0.35,
		outerSmoothing: 0.4,
		innerRounding: 0.5,
		radius: Math.max((resolvedSize - strokeWidth) / 2, 0.5),
		cx: resolvedSize / 2,
		cy: resolvedSize / 2,
		amplitude: wavyAmp,
	}),
);
</script>

	{#if wavy && variant === "linear"}
	    <div
	        bind:clientWidth={measuredWidth}
	        class="m3-progress m3-progress--linear m3-progress--wavy {className}"
	        class:m3-progress--indeterminate={!determinate}
	        class:m3-progress--butt={strokeCap === "butt"}
	        role="progressbar"
	        aria-hidden={ariaHidden}
	        aria-label={label}
	        aria-valuenow={determinate ? pct : undefined}
	        aria-valuemin={determinate ? 0 : undefined}
	        aria-valuemax={determinate ? 100 : undefined}
	        style={`--pi-color: ${color}; --pi-track: ${trackColor}; --pi-wave-dur: ${wavyLinearFlowMs}ms; --pi-wave-shift: ${-wavyLinearWaveLength}px`}
	    >
	        {#if determinate}
	            <svg class="m3-progress__wavy-svg" viewBox={`0 0 ${resolvedWidth} 10`} width="100%" height="10">
	                <defs>
	                    <clipPath id={clipId}>
	                        <rect x="0" y="0" width={wavyLinearHeadPx} height="10" />
	                    </clipPath>
	                </defs>
	                {#if wavyLinearTrackX2 > wavyLinearTrackX1}
	                    <line x1={wavyLinearTrackX1} x2={wavyLinearTrackX2} y1="5" y2="5" stroke={trackColor} stroke-width={strokeWidth} stroke-linecap={strokeCap}></line>
	                {/if}
	                {#if p > 0}
	                    <g class="m3-progress__wavy-group" clip-path={`url(#${clipId})`}>
	                        <path class:m3-progress__wavy-flow={wavyAmp > 0} d={wavyLinearPathD}
	                              fill="none" stroke={color} stroke-width={strokeWidth} stroke-linecap={strokeCap}></path>
	                    </g>
	                {/if}
	            </svg>
	            {#if showStop && wavyStop.size > 0.5}
	                <span class="m3-progress__stop m3-progress__stop--wavy" style={`left: ${wavyStop.x}px; width: ${wavyStop.size}px; height: ${wavyStop.size}px`} aria-hidden="true"></span>
	            {/if}
	            {#if showThumb && determinate}
	                <span
	                    class="m3-progress__thumb"
	                    style={`left: ${wavyLinearHeadPx}px`}
	                    aria-hidden="true"
	                ></span>
	            {/if}
	        {:else}
	            <div class="m3-progress__track"></div>
	            <div class="m3-progress__line m3-progress__line--1 m3-progress__line--wavy">
	                <svg class="m3-progress__wavy-wave" viewBox={`0 0 ${wavyLinearPathW} 10`} width={wavyLinearPathW} height="10">
	                    <g>
	                        <path class="m3-progress__wavy-shift" d={wavyLinearPathD} fill="none" stroke={color} stroke-width={strokeWidth} stroke-linecap={strokeCap}></path>
	                    </g>
	                </svg>
	            </div>
	            <div class="m3-progress__line m3-progress__line--2 m3-progress__line--wavy">
	                <svg class="m3-progress__wavy-wave" viewBox={`0 0 ${wavyLinearPathW} 10`} width={wavyLinearPathW} height="10">
	                    <g>
	                        <path class="m3-progress__wavy-shift" d={wavyLinearPathD} fill="none" stroke={color} stroke-width={strokeWidth} stroke-linecap={strokeCap}></path>
	                    </g>
	                </svg>
	            </div>
	        {/if}
	    </div>
{:else if wavy && variant === "circular"}
    <svg
        class="m3-progress m3-progress--circular m3-progress--wavy m3-progress--circular-wavy {className}"
        class:m3-progress--indeterminate={!determinate}
        style={`--pi-color: ${color}; --pi-track: ${trackColor}; --pi-size: ${resolvedSize}px; --pi-circ-flow-dur: ${wavyCircFlowMs}ms`}
        role="progressbar"
        aria-hidden={ariaHidden}
        aria-label={label}
        aria-valuenow={determinate ? pct : undefined}
        aria-valuemin={determinate ? 0 : undefined}
        aria-valuemax={determinate ? 100 : undefined}
        viewBox={`0 0 ${resolvedSize} ${resolvedSize}`}
    >
        {#if determinate}
            <circle
                class="m3-progress__track-rest"
                cx={circCenter}
                cy={circCenter}
                r={circR}
                fill="none"
                stroke-width={strokeWidth}
                stroke-linecap={strokeCap}
                stroke-dasharray={`${Math.max(CIRC * (1 - p) - gapPx * 2, 0)} ${CIRC}`}
                stroke-dashoffset={`${-(CIRC * p + gapPx)}`}
            ></circle>
            <path
                class="m3-progress__wavy-circ-star"
                class:m3-progress__wavy-circ-flow={wavyAmp > 0}
                d={wavyStarD}
                pathLength="100"
                fill="none"
                stroke={color}
                stroke-width={strokeWidth}
                stroke-linecap={strokeCap}
                stroke-dasharray={`${p * 100} ${100 - p * 100}`}
            ></path>
        {:else}
            <g class="m3-progress__wavy-circ-rotator">
                <circle class="m3-progress__track" cx={circCenter} cy={circCenter} r={circR} fill="none" stroke-width={strokeWidth}></circle>
                <path
                    class="m3-progress__wavy-circ-star m3-progress__wavy-circ-indet"
                    d={wavyStarD}
                    pathLength="100"
                    fill="none"
                    stroke={color}
                    stroke-width={strokeWidth}
                    stroke-linecap={strokeCap}
                ></path>
            </g>
        {/if}
    </svg>
{:else if variant === "linear"}
    <div
        class="m3-progress m3-progress--linear {className}"
        class:m3-progress--indeterminate={!determinate}
        class:m3-progress--butt={strokeCap === "butt"}
        role="progressbar"
        aria-hidden={ariaHidden}
        aria-label={label}
        aria-valuenow={determinate ? pct : undefined}
        aria-valuemin={determinate ? 0 : undefined}
        aria-valuemax={determinate ? 100 : undefined}
        style={`--pi-progress: ${pct}; --pi-gap: ${gapSize}px; --pi-color: ${color}; --pi-track: ${trackColor}`}
    >
        <div class="m3-progress__track">
            {#if determinate}
                <div class="m3-progress__track-fill"></div>
                <div class="m3-progress__active"></div>
                {#if showStop && pct > 0 && pct < 100}
                    <span class="m3-progress__stop" aria-hidden="true"></span>
                {/if}
            {:else if indeterminate === "wave"}
                <div class="m3-progress__line m3-progress__line--wave"></div>
            {:else if indeterminate === "single"}
                <div class="m3-progress__line m3-progress__line--1"></div>
            {:else}
                <div class="m3-progress__line m3-progress__line--1"></div>
                <div class="m3-progress__line m3-progress__line--2"></div>
            {/if}
        </div>
    </div>
{:else}
    <svg
        class="m3-progress m3-progress--circular m3-progress--circular-{indeterminate} {className}"
        class:m3-progress--indeterminate={!determinate}
        style={`--pi-color: ${color}; --pi-track: ${trackColor}; --pi-circ: ${CIRC}px; --pi-size: ${resolvedSize}px`}
        role="progressbar"
        aria-hidden={ariaHidden}
        aria-label={label}
        aria-valuenow={determinate ? pct : undefined}
        aria-valuemin={determinate ? 0 : undefined}
        aria-valuemax={determinate ? 100 : undefined}
        viewBox={`0 0 ${resolvedSize} ${resolvedSize}`}
    >
        {#if determinate}
            <!-- circle + dasharray/dashoffset（可 CSS transition 平滑转动）：
                 active 完整 0→progress（rotate -90 到 12 点起）；
                 track 从 active 末端 + gap 开始，dashoffset 负值（SVG 正值向后移）。
                 绘制顺序：先 track 后 active（官方 active 在顶层），避免 track 圆头
                 round cap 盖到 active 颜色弧上形成圆点 -->
            <circle
                class="m3-progress__track-rest"
                cx={circCenter}
                cy={circCenter}
                r={circR}
                fill="none"
                stroke-width={strokeWidth}
                stroke-linecap="round"
                stroke-dasharray={`${Math.max(CIRC * (1 - p) - gapPx * 2, 0)} ${CIRC}`}
                stroke-dashoffset={`${-(CIRC * p + gapPx)}`}
            ></circle>
            <circle
                class="m3-progress__active"
                cx={circCenter}
                cy={circCenter}
                r={circR}
                fill="none"
                stroke-width={strokeWidth}
                stroke-linecap="round"
                stroke-dasharray={`${CIRC * p} ${CIRC}`}
                stroke-dashoffset="0"
            ></circle>
        {:else}
            <circle class="m3-progress__track" cx={circCenter} cy={circCenter} r={circR} fill="none" stroke-width={strokeWidth}></circle>
            <circle
                class="m3-progress__active"
                cx={circCenter}
                cy={circCenter}
                r={circR}
                fill="none"
                stroke-width={strokeWidth}
                stroke-linecap="round"
            ></circle>
        {/if}
    </svg>
{/if}

<style lang="stylus">
/* head/tail 插值变量（官方 FirstLine/SecondLine 关键帧时序，总循环 1750ms）：
   Line1 head 0→1000ms(57.14%)、tail 250→1250ms(14.29%→71.43%)
   Line2 head 650→1500ms(37.14%→85.71%)、tail 900→1750ms(51.43%→100%) */
@property --pi-h1 { syntax: "<number>"; inherits: true; initial-value: 0; }
@property --pi-t1 { syntax: "<number>"; inherits: true; initial-value: 0; }
@property --pi-h2 { syntax: "<number>"; inherits: true; initial-value: 0; }
@property --pi-t2 { syntax: "<number>"; inherits: true; initial-value: 0; }
/* circular 弧长 sweep 比例（0.1↔0.87，相对周长 --pi-circ，随 size 自适应） */
@property --pi-sweep { syntax: "<number>"; inherits: false; initial-value: 0.1; }

.m3-progress
    /* === linear：4dp 高轨道（官方 LinearProgressIndicatorTokens.Height/ActiveThickness） === */
    &--linear
        width: 100%
        height: 4px

        .m3-progress__track
            position: relative
            width: 100%
            height: 100%
            border-radius: var(--shape-corner-full)
            /* 无 overflow 裁剪：head/tail 线始终在 [0,100%] 内无需横向裁剪，
               wave 波浪可上下溢出轨道（官方视觉） */

        /* determinate track：从 progress + gap 开始（左侧 active + gap 空白区域，
           官方 gapSize 参数：active 与 track 之间的间隙） */
        .m3-progress__track-fill
            position: absolute
            top: 0
            bottom: 0
            right: 0
            left: calc(var(--pi-progress) * 1% + var(--pi-gap))
            border-radius: var(--shape-corner-full)
            background: var(--pi-track)

        .m3-progress__active
            position: absolute
            top: 0
            bottom: 0
            left: 0
            width: calc(var(--pi-progress) * 1%)
            border-radius: var(--shape-corner-full)
            background: var(--pi-color)
            transition: width var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

        /* stop 圆点：active 填充末端 4dp（官方 StopSize），随进度移动 */
        .m3-progress__stop
            position: absolute
            top: 50%
            transform: translate(-50%, -50%)
            width: 4px
            height: 4px
            border-radius: var(--shape-corner-full)
            background: var(--pi-color)
            left: calc(var(--pi-progress) * 1% + var(--pi-gap) / 2)
            transition: left var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

        /* butt 平头（官方 StrokeCap.Butt） */
        &.m3-progress--butt
            .m3-progress__track,
            .m3-progress__track-fill,
            .m3-progress__active
                border-radius: 0

        /* indeterminate：track 全宽背景（颜色走 trackColor 参数） */
        &.m3-progress--indeterminate .m3-progress__track
            background: var(--pi-track)

        /* === indeterminate：官方 head/tail 精确动画（线生长/消失，无跳变） === */
        &.m3-progress--indeterminate .m3-progress__line
            position: absolute
            top: 0
            height: 100%
            border-radius: var(--shape-corner-full)
            background: var(--pi-color)

        /* Line 1（single 也用它）：线区间 [tail, head]（官方 head 为终点、tail 为起点，
           条件 head - tail > 0 才画）；左右各留 2px gap（官方 TrackActiveSpace 4dp，
           线不贴轨道边缘避免窄线圆角在端点闪烁） */
        &.m3-progress--indeterminate .m3-progress__line--1
            left: calc(var(--pi-t1) * 100% + 2px)
            width: calc((var(--pi-h1) - var(--pi-t1)) * 100% - 4px)
            animation: pi-h1 1750ms linear infinite, pi-t1 1750ms linear infinite

        /* Line 2 */
        &.m3-progress--indeterminate .m3-progress__line--2
            left: calc(var(--pi-t2) * 100% + 2px)
            width: calc((var(--pi-h2) - var(--pi-t2)) * 100% - 4px)
            animation: pi-h2 1750ms linear infinite, pi-t2 1750ms linear infinite

        /* wave：官方 ActiveWave（振幅 3dp / 波长 40dp）——mask 波浪带平铺，
           波浪带在 viewBox 内留白 1px（波峰波谷完整圆滑、不被切断），
           上下各超出 4dp 轨道 2px；background primary 主题色；
           波浪图案 mask-position 横向流动（官方动态效果） */
        &.m3-progress--indeterminate .m3-progress__line--wave
            background: none
            background-color: var(--pi-color)
            left: calc(var(--pi-t1) * 100% + 2px)
            width: calc((var(--pi-h1) - var(--pi-t1)) * 100% - 4px)
            animation:
                pi-h1 1750ms linear infinite,
                pi-t1 1750ms linear infinite,
                m3-progress-wave-flow 900ms linear infinite
            height: 8px
            top: 50%
            transform: translateY(-50%)
            -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='8'%3E%3Cpath d='M0 1 Q 10 7, 20 1 T 40 1 L 40 7 Q 30 1, 20 7 T 0 7 Z' fill='black'/%3E%3C/svg%3E")
            mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='8'%3E%3Cpath d='M0 1 Q 10 7, 20 1 T 40 1 L 40 7 Q 30 1, 20 7 T 0 7 Z' fill='black'/%3E%3C/svg%3E")
            -webkit-mask-repeat: repeat-x
            mask-repeat: repeat-x
            -webkit-mask-size: 40px 8px
            mask-size: 40px 8px

        /* dot 变体已移除（不再需要圆点流） */

        /* === circular：直径/厚度可调（size/strokeWidth 参数，viewBox 动态生成） === */
    &--circular
        width: var(--pi-size)
        height: var(--pi-size)
        /* circle dash 从 3 点起，rotate -90 到 12 点（determinate 弧起点同） */
        transform: rotate(-90deg)

        .m3-progress__track
            stroke: var(--pi-track)

        .m3-progress__active
            stroke: var(--pi-color)
            transition: stroke-dasharray var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

        /* indeterminate 弧长 = 周长 × sweep 比例（size 变化自动适配）；
           仅 indeterminate 生效，避免覆盖 determinate 的内联 dasharray */
        &.m3-progress--indeterminate .m3-progress__active
            stroke-dasharray: calc(var(--pi-circ) * var(--pi-sweep)) var(--pi-circ)

        /* determinate：剩余 track 环（active 末端 + gap 开始，官方无 stop 圆点） */
        .m3-progress__track-rest
            stroke: var(--pi-track)
            transition: stroke-dasharray var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate), stroke-dashoffset var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

        /* butt 平头（官方 StrokeCap.Butt） */
        &.m3-progress--butt
            .m3-progress__active,
            .m3-progress__track-rest
                stroke-linecap: butt

        /* === indeterminate 变体（官方三层动画：弧长伸缩 + 全局旋转 + 步进） === */
        &.m3-progress--indeterminate.m3-progress--circular-dual
            /* 官方：弧长 0.1↔0.87 伸缩 + 360° 旋转，6000ms（globalRotation + progress） */
            animation: m3-progress-circular-rotate 6000ms linear infinite
            .m3-progress__active
                animation: m3-progress-circular-dual-sweep 6000ms linear infinite

        &.m3-progress--indeterminate.m3-progress--circular-single
            /* 固定弧长（0.25 周长）+ 快速旋转（经典） */
            animation: m3-progress-circular-rotate 1200ms linear infinite
            .m3-progress__active
                stroke-dasharray: calc(var(--pi-circ) * 0.25) var(--pi-circ)

        &.m3-progress--indeterminate.m3-progress--circular-wave
            /* 官方带弧度旋转：全局 3 圈匀速 + 每 1.5s 快转 90°（300ms 强调减速）停 1.2s */
            animation: m3-progress-circular-wave-rotate 6000ms linear infinite
            .m3-progress__active
                /* 官方弧长伸缩 0.1↔0.87（6000ms，上行 standard / 回落 linear） */
                animation: m3-progress-circular-wave-sweep 6000ms linear infinite

    /* === wavy（官方 WavyProgressIndicator：Expressive 波浪形态） === */
    &.m3-progress--wavy.m3-progress--linear
        position: relative
        width: 100%
        height: 10px
        overflow: visible
        /* 官方 LinearContainerWidth 默认 240 / WaveHeight 10，容器自适应 */

        .m3-progress__wavy-svg
            position: absolute
            inset: 0
            width: 100%
            height: 10px
            overflow: visible

        .m3-progress__wavy-track
            position: absolute
            inset: 0
            width: 100%
            height: 10px

        .m3-progress__wavy-active
            position: absolute
            top: 0
            left: 0
            height: 10px
            overflow: hidden

        .m3-progress__wavy-wave
            position: absolute
            top: 0
            left: 0
            max-width: none
            display: block

        .m3-progress__thumb
            position: absolute
            top: 50%
            z-index: 1
            width: 10px
            height: 10px
            border-radius: var(--shape-corner-full)
            background: var(--pi-color)
            box-shadow: 0 0 0 2px var(--surface-container-lowest)
            transform: translate(-50%, -50%)
            pointer-events: none
            transition: left var(--m3e-duration-short) var(--m3e-easing-standard)

        /* determinate 波流动画：单一路水平平移，周期无缝衔接，由 clipPath 物理限定可视宽度 */
        .m3-progress__wavy-flow
            animation: m3-progress-wavy-shift var(--pi-wave-dur) linear infinite

        /* indeterminate 波流动画：路径左移一个波长（--pi-wave-shift 负 px） */
        .m3-progress__wavy-shift
            animation: m3-progress-wavy-shift var(--pi-wave-dur) linear infinite

        /* indeterminate 双线复用 pi-h1/pi-t1 时序；内部 SVG 波浪被行容器裁剪 */
        &.m3-progress--indeterminate .m3-progress__line--wavy
            background: none
            border-radius: 0
            overflow: hidden

        &.m3-progress--indeterminate .m3-progress__line--1.m3-progress__line--wavy .m3-progress__wavy-wave
            left: calc(-1 * var(--pi-t1) * 240px - 2px)

        &.m3-progress--indeterminate .m3-progress__line--2.m3-progress__line--wavy .m3-progress__wavy-wave
            left: calc(-1 * var(--pi-t2) * 240px - 2px)

        .m3-progress__stop--wavy
            top: 50%
            transform: translate(-50%, -50%)

    &.m3-progress--wavy.m3-progress--circular
        /* 官方 circular wavy：determinate 起点 3 点钟（不加基准旋转）；
           indeterminate 起点 12 点钟（rotator 内 +90° 基准） */
        transform: none

        .m3-progress__wavy-circ-rotator
            transform-box: view-box
            transform-origin: center
            /* 官方 composite：基准 90° + 全局 1080° 匀速 + 附加步进 360°（6000ms） */
            animation: m3-progress-circular-wavy-rotate 6000ms linear infinite

        .m3-progress__wavy-circ-flow
            /* determinate 波流动画：dashoffset 平移一个波长 + 同步反向旋转一圈，
               官方取样 [shift, head+shift] 后 rotate(-shift) —— 弧端固定、齿形在弧内流动 */
            animation:
                m3-progress-circ-wave-dash var(--pi-circ-flow-dur) linear infinite,
                m3-progress-circ-wave-counterrotate var(--pi-circ-flow-dur) linear infinite
            transform-box: view-box
            transform-origin: center

        .m3-progress__wavy-circ-indet
            /* indeterminate：弧长伸缩 + 波流动画 + 同步反向旋转
               （弧端固定于轨道、齿形流动，整体随 rotator 刚性旋转，官方行为） */
            animation:
                m3-progress-circular-wavy-sweep 6000ms linear infinite,
                m3-progress-circ-wave-dash var(--pi-circ-flow-dur) linear infinite,
                m3-progress-circ-wave-counterrotate var(--pi-circ-flow-dur) linear infinite
            transform-box: view-box
            transform-origin: center
/* 官方 Line1/Line2 head/tail 关键帧（1750ms 总循环） */
@keyframes pi-h1
    0%
        --pi-h1: 0
    57.14%
        --pi-h1: 1
    100%
        --pi-h1: 1

@keyframes pi-t1
    0%, 14.29%
        --pi-t1: 0
    71.43%
        --pi-t1: 1
    100%
        --pi-t1: 1

@keyframes pi-h2
    0%, 37.14%
        --pi-h2: 0
    85.71%
        --pi-h2: 1
    100%
        --pi-h2: 1

@keyframes pi-t2
    0%, 51.43%
        --pi-t2: 0
    100%
        --pi-t2: 1

/* 波浪横向流动（一个波长 40px 的 mask 滚动） */
@keyframes m3-progress-wave-flow
    from
        -webkit-mask-position: 0 0
        mask-position: 0 0
    to
        -webkit-mask-position: 40px 0
        mask-position: 40px 0

/* circular indeterminate：整体旋转（弧长动画由 dasharray 变体控制） */
@keyframes m3-progress-circular-rotate
    from
        transform: rotate(-90deg)
    to
        transform: rotate(270deg)

/* 官方弧长伸缩：sweep 0.1 ↔ 0.87（6000ms） */
@keyframes m3-progress-circular-dual-sweep
    0%, 100%
        --pi-sweep: 0.1
    50%
        --pi-sweep: 0.87

/* 官方弧长伸缩（sweep 0.1 ↔ 0.87，6000ms）：上行 standard easing、回落线性 */
@keyframes m3-progress-circular-wave-sweep
    0%
        --pi-sweep: 0.1
        animation-timing-function: cubic-bezier(0.2, 0, 0, 1)
    50%
        --pi-sweep: 0.87
        animation-timing-function: linear
    100%
        --pi-sweep: 0.1

/* 官方带弧度旋转（6000ms 周期）：合成角度 = -90°（12 点基准）+ 全局 1080° 匀速
   + 附加步进 360°（每 1.5s：300ms 强调减速转 90°，随后停 1.2s，共 4 步）。
   各段 easing：步进段 cubic-bezier(0.05, 0.7, 0.1, 1)（官方 EasingEmphasizedDecelerate），
   停顿段 linear（随全局匀速） */
@keyframes m3-progress-circular-wave-rotate
    0%
        transform: rotate(-90deg)
        animation-timing-function: cubic-bezier(0.05, 0.7, 0.1, 1)
    5%
        transform: rotate(54deg)
        animation-timing-function: linear
    25%
        transform: rotate(270deg)
        animation-timing-function: cubic-bezier(0.05, 0.7, 0.1, 1)
    30%
        transform: rotate(414deg)
        animation-timing-function: linear
    50%
        transform: rotate(630deg)
        animation-timing-function: cubic-bezier(0.05, 0.7, 0.1, 1)
    55%
        transform: rotate(774deg)
        animation-timing-function: linear
    75%
        transform: rotate(990deg)
        animation-timing-function: cubic-bezier(0.05, 0.7, 0.1, 1)
    80%
        transform: rotate(1134deg)
        animation-timing-function: linear
    100%
        transform: rotate(1350deg)
/* linear wavy indeterminate 波流动画：路径左移一个波长（--pi-wave-shift 负 px） */
@keyframes m3-progress-wavy-shift
    from
        transform: translateX(0)
    to
        transform: translateX(var(--pi-wave-shift))

/* circular wavy indeterminate 合成旋转（6000ms 周期）：基准 90°（12 点）+ 全局 1080° 匀速
   + 附加步进 360°（每 1.5s：300ms 强调减速转 90°，随后停 1.2s，共 4 步）。
   各段 easing：步进段 cubic-bezier(0.05, 0.7, 0.1, 1)（官方 EasingEmphasizedDecelerate），
   停顿段 linear（随全局匀速） */
@keyframes m3-progress-circular-wavy-rotate
    0%
        transform: rotate(90deg)
        animation-timing-function: cubic-bezier(0.05, 0.7, 0.1, 1)
    5%
        transform: rotate(234deg)
        animation-timing-function: linear
    25%
        transform: rotate(450deg)
        animation-timing-function: cubic-bezier(0.05, 0.7, 0.1, 1)
    30%
        transform: rotate(594deg)
        animation-timing-function: linear
    50%
        transform: rotate(810deg)
        animation-timing-function: cubic-bezier(0.05, 0.7, 0.1, 1)
    55%
        transform: rotate(954deg)
        animation-timing-function: linear
    75%
        transform: rotate(1170deg)
        animation-timing-function: cubic-bezier(0.05, 0.7, 0.1, 1)
    80%
        transform: rotate(1314deg)
        animation-timing-function: linear
    100%
        transform: rotate(1530deg)

/* circular wavy 弧长伸缩（normalized 100 单位）：sweep 0.1 ↔ 0.87（6000ms，
   上行 standard cubic-bezier(0.2,0,0,1)、回落 linear） */
@keyframes m3-progress-circular-wavy-sweep
    0%
        stroke-dasharray: 10 90
        animation-timing-function: cubic-bezier(0.2, 0, 0, 1)
    50%
        stroke-dasharray: 87 13
        animation-timing-function: linear
    100%
        stroke-dasharray: 10 90

/* circular wavy 波流动画：dashoffset 平移一个波长（弧沿路径滑动，齿形周期无缝回绕） */
@keyframes m3-progress-circ-wave-dash
    from
        stroke-dashoffset: 0
    to
        stroke-dashoffset: -100

/* circular wavy 波流动画同步反向旋转：dashoffset 前移一圈使弧窗口绕圆滑动，
   这里反向旋转一圈将其抵消 —— 弧端固定、星形齿在弧内流动（官方 rotate(-shift)） */
@keyframes m3-progress-circ-wave-counterrotate
    from
        transform: rotate(0deg)
    to
        transform: rotate(-360deg)
</style>
