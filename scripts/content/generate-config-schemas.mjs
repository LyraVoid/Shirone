/**
 * 基于 ts-json-schema-generator 从 src/types/*Config.ts 生成配置域 JSON Schema。
 *
 * 遵循原则：
 * 1. src/types/*Config.ts 是唯一的类型真源；
 * 2. 产物 schema 输出至 .vscode/schemas/<file>.schema.json；
 * 3. 递归删除所有 required（用户 YAML 是局部覆盖）；
 * 4. 保持 additionalProperties: false（未定义属性报错）；
 * 5. 随附更新 .vscode/settings.json 中的 yaml.schemas 映射，并在 schema 中提供 fileMatch，
 *    解决 VS Code / yaml-language-server 的 site.yaml 撞名问题并提供自动补全与即时校验。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	applyEdits,
	modify,
	parse as parseJsonc,
	printParseErrorCode,
} from "jsonc-parser";
import ts from "typescript";
import { CONFIG_DOMAINS } from "./config-domains.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SCHEMAS_DIR = join(ROOT, ".vscode/schemas");

function stripRequired(obj) {
	if (!obj || typeof obj !== "object") return;
	if (Array.isArray(obj)) {
		for (const item of obj) stripRequired(item);
		return;
	}
	delete obj.required;
	for (const val of Object.values(obj)) {
		stripRequired(val);
	}
}

/**
 * 轻量级从 TS AST 抽取 Interface/Type 属性并转换为 JSON Schema。
 * 兼容纯 TS 基础编译器，不引入庞大外部黑盒依赖，直接复用项目内的 typescript 编译器包。
 */
function generateSchemaForDomain(program, domain) {
	const checker = program.getTypeChecker();
	
	// 定位模块源文件
	let modulePath = domain.module.replace(/^@\//, "src/");
	if (!modulePath.endsWith(".ts")) modulePath += ".ts";
	const sourceFile = program.getSourceFile(join(ROOT, modulePath));
	if (!sourceFile) {
		console.warn(`[schema] Cannot find source file for ${domain.key} (${domain.module})`);
		return null;
	}

	let targetSymbol = null;
	ts.forEachChild(sourceFile, (node) => {
		if (
			(ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
			node.name.text === domain.type
		) {
			targetSymbol = checker.getSymbolAtLocation(node.name);
		}
	});

	if (!targetSymbol) {
		console.warn(`[schema] Cannot find symbol for type ${domain.type} in ${domain.module}`);
		return null;
	}

	const targetType = checker.getDeclaredTypeOfSymbol(targetSymbol);

	function typeToJsonSchema(type, visited = new Set()) {
		if (visited.has(type)) {
			return {};
		}
		visited.add(type);

		// 基础类型检测
		const flags = type.getFlags();
		if (flags & ts.TypeFlags.String) {
			return { type: "string" };
		}
		if (flags & ts.TypeFlags.Number) {
			return { type: "number" };
		}
		if (flags & ts.TypeFlags.Boolean) {
			return { type: "boolean" };
		}
		if (flags & ts.TypeFlags.Null) {
			return { type: "null" };
		}
		if (type.isStringLiteral()) {
			return { type: "string", enum: [type.value] };
		}
		if (type.isNumberLiteral()) {
			return { type: "number", enum: [type.value] };
		}
		if (flags & ts.TypeFlags.TemplateLiteral) {
			return { type: "string" };
		}
		if (flags & ts.TypeFlags.BooleanLiteral) {
			// ts 内部布尔字面量
			const intrinsic = type.intrinsicName;
			return { type: "boolean", enum: [intrinsic === "true"] };
		}

		// Union 类型
		if (type.isUnion()) {
			const subSchemas = type.types.map((t) => typeToJsonSchema(t, new Set(visited)));
			// 优化 boolean union (true | false)
			const isBoolUnion =
				subSchemas.length === 2 &&
				subSchemas.every((s) => s.type === "boolean" && Array.isArray(s.enum));
			if (isBoolUnion) {
				return { type: "boolean" };
			}
			return { anyOf: subSchemas };
		}

		// 数组类型
		if (checker.isTupleType(type)) {
			const typeArgs = checker.getTypeArguments(type);
			return {
				type: "array",
				items: typeArgs.map((itemType) => typeToJsonSchema(itemType, new Set(visited))),
				minItems: typeArgs.length,
				maxItems: typeArgs.length,
			};
		}
		if (checker.isArrayType(type)) {
			const typeArgs = checker.getTypeArguments(type);
			const itemType = typeArgs[0] ? typeToJsonSchema(typeArgs[0], new Set(visited)) : {};
			return { type: "array", items: itemType };
		}

		// 对象类型
		if (flags & ts.TypeFlags.Object) {
			const props = checker.getPropertiesOfType(type);
			const properties = {};

			for (const prop of props) {
				const propName = prop.getName();
				const decl = prop.valueDeclaration || prop.declarations?.[0];
				let doc = "";
				if (decl) {
					const comments = ts.getLeadingCommentRanges(
						decl.getSourceFile().getFullText(),
						decl.getFullStart(),
					);
					if (comments && comments.length > 0) {
						const last = comments[comments.length - 1];
						const text = decl.getSourceFile().getFullText().slice(last.pos, last.end);
						doc = text.replace(/^\/\*\*?|\*\/$/g, "").replace(/^\s*\* ?/gm, "").trim();
					}
				}
				if (!doc) {
					doc = ts.displayPartsToString(prop.getDocumentationComment(checker));
				}

				const propType = checker.getTypeOfSymbolAtLocation(prop, decl || sourceFile);
				const propSchema = typeToJsonSchema(propType, new Set(visited));
				if (doc) {
					propSchema.description = doc;
				}
				properties[propName] = propSchema;
			}

			// 支持 string index signature (例如 Record<string, unknown> 或 I18nConfig)
			const indexType = checker.getIndexTypeOfType(type, ts.IndexKind.String);
			let additionalProperties = false;
			if (indexType) {
				additionalProperties = typeToJsonSchema(indexType, new Set(visited));
			}

			return {
				type: "object",
				properties,
				additionalProperties,
			};
		}

		return {};
	}

	const schema = typeToJsonSchema(targetType);
	stripRequired(schema);

	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		title: `${domain.key} configuration override`,
		description: `Shirone ${domain.key} config schema generated from ${domain.module}.${domain.type}`,
		...schema,
	};
}

export function generateConfigSchemas() {
	if (!existsSync(SCHEMAS_DIR)) {
		mkdirSync(SCHEMAS_DIR, { recursive: true });
	}

	const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, "tsconfig.json");
	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT);

	const program = ts.createProgram(parsed.fileNames, parsed.options);

	const schemaMappings = {};

	for (const domain of CONFIG_DOMAINS) {
		const schema = generateSchemaForDomain(program, domain);
		if (!schema) continue;

		const fileName = `${domain.file}.schema.json`;
		const schemaFilePath = join(SCHEMAS_DIR, fileName);
		writeFileSync(schemaFilePath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");

		schemaMappings[`./.vscode/schemas/${fileName}`] = [
			`config/${domain.file}.yaml`,
			`config/${domain.file}.yml`,
		];
	}

	// 更新 .vscode/settings.json 中的 yaml.schemas
	const settingsPath = join(ROOT, ".vscode/settings.json");
	const settingsText = existsSync(settingsPath)
		? readFileSync(settingsPath, "utf8")
		: "{}\n";
	const merged = mergeYamlSchemas(settingsText, schemaMappings);
	if (merged.error) {
		console.error(
			`[schema] Refusing to touch ${relative(ROOT, settingsPath)}: ${merged.error}`,
		);
		process.exitCode = 1;
		return;
	}
	writeFileSync(settingsPath, merged.text, "utf8");
	console.log(
		`[schema] Generated ${CONFIG_DOMAINS.length} schemas in .vscode/schemas/`,
	);
}

