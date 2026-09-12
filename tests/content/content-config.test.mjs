import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	CONFIG_DOMAINS,
	DOMAIN_BY_FILE,
	GENERATED_CONFIG_FILE,
} from "../../scripts/content/config-domains.mjs";
import {
	EMPTY_MODULE,
	generateModule,
	readConfigOverrides,
	syncUserConfig,
} from "../../scripts/content/config-overlay.mjs";

/** 只造内容仓的 `config/` 目录；类型校验另有一组用例覆盖。 */
function createConfigDirectory(files) {
	const base = mkdtempSync(join(tmpdir(), "shirone-config-"));
	const directory = join(base, "config");
	mkdirSync(directory, { recursive: true });
	for (const [name, contents] of Object.entries(files)) {
		const absolute = join(directory, name);
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, contents);
	}
	return { base, directory };
}

function expectFailure(action, fragment) {
	assert.throws(action, (error) => {
		assert.match(error.message, fragment);
		return true;
	});
}

describe("配置领域登记表", () => {
	it("领域名与文件名都唯一", () => {
		const keys = CONFIG_DOMAINS.map((domain) => domain.key);
		const files = CONFIG_DOMAINS.map((domain) => domain.file);
		assert.equal(new Set(keys).size, keys.length);
		assert.equal(new Set(files).size, files.length);
	});

	it("文件名一律 kebab-case，避免大小写不敏感文件系统上的歧义", () => {
		for (const domain of CONFIG_DOMAINS) {
			assert.match(domain.file, /^[a-z][a-z0-9-]*$/, `${domain.key} 的文件名`);
		}
	});

	it("生成物不落在 src/generated/，否则图标收集会漏扫用户配置里的图标", () => {
		assert.ok(!GENERATED_CONFIG_FILE.startsWith("src/generated/"));
	});
});

