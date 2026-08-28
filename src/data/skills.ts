/**
 * Content repository paths are relative to its root.
 * sync-content.mjs rewrites content-relative media references to the
 * theme repository's existing /images and /assets paths before build.
 */
/**
 * 技能页数据源（纯内容）。
 * 页面展示与筛选规则由 src/config/skillsConfig.ts 控制。
 */
import type { SkillItem } from "@/types/skillsConfig";

export const skillsData: SkillItem[] = [
	{
		name: "JavaScript",
		description:
			"ES2020+ syntax, async plumbing, and event-driven browser code.",
		icon: "simple-icons:javascript",
		category: "frontend",
		level: "advanced",
	},
	{
		name: "TypeScript",
		description: "Typed application code and maintainable contracts.",
		icon: "simple-icons:typescript",
		category: "frontend",
		level: "expert",
	},
	{
		name: "Astro",
		description: "Content-focused sites with fast server-rendered output.",
		icon: "simple-icons:astro",
		category: "frontend",
		level: "advanced",
	},
	{
		name: "Svelte",
		description: "Focused interactive islands and component systems.",
		icon: "simple-icons:svelte",
		category: "frontend",
		level: "advanced",
	},
	{
		name: "React",
		description: "Composable component trees with hooks and client state.",
		icon: "simple-icons:react",
		category: "frontend",
		level: "intermediate",
	},
	{
		name: "Vue",
		description: "Progressive component authoring for rapid single-page apps.",
		icon: "simple-icons:vuedotjs",
		category: "frontend",
		level: "intermediate",
	},
	{
		name: "Tailwind CSS",
		description: "Utility-first styling for rapidly composed interfaces.",
		icon: "simple-icons:tailwindcss",
		category: "frontend",
		level: "advanced",
	},
	{
		name: "Sass",
		description: "Nesting, variables, and mixins for maintainable stylesheets.",
		icon: "simple-icons:sass",
		category: "frontend",
		level: "intermediate",
	},
	{
		name: "Node.js",
		description: "Build tooling, services, and content pipelines.",
		icon: "simple-icons:nodedotjs",
		category: "backend",
		level: "advanced",
	},
	{
		name: "Python",
		description: "Scripting, data wrangling, and service automation.",
		icon: "simple-icons:python",
		category: "backend",
		level: "intermediate",
	},
	{
		name: "Java",
		description: "Typed OO code for larger service and tooling layers.",
		icon: "simple-icons:openjdk",
		category: "backend",
		level: "intermediate",
	},
	{
		name: "Go",
		description: "Concurrent services and small high-performance tools.",
		icon: "simple-icons:go",
		category: "backend",
		level: "beginner",
	},
	{
		name: "Rust",
		description: "Memory-safe systems code and performance-critical paths.",
		icon: "simple-icons:rust",
		category: "backend",
		level: "beginner",
	},
	{
		name: "C++",
		description: "Native modules and performance-sensitive components.",
		icon: "simple-icons:cplusplus",
		category: "backend",
		level: "beginner",
	},
	{
		name: "C",
		description: "Low-level systems work close to the runtime.",
		icon: "simple-icons:c",
		category: "backend",
		level: "beginner",
	},
	{
		name: "Kotlin",
		description: "Concise JVM/Android code with modern null safety.",
		icon: "simple-icons:kotlin",
		category: "backend",
		level: "beginner",
	},
	{
		name: "Swift",
		description: "Native Apple-platform code and small CLIs.",
		icon: "simple-icons:swift",
		category: "backend",
		level: "beginner",
	},
	{
		name: "Ruby",
		description: "Readable scripting and quick automation.",
		icon: "simple-icons:ruby",
		category: "backend",
		level: "beginner",
	},
	{
		name: "PHP",
		description: "Server-rendered web code and content platforms.",
		icon: "simple-icons:php",
		category: "backend",
		level: "beginner",
	},
	{
		name: "PostgreSQL",
		description: "Relational data modeling and application queries.",
		icon: "simple-icons:postgresql",
		category: "backend",
		level: "intermediate",
	},
	{
		name: "Playwright",
		description: "User-facing regression and accessibility testing.",
		icon: "simple-icons:playwright",
		category: "tooling",
		level: "advanced",
	},
];

/** 获取所有技能数据列表 */
export function getSkillsList(): SkillItem[] {
	return skillsData;
}
