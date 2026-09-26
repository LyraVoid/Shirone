/**
 * 个人设备展示页数据源
 * 行为与分类规则由 config/devices.yaml 控制
 */

export type DeviceStatus = "active" | "backup" | "archived" | "wishlist";

export interface DeviceSpecItem {
	key: string;
	label: string;
	value: string;
}

export interface DeviceItem {
	enable?: boolean;
	id: string;
	name: string;
	brand: string;
	category: string;
	status: DeviceStatus;
	specs: string;
	specDetails?: DeviceSpecItem[];
	description: string;
	image?: string;
	icon?: string;
	link?: string;
	featured?: boolean;
	year?: string;
}

export const devicesData: DeviceItem[] = [
	{
		id: "matebook",
		name: "MateBook D 14",
		brand: "Huawei",
		category: "desk",
		status: "active",
		specs: "Intel Core i5-1155G7 / 16GB / 512GB",
		description: "天下PC谁最美？大家都说是XX",
		icon: "material-symbols:laptop-windows-outline-rounded",
		featured: false,
		year: "2022",
	},
	{
		id: "server",
		name: "Fedora Server",
		brand: "unknown",
		category: "desk",
		status: "active",
		specs: "Intel Core i7-2600 / 16GB / 1TB",
		description: "天下PC谁最美？大家都说是XX",
		icon: "material-symbols:desktop-windows-outline-rounded",
		featured: false,
		year: "2022",
	},
	{
		id: "xiaomi",
		name: "Redmi K70E",
		brand: "Xiaomi",
		category: "mobile",
		status: "active",
		specs: "MediaTek 8300 Ultra / 12GB / 256GB",
		description: "用着还行",
		icon: "material-symbols:phone-iphone",
		featured: true,
		year: "2024",
	},
	{
		id: "gamesir",
		name: "启明星 2",
		brand: "Gamesir",
		category: "gamepad",
		status: "active",
		specs: "Nothing",
		description: "手柄",
		icon: "material-symbols:gamepad",
		featured: true,
		year: "2025",
	},
	{
		id: "oppo",
		name: "OPPO A55 5G",
		brand: "OPPO",
		category: "mobile",
		status: "backup",
		specs: "MediaTek 700 / 6GB / 128GB",
		description: "备用机",
		icon: "material-symbols:phone-iphone",
		featured: false,
		year: "2024",
	},
	{
		id: "huawei",
		name: "HUAWEI 畅享 7",
		brand: "Huawei",
		category: "mobile",
		status: "archived",
		specs: "Snapdragon 425 / 4GB / 16GB",
		description: "天下手机谁最美？大家都说是XX",
		icon: "material-symbols:phone-iphone",
		featured: false,
		year: "2017",
	},
	{
		id: "vivo",
		name: "vivo Y35A",
		brand: "Vivo",
		category: "mobile",
		status: "archived",
		specs: "Snapdragon 410 / 2GB / 16GB",
		description: "这位更是重量级",
		icon: "material-symbols:phone-iphone",
		featured: false,
		year: "2015",
	},
];