describe("读取内容仓配置", () => {
	it("解析 YAML 并按登记表顺序返回", () => {
		const { base, directory } = createConfigDirectory({
			"nav-bar.yaml": "links:\n  - preset: Home\n",
			"site.yaml": "title: My Blog\nthemeColor:\n  hue: 262\n",
		});
		try {
			const entries = readConfigOverrides(directory);
			assert.deepEqual(
				entries.map((entry) => entry.domain.key),
				["site", "navBar"],
			);
			assert.deepEqual(entries[0].value, {
				title: "My Blog",
				themeColor: { hue: 262 },
			});
			assert.equal(entries[0].file, "config/site.yaml");
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("目录不存在时返回空数组", () => {
		assert.deepEqual(readConfigOverrides(join(tmpdir(), "shirone-absent")), []);
	});

	it("忽略非 YAML 文件与空文件", () => {
		const { base, directory } = createConfigDirectory({
			"README.md": "# 说明",
			"footer.html": "<p>hi</p>",
			"site.yaml": "# 只有注释\n",
		});
		try {
			assert.deepEqual(readConfigOverrides(directory), []);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("接受 .yml 后缀", () => {
		const { base, directory } = createConfigDirectory({
			"license.yml": "enable: false\n",
		});
		try {
			const entries = readConfigOverrides(directory);
			assert.equal(entries.length, 1);
			assert.equal(entries[0].domain.key, "license");
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("拒绝同一领域同时存在 .yaml 与 .yml", () => {
		const { base, directory } = createConfigDirectory({
			"site.yaml": "title: A\n",
			"site.yml": "title: B\n",
		});
		try {
			expectFailure(
				() => readConfigOverrides(directory),
				/both override site/i,
			);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("文件名拼错时给出最接近的建议", () => {
		const { base, directory } = createConfigDirectory({
			"sidbar.yaml": "enable: true\n",
		});
		try {
			expectFailure(
				() => readConfigOverrides(directory),
				/Did you mean sidebar\.yaml/i,
			);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("拒绝写了键却没给值的条目", () => {
		const { base, directory } = createConfigDirectory({
			"site.yaml": "title:\n",
		});
		try {
			// 这是最容易出的事故：深合并会把 null 覆盖上去，站点标题直接被抹掉。
			expectFailure(() => readConfigOverrides(directory), /title is null/i);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("拒绝顶层不是映射的文件", () => {
		const { base, directory } = createConfigDirectory({
			"site.yaml": "- 我是个数组\n",
		});
		try {
			expectFailure(
				() => readConfigOverrides(directory),
				/must be a key-value mapping/i,
			);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("拒绝非法 YAML", () => {
		const { base, directory } = createConfigDirectory({
			"site.yaml": "a: [1,\n",
		});
		try {
			expectFailure(() => readConfigOverrides(directory), /is not valid YAML/i);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("拒绝 YAML 锚点造成的循环引用", () => {
		const { base, directory } = createConfigDirectory({
			"site.yaml": "banner: &loop\n  homeText: *loop\n",
		});
		try {
			expectFailure(
				() => readConfigOverrides(directory),
				/circular reference/i,
			);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("日期样式的标量保持字符串，不会被解析成 Date", () => {
		const { base, directory } = createConfigDirectory({
			"profile.yaml": "name: 2024-01-05\n",
		});
		try {
			assert.equal(readConfigOverrides(directory)[0].value.name, "2024-01-05");
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});
});

describe("生成覆盖层模块", () => {
	it("没有覆盖时与仓库里已提交的空模块完全一致", () => {
		const committed = readFileSync(
			new URL(`../../${GENERATED_CONFIG_FILE}`, import.meta.url),
			"utf8",
		);
		// 没有这条一致性，local 模式下重新生成就会弄脏 git status。
		// 比对前抹平换行：Windows 的 core.autocrlf 会把签出的文件变成 CRLF，
		// 而生成器一律写 LF —— git 自己会归一化，这里也照做。
		const normalize = (text) => text.split("\r\n").join("\n");
		assert.equal(generateModule([]).source, EMPTY_MODULE);
		assert.equal(normalize(committed), EMPTY_MODULE);
	});

	it("按领域标注类型，并把类型导入合并去重", () => {
		const { source } = generateModule([
			{
				domain: DOMAIN_BY_FILE.site,
				file: "config/site.yaml",
				value: { title: "A" },
			},
			{
				domain: DOMAIN_BY_FILE.profile,
				file: "config/profile.yaml",
				value: { name: "B" },
			},
		]);
		assert.match(
			source,
			/import type \{ ProfileConfig, SiteConfig \} from "@\/types\/config";/,
		);
		assert.match(source, /const site: DeepPartial<SiteConfig> = \{/);
		assert.match(source, /const profile: DeepPartial<ProfileConfig> = \{/);
		assert.match(
			source,
			/userConfigOverrides: Readonly<Record<string, unknown>> = \{/,
		);
	});

	it("navBar 用整体替换的专用类型，不做 DeepPartial", () => {
		const { source } = generateModule([
			{
				domain: DOMAIN_BY_FILE["nav-bar"],
				file: "config/nav-bar.yaml",
				value: { links: [{ preset: "Home" }] },
			},
		]);
		assert.match(source, /const navBar: NavBarConfigOverride = \{/);
		assert.ok(!source.includes("DeepPartial"));
	});

	it("行号能翻译回 YAML 文件与键路径", () => {
		const { source, lineOwners } = generateModule([
			{
				domain: DOMAIN_BY_FILE.site,
				file: "config/site.yaml",
				value: { banner: { position: "top" } },
			},
		]);
		const line = source.split("\n").findIndex((text) => text.includes('"top"'));
		assert.deepEqual(lineOwners[line], {
			file: "config/site.yaml",
			path: "banner.position",
		});
	});

	it("数组元素的路径带下标", () => {
		const { source, lineOwners } = generateModule([
			{
				domain: DOMAIN_BY_FILE.profile,
				file: "config/profile.yaml",
				value: { links: [{ name: "A" }, { name: "B" }] },
			},
		]);
		const line = source.split("\n").findIndex((text) => text.includes('"B"'));
		assert.equal(lineOwners[line].path, "links[1].name");
	});

	it("非标识符的键会被引号包住", () => {
		const { source } = generateModule([
			{
				domain: DOMAIN_BY_FILE.site,
				file: "config/site.yaml",
				value: { "not-an-identifier": 1 },
			},
		]);
		assert.match(source, /"not-an-identifier": 1,/);
	});

	it("生成物记录了消费过的内容仓文件，便于溯源", () => {
		const { source } = generateModule([
			{
				domain: DOMAIN_BY_FILE.site,
				file: "config/site.yaml",
				value: { title: "A" },
			},
		]);
		assert.match(
			source,
			/userConfigSources: readonly string\[\] = \[\n\t"config\/site\.yaml",/,
		);
	});

	it("llms 走 A 级纯数据领域，按 DeepPartial<LlmsConfig> 标注", () => {
		const { source } = generateModule([
			{
				domain: DOMAIN_BY_FILE.llms,
				file: "config/llms.yaml",
				value: {
					siteSummary: "面向大模型的站点简介",
					corePages: [{ title: "Home", url: "/" }],
				},
			},
		]);
		assert.match(
			source,
			/import type \{ LlmsConfig \} from "@\/types\/llmsConfig";/,
		);
		assert.match(source, /const llms: DeepPartial<LlmsConfig> = \{/);
		assert.match(source, /llms,/);
	});
});

describe("类型校验（真实 tsc，跑在本仓库上）", () => {
	const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
	const generated = join(repoRoot, GENERATED_CONFIG_FILE);

	/**
	 * 用 `dryRun` 跑真实的生成 + 校验链路。
	 *
	 * `dryRun` 会先落盘再还原，因为 `tsc` 读的是磁盘上的文件；
	 * 每个用例结束后都断言生成物没被改动，避免测试弄脏工作区。
	 */
	function validate(files) {
		const { base, directory } = createConfigDirectory(files);
		const before = readFileSync(generated, "utf8");
		try {
			return syncUserConfig({
				root: repoRoot,
				sourceRoot: dirname(directory),
				dryRun: true,
			});
		} finally {
			assert.equal(readFileSync(generated, "utf8"), before, "生成物应被还原");
			rmSync(base, { recursive: true, force: true });
		}
	}

	it("合法配置通过校验", () => {
		const result = validate({
			"site.yaml": "title: My Blog\nlang: zh_CN\nthemeColor:\n  hue: 262\n",
			"post-list.yaml": "pageSize: 12\nlayout:\n  mode: grid\n",
		});
		assert.deepEqual(result.files, [
			"config/site.yaml",
			"config/post-list.yaml",
		]);
	});

	it("拼错的键报错时指出文件、键名与正确写法", () => {
		expectFailure(
			() => validate({ "profile.yaml": "name: Me\nbioo: oops\n" }),
			/config\/profile\.yaml's bioo.*Did you mean to write 'bio'/s,
		);
	});

	it("越界的枚举值会被拦下", () => {
		expectFailure(
			() => validate({ "post-list.yaml": "layout:\n  mode: gird\n" }),
			/config\/post-list\.yaml's layout\.mode/,
		);
	});

	it("填错的类型会被拦下", () => {
		expectFailure(
			() => validate({ "site.yaml": "themeColor:\n  hue: 很粉\n" }),
			/config\/site\.yaml's themeColor\.hue/,
		);
	});

	it("数组元素同样受完整类型约束", () => {
		expectFailure(
			() =>
				validate({
					"sidebar.yaml":
						"components:\n  - type: profile\n    enable: true\n    slot: topp\n",
				}),
			/config\/sidebar\.yaml's components\[0\]\.slot/,
		);
	});

	it("非法配置在重复同步时依然报错，不会因为文件没变而被放行", () => {
		const broken = { "license.yaml": "enablee: true\n" };
		expectFailure(() => validate(broken), /config\/license\.yaml's enablee/);
		expectFailure(() => validate(broken), /config\/license\.yaml's enablee/);
	});

	it("llms.yaml 的合法覆盖通过校验", () => {
		const result = validate({
			"llms.yaml": [
				"siteSummary: 面向大模型的站点简介",
				"generateFull: false",
				"descriptionMaxLength: 320",
				"excludeTags:",
				"  - secret",
				"  - 私密",
				"corePages:",
				"  - title: 首页",
				'    url: "/"',
				"    description: 最新文章流入口",
				"",
			].join("\n"),
		});
		assert.deepEqual(result.files, ["config/llms.yaml"]);
	});

	it("llms.yaml 拼错的键给出 Did you mean 提示", () => {
		expectFailure(
			() => validate({ "llms.yaml": "siteSumary: oops\n" }),
			/config\/llms\.yaml's siteSumary.*Did you mean to write 'siteSummary'/s,
		);
		expectFailure(
			() => validate({ "llms.yaml": "excludeTagss:\n  - secret\n" }),
			/config\/llms\.yaml's excludeTagss.*Did you mean to write 'excludeTags'/s,
		);
	});

	it("llms.yaml 的 corePages 元素同样受完整类型约束", () => {
		expectFailure(
			() =>
				validate({
					"llms.yaml": "corePages:\n  - title: Home\n    urls: /\n",
				}),
			/config\/llms\.yaml's corePages\[0\]\.urls/,
		);
		expectFailure(
			() => validate({ "llms.yaml": "descriptionMaxLength: 很长\n" }),
			/config\/llms\.yaml's descriptionMaxLength/,
		);
	});

	it("comment.yaml 的合法 giscus 覆盖通过校验（含嵌套 theme 局部覆盖）", () => {
		const result = validate({
			"comment.yaml": [
				"enable: true",
				"provider: giscus",
				"giscus:",
				"  repo: owner/repo",
				"  repoId: R_placeholder",
				"  categoryId: DIC_placeholder",
				"  theme:",
				"    dark: transparent_dark",
				"",
			].join("\n"),
		});
		assert.deepEqual(result.files, ["config/comment.yaml"]);
	});

	it("comment.yaml 拼错的键给出 Did you mean 提示", () => {
		expectFailure(
			() => validate({ "comment.yaml": "giscus:\n  repoo: owner/repo\n" }),
			/config\/comment\.yaml's giscus\.repoo.*Did you mean to write 'repo'/s,
		);
	});

	it("comment.yaml 越界的 provider 与 mapping 枚举会被拦下", () => {
		expectFailure(
			() => validate({ "comment.yaml": "provider: gisko\n" }),
			/config\/comment\.yaml's provider/,
		);
		expectFailure(
			() =>
				validate({
					"comment.yaml": "provider: giscus\ngiscus:\n  mapping: urlpath\n",
				}),
			/config\/comment\.yaml's giscus\.mapping/,
		);
	});
});
