import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	rainyDayConfig,
	resolveRainyDayOptions,
} from "../src/config/rainyDayConfig.ts";

describe("Rainy day window config", () => {
	it("未配置 / undefined 时跟随主题默认值（本仓库默认开启）", () => {
		// 主题默认值在 rainyDayConfig 里显式声明（当前为 true）：显式 false 才关闭
		assert.equal(rainyDayConfig.enable, true);
		const options = resolveRainyDayOptions(undefined);
		assert.equal(options.enable, rainyDayConfig.enable ?? true);
		assert.equal(resolveRainyDayOptions(undefined).enable, true);
		assert.equal(resolveRainyDayOptions(false).enable, false);
	});

	it("false 时关闭，并返回零开销默认值", () => {
		const options = resolveRainyDayOptions(false);
		assert.equal(options.enable, false);
		assert.equal(options.defaultEnabled, false);
		// 关闭态不做任何渲染，这些值只是占位，不能是 undefined
		assert.equal(typeof options.intensity, "number");
		assert.equal(typeof options.fps, "number");
	});

	it("true 时用主题默认值启用", () => {
		const options = resolveRainyDayOptions(true);
		assert.equal(options.enable, true);
		assert.equal(options.defaultEnabled, true);
		assert.equal(options.intensity, 0.2);
		assert.equal(options.fps, 30);
		assert.equal(options.mobile, false);
		assert.equal(options.lazy, true);
	});

	it("对象缺省字段时取默认值，enable 缺省即启用", () => {
		const options = resolveRainyDayOptions({ intensity: 0.5 });
		assert.equal(options.enable, true);
		assert.equal(options.intensity, 0.5);
		assert.equal(options.speed, 1);
		assert.equal(options.postProcessing, true);
	});

	it("enable: false 明确关闭", () => {
		assert.equal(resolveRainyDayOptions({ enable: false }).enable, false);
	});

	it("越界数值被裁剪进合法区间，整数字段取整", () => {
		const options = resolveRainyDayOptions({
			intensity: 5,
			speed: -3,
			brightness: 2,
			normal: 99,
			zoom: 0,
			blurIntensity: 42,
			blurIterations: 0,
			fps: 1000,
			mistStrength: 5,
			bgFadeMs: -100,
			idleDelayMs: 999999,
			fadeInMs: -1,
		});
		assert.equal(options.intensity, 1);
		assert.equal(options.speed, 0);
		assert.equal(options.brightness, 1);
		assert.equal(options.normal, 3);
		assert.equal(options.zoom, 0.1);
		assert.equal(options.blurIntensity, 10);
		assert.equal(options.blurIterations, 1);
		assert.equal(options.fps, 120);
		assert.equal(options.mistStrength, 1);
		assert.equal(options.bgFadeMs, 0);
		assert.equal(options.idleDelayMs, 10000);
		assert.equal(options.fadeInMs, 0);
	});

	it("雨雾浓度缺省为 0.4、过渡长度缺省为 12vh，越界被裁剪", () => {
		assert.equal(resolveRainyDayOptions({}).mistStrength, 0.4);
		assert.equal(resolveRainyDayOptions({ mistStrength: -2 }).mistStrength, 0);
		assert.equal(resolveRainyDayOptions({}).mistFadeVh, 12);
		assert.equal(resolveRainyDayOptions({ mistFadeVh: 999 }).mistFadeVh, 100);
		assert.equal(resolveRainyDayOptions({ mistFadeVh: -5 }).mistFadeVh, 0);
	});

	it("非数值 / 非布尔值回退到默认值", () => {
		const options = resolveRainyDayOptions({
			intensity: "很密",
			lightning: "yes",
		});
		assert.equal(options.intensity, 0.2);
		assert.equal(options.lightning, false);
	});
});