/**
 * 把 yaml.schemas 映射合并进 settings.json 文本，其余内容（含映射内部注释）逐字节保留。
 * 解析失败时返回 error 与原文，由调用方拒绝写入——旧实现会把文件重置成 `{}`。
 */
export function mergeYamlSchemas(settingsText, schemaMappings) {
	const errors = [];
	const settings = parseJsonc(settingsText, errors, {
		allowTrailingComma: true,
	});
	if (errors.length > 0) {
		const first = errors[0];
		return {
			error: `${printParseErrorCode(first.error)} at offset ${first.offset}`,
			text: settingsText,
		};
	}
	if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
		return { error: "the document is not a JSON object", text: settingsText };
	}
	const existing = Object.hasOwn(settings, "yaml.schemas")
		? settings["yaml.schemas"]
		: {};
	if (
		existing === null ||
		typeof existing !== "object" ||
		Array.isArray(existing)
	) {
		return { error: "yaml.schemas is not an object", text: settingsText };
	}
	// 逐个键编辑：整块替换会丢掉映射内部的注释，也会在无变化时重排格式。
	let text = settingsText;
	for (const [key, value] of Object.entries(schemaMappings)) {
		if (JSON.stringify(existing[key]) === JSON.stringify(value)) continue;
		text = applyEdits(
			text,
			modify(text, ["yaml.schemas", key], value, {
				formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
			}),
		);
	}
	// shortcut: 某个键的值本身被改写时，该值内部的注释（如 glob 数组里）仍会丢。
	if (!text.endsWith("\n")) text += "\n";
	// 重复键会让 parseJsonc 读到最后一个值、modify 却改第一个，静默失效；
	// 因此按解析结果校验，不一致就拒绝写入。
	const effective = parseJsonc(text, [], {
		allowTrailingComma: true,
	})["yaml.schemas"];
	const intended = { ...existing, ...schemaMappings };
	if (JSON.stringify(effective) !== JSON.stringify(intended)) {
		return {
			error: "yaml.schemas does not match after the edit (duplicate keys?)",
			text: settingsText,
		};
	}
	return { text };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	generateConfigSchemas();
}
