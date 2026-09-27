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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
	let settings = {};
	if (existsSync(settingsPath)) {
		try {
			settings = JSON.parse(readFileSync(settingsPath, "utf8"));
		} catch {
			settings = {};
		}
	}

	settings["yaml.schemas"] = {
		...(settings["yaml.schemas"] || {}),
		...schemaMappings,
	};

	writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
	console.log(`[schema] Generated ${CONFIG_DOMAINS.length} schemas in .vscode/schemas/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	generateConfigSchemas();
}
