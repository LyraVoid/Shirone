import type { MermaidConfig } from "mermaid";

/**
 * Keep the diagram layout and visual style explicit across Mermaid major versions.
 * Mermaid 12 changed its defaults; existing content is authored for dagre/classic.
 */
export function createMermaidConfig(
	themeVariables: NonNullable<MermaidConfig["themeVariables"]>,
): MermaidConfig {
	return {
		startOnLoad: false,
		securityLevel: "strict",
		suppressErrorRendering: true,
		layout: "dagre",
		look: "classic",
		theme: "base",
		themeVariables,
	};
}
