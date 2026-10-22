export type CommentProvider = "none" | "twikoo" | "giscus" | "waline";

export interface TwikooConfig {
	/** Twikoo 环境 ID 或后端服务地址 URL */
	envId: string;
	/** Twikoo 客户端 JS 脚本 CDN 地址 */
	scriptUrl: string;
	/** 评论语言，"auto" 自动跟随站点语言，也可指定如 "zh-CN", "en" 等 */
	lang: "auto" | string;
	/** 评论输入框的灰色说明文字；留空时不显示 */
	placeholder?: string;
}

export interface CommentConfig {
	/** 是否全局启用评论功能 */
	enable: boolean;
	/** 选用的评论提供商 */
	provider: CommentProvider;
	/** 是否开启视口懒加载（进入视口前不加载外部脚本） */
	lazy: boolean;
	/** Twikoo 专属配置 */
	twikoo: TwikooConfig;
	/** Giscus 专属配置 */
	giscus: GiscusConfig;
	/** Waline 专属配置；旧配置可省略，未填写时 Waline 不渲染 */
	waline?: WalineConfig;
}

export interface GiscusConfig {
	/** 公开 GitHub 仓库，格式 "owner/repo"（必填，giscus 会在该仓库的 Discussions 中存储评论） */
	repo: string;
	/** 仓库 ID，从 giscus.app 配置生成器获取（必填） */
	repoId: string;
	/** Discussion 分类名，如 "Announcements"（推荐使用 Announcements 类，仅维护者可开新讨论）；留空表示不限制分类 */
	category: string;
	/** Discussion 分类 ID，从 giscus.app 配置生成器获取（必填） */
	categoryId: string;
	/** 页面 ↔ Discussion 映射方式，默认 "pathname" */
	mapping: "pathname" | "url" | "title" | "og:title" | "specific" | "number";
	/** 是否开启严格标题匹配（SHA-1 哈希校验，避免模糊搜索误配），默认 false */
	strict: boolean;
	/** 是否显示主贴表情反应，默认 true */
	reactionsEnabled: boolean;
	/** 是否向父页面周期性发送 Discussion 元数据，默认 false */
	emitMetadata: boolean;
	/** 评论输入框位置，默认 "bottom" */
	inputPosition: "top" | "bottom";
	/** 明暗两套 giscus 主题（giscus 主题键如 "light"/"dark"，或自定义主题 CSS 的 URL） */
	theme: { light: string; dark: string };
	/** 评论语言："auto"（跟随站点语言）或 giscus 语言码（如 "zh-CN"、"en"），默认 "auto" */
	lang: "auto" | string;
	/** giscus client.js 地址；使用自托管 giscus 时替换为自有地址 */
	scriptUrl: string;
}

/** Waline 文案覆盖；未提供的字段沿用 lang 对应语言的默认值。 */
export interface WalineLocaleConfig {
	/** 评论输入框提示；空字符串不显示提示 */
	placeholder?: string;
	/** 其他 Waline 文案，如 submit、level0、reactionTitle */
	[key: string]: string | undefined;
}

/** Waline 3.x 支持 HTTP(S) 或协议相对地址的表情预设。 */
export type WalineEmojiPresets =
	| `http://${string}`
	| `https://${string}`
	| `//${string}`;

/** 自定义表情选项卡，与 WalineEmojiPresets 可在 emoji 数组中混用。 */
export interface WalineEmojiInfo {
	/** 选项卡名称 */
	name: string;
	/** 表情图片所在文件夹地址 */
	folder?: string;
	/** 表情图片文件名的通用前缀 */
	prefix?: string;
	/** 表情图片扩展名 */
	type?: string;
	/** 选项卡图标 */
	icon: string;
	/** 表情图片列表 */
	items: string[];
}

export interface WalineConfig {
	/** Waline 服务端 HTTP(S) 地址（必填），如 https://comments.example.com */
	serverURL: string;
	/** 包含依赖的 UMD 客户端地址 */
	scriptUrl: string;
	/** Waline CSS 地址，随评论区进入视口加载；须与 scriptUrl 使用相同版本 */
	styleUrl: string;
	/** auto 跟随文章/站点语言；不支持的站点语言回退 en */
	lang: "auto" | string;
	/** 自定义语言文案；输入框提示使用 locale.placeholder，省略时沿用当前语言默认值 */
	locale?: WalineLocaleConfig;
	/** 表情预设地址与自定义配置的混合数组；false 关闭，true 使用 Waline 默认表情包 */
	emoji?: (WalineEmojiInfo | WalineEmojiPresets)[] | boolean;
	/** 评论排序，默认 latest */
	commentSorting?: "latest" | "oldest" | "hottest";
	/** 评论者信息字段，默认 nick、mail、link */
	meta?: ("nick" | "mail" | "link")[];
	/** 必填信息字段，默认空数组（允许匿名） */
	requiredMeta?: ("nick" | "mail" | "link")[];
	/** 登录模式：enable（默认）/ disable / force */
	login?: "enable" | "disable" | "force";
	/** 评论字数限制，设置为 0 时无限制 */
	wordLimit?: number | [number, number];
	/** 每页评论条数，默认 10 */
	pageSize?: number;
	/** 图片上传：true（默认）由 Waline 将图片编码为 Base64，false 关闭；选项以 JSON 写入页面，无法携带函数，因此不支持自定义上传函数 */
	imageUploader?: boolean;
	/** 代码高亮：true（默认）使用 Waline 内置的 <1kB 高亮器，false 关闭；同样不支持自定义函数 */
	highlighter?: boolean;
	/** TeX：true 在预览中提示不支持 TeX，false 不解析 TeX；同样不支持自定义渲染函数 */
	texRenderer?: boolean;
	/** 是否隐藏页脚版权信息 */
	noCopyright?: boolean;
	/** 是否隐藏 RSS 订阅链接 */
	noRss?: boolean;
	/** reCAPTCHA v3 密钥 */
	recaptchaV3Key?: string;
	/** Cloudflare Turnstile 密钥 */
	turnstileKey?: string;
	/** 文章表情反应；默认 false，也可提供表情图片 URL 数组 */
	reaction?: boolean | string[];
}

/** 传递给具体 Provider 组件的归一化上下文 */
export interface CommentContext {
	/** 页面唯一稳定标识（如 post:my-first-post） */
	key: string;
	/** 评论挂钩的 canonical 路径（如 /posts/my-first-post/） */
	path: string;
	/** 文章标题 */
	title: string;
	/** 当前页面语言代码 */
	language: string;
}
