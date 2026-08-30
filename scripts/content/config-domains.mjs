/**
 * 配置覆盖层的领域登记表：内容仓 `config/<file>.yaml` -> 主题配置领域 -> 该领域的 TS 类型。
 *
 * 校验不写第二套 schema，而是把用户 YAML 生成成带类型标注的 TS 再交给 `tsc`：
 * `src/types/*Config.ts` 已经是配置契约的唯一真源，另立 Zod/JSON Schema 只会漂移。
 * 生成物的类型标注让「拼错的键」「越界的枚举」「填错的类型」全部变成带
 * 「Did you mean ...?」提示的编译错误。
 *
 * 新增一个可外置的配置领域：在下表补一行即可，无需改动生成器。
 */

/** 内容仓中存放配置覆盖的目录名。 */
export const CONFIG_DIRECTORY = "config";

/** 页脚自定义 HTML：内容仓路径 -> 代码仓路径（原样拷贝，不参与 YAML 合并）。 */
export const FOOTER_HTML_SOURCE = "footer.html";
export const FOOTER_HTML_TARGET = "src/config/FooterConfig.html";

/** 生成物落点。放在 src/user/ 而非 src/generated/，否则图标收集会跳过它。 */
export const GENERATED_CONFIG_FILE = "src/user/user-config.ts";

/**
 * @typedef {object} ConfigDomain
 * @property {string} key      `withUserConfig(key, ...)` 使用的领域名
 * @property {string} file     内容仓 `config/` 下的文件基名（kebab-case）
 * @property {string} type     该领域的 TS 类型名
 * @property {string} module   类型所在模块
 * @property {boolean} [partial] 是否允许部分覆盖（默认 true；navBar 用整体替换的专用类型）
 */

/** @type {readonly ConfigDomain[]} */
export const CONFIG_DOMAINS = Object.freeze([
	{ key: "site", file: "site", type: "SiteConfig", module: "@/types/config" },
	{
		key: "profile",
		file: "profile",
		type: "ProfileConfig",
		module: "@/types/config",
	},
	{
		key: "license",
		file: "license",
		type: "LicenseConfig",
		module: "@/types/config",
	},
	{
		key: "expressiveCode",
		file: "expressive-code",
		type: "ExpressiveCodeConfig",
		module: "@/types/config",
	},
	{
		key: "announcement",
		file: "announcement",
		type: "AnnouncementConfig",
		module: "@/types/announcementConfig",
	},
	{
		key: "postList",
		file: "post-list",
		type: "PostListConfig",
		module: "@/types/postListConfig",
	},
	{
		key: "article",
		file: "article",
		type: "ArticleConfig",
		module: "@/types/articleConfig",
	},
	{
		key: "comment",
		file: "comment",
		type: "CommentConfig",
		module: "@/types/commentConfig",
	},
	{
		key: "contextMenu",
		file: "context-menu",
		type: "ContextMenuConfig",
		module: "@/types/contextMenuConfig",
	},
	{ key: "fab", file: "fab", type: "FabConfig", module: "@/types/fabConfig" },
	{
		key: "sidebar",
		file: "sidebar",
		type: "SidebarConfig",
		module: "@/types/sidebarConfig",
	},
	{
		key: "footer",
		file: "footer",
		type: "FooterConfig",
		module: "@/types/footerConfig",
	},
	{
		key: "imageBloom",
		file: "image-bloom",
		type: "ImageBloomConfig",
		module: "@/types/imageBloomConfig",
	},
	{
		key: "skills",
		file: "skills",
		type: "SkillsConfig",
		module: "@/types/skillsConfig",
	},
	{
		key: "projects",
		file: "projects",
		type: "ProjectsConfig",
		module: "@/types/projectsConfig",
	},
	{
		key: "timeline",
		file: "timeline",
		type: "TimelineConfig",
		module: "@/types/timelineConfig",
	},
	{
		key: "devices",
		file: "devices",
		type: "DevicesConfig",
		module: "@/types/devicesConfig",
	},
	{
		key: "music",
		file: "music",
		type: "MusicConfig",
		module: "@/types/musicConfig",
	},
	{
		key: "anime",
		file: "anime",
		type: "AnimeConfig",
		module: "@/types/animeConfig",
	},
	{
		key: "font",
		file: "font",
		type: "FontConfig",
		module: "@/types/fontConfig",
	},
	{
		key: "llms",
		file: "llms",
		type: "LlmsConfig",
		module: "@/types/llmsConfig",
	},
	{
		key: "umami",
		file: "umami",
		type: "UmamiConfig",
		module: "@/types/umamiConfig",
	},
	{
		// 导航项要引用 LinkPresets 并调用 i18n()，无法用「默认值 ⊕ 覆盖」表达，
		// 因此走整体替换的中间形态，由 resolveNavBarLinks() 在代码仓侧还原。
		key: "navBar",
		file: "nav-bar",
		type: "NavBarConfigOverride",
		module: "@/types/navBarConfig",
		partial: false,
	},
]);

/** 文件基名 -> 领域。 */
export const DOMAIN_BY_FILE = Object.freeze(
	Object.fromEntries(CONFIG_DOMAINS.map((domain) => [domain.file, domain])),
);
