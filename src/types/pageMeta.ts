/**
 * 页面共有的「身份」配置：每个信息页的配置域都继承它。
 */
export interface PageMeta {
	/** 页面总开关；false 时导航隐藏、访问重定向 404（与现有四个页面的语义一致） */
	enable?: boolean;
	/** 页面标题：字面量（个人化、语言无关），或 "$t:<i18nKey>"（本地化；默认即当前词条） */
	title?: string;
	/** 页面副标题：同上 */
	description?: string;
}
