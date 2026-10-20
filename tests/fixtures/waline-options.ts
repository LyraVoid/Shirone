import type {
	WalineConfig,
	WalineEmojiInfo,
	WalineEmojiPresets,
} from "../../src/types/commentConfig.ts";

export const customWalineOptions = {
	locale: {
		placeholder: 'A "</script>" draft',
		submit: "Post comment",
		level0: "Reader",
	},
	emoji: [
		"https://emojis.example.com/preset",
		"//emojis.example.com/legacy",
		{
			name: "Custom",
			folder: "https://emojis.example.com/custom/",
			prefix: "icon-",
			type: "svg",
			icon: "smile",
			items: ["smile", "wave"],
		},
	],
} satisfies Pick<WalineConfig, "locale" | "emoji">;

export const disabledEmoji: WalineConfig["emoji"] = false;
export const defaultEmoji: WalineConfig["emoji"] = true;

export const toggles = {
	imageUploader: false,
	highlighter: true,
	texRenderer: false,
} satisfies Pick<WalineConfig, "imageUploader" | "highlighter" | "texRenderer">;

// Options reach the browser as JSON, which cannot carry callbacks.
export const callbacks: Partial<WalineConfig> = {
	// @ts-expect-error A custom uploader would be dropped on the way to the browser.
	imageUploader: async () => "https://images.example.com/upload.png",
	// @ts-expect-error A custom highlighter would be dropped on the way to the browser.
	highlighter: (code: string) => code,
	// @ts-expect-error A custom TeX renderer would be dropped on the way to the browser.
	texRenderer: (_blockMode: boolean, tex: string) => tex,
};

export const obsoleteOptions: Partial<WalineConfig> = {
	// @ts-expect-error Input hints belong to locale.placeholder.
	placeholder: "Obsolete top-level option",
};

// @ts-expect-error A custom pack requires an items list.
export const incompletePack: WalineEmojiInfo = {
	name: "Missing",
	icon: "smile",
};

// @ts-expect-error Presets require HTTP(S) or protocol-relative URLs.
export const invalidPreset: WalineEmojiPresets =
	"ftp://emojis.example.com/pack";
