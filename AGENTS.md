# AGENTS.md

本文件为在本仓库中工作的编码智能体提供指引。

## 项目

Smart Second Brain 是一个 Obsidian 插件（`smart-second-brain`），它把整个 vault 变成 AI 辅助的第二大脑：通过 RAG 流水线与你的笔记对话、智能图谱视图，以及与供应商无关的大模型支持（OpenAI、Ollama、oMLX、Anthropic、OpenRouter、OpenAI 兼容端点）。桌面端与移动端均可运行（`isDesktopOnly: false`）。技术栈：Svelte 5（runes）+ TypeScript + Vite + LangChain/LangGraph，样式用 Tailwind，格式化与 lint 用 Biome，测试用 Vitest，包管理器是 Bun。

## 贡献方式

面向人的贡献规则（分支模型、PR 要求、AI 参与声明政策、供应商与 skill 配方）在 [CONTRIBUTING.md](CONTRIBUTING.md)。CI（`.github/workflows/ci.yml`）会在每个 pull request 上运行 Biome 的格式与 lint 检查、`bun run check`、`bun run test` 和 `bun run build`；本地跑不过其中任何一项的改动，在 CI 上也一样过不去。

**必须披露 AI 的参与，绝不隐瞒。** 本仓库的绝大部分代码由编码智能体依据维护者的需求说明写成，提交历史应当如实反映这一点：
- 由 Claude Code 产生的提交带有 `Co-Authored-By: Claude <noreply@anthropic.com>` 尾注，该配置位于 `.claude/settings.json`（它会覆盖用户级设置）。请保留这条尾注。如果你通过其他智能体提交，则改为添加指明**那个**智能体的尾注；绝不要把改动归属给并未参与的智能体。
- 每个 PR 正文都遵循 `.github/PULL_REQUEST_TEMPLATE.md`，包括在 "How I tested it" 下的斜体行 `_AI assistance: ..._`。用一句话如实填写：哪个智能体写了这个改动、依据什么需求说明、人审阅并测试了什么。不要漏掉这一行。只有完全未经智能手之手的改动才适合填 "none"——而你现在正在做的改动不属于这种情况。
- 对 review bot 发现问题的回复，由推动这轮循环的人来写，智能体或人都没问题。但对**人**的 review 的回复，应由维护者本人来写。

## 命令

使用 `bun`（不要用 npm/yarn）。锁文件是 `bun.lock`。

- `bun run dev` — Vite 监听式构建到 `build/smart-second-brain/`（开发模式）。
- `bun run build` — 生产构建到 `build/prod`。
- `bun run check` — 对 `tsconfig.json`（src）与 `tsconfig.test.json`（测试 + 集成）两份配置各跑一次 `svelte-check`。**每次实现完成后都要跑。** `check:src` / `check:test` 分别只跑其中一遍。
- `bun run format` — Biome 格式化器（写入）覆盖 `src`、`test`、`integration`。**每次实现完成后都要跑。**
- `bun run lint` — Biome linter，仅应用安全的自动修复，同样作用于这三个目录。
- `bun run lint:unsafe` — 追加 `--unsafe`。之后务必审阅 diff；这类修复可能改变行为而不仅仅是风格。本仓库的两个真实例子：`delete obj[k]` → `obj[k] = undefined`（键仍然存在，于是"重命名"不再是重命名），以及 `x && x.f()` → `x?.f()`（其中 `x` 是不可为空的字符串，把"是否为空串"检查变成了"是否为 null"检查）。当规则触及控制流时，优先手工修复。

测试是被类型检查的，而不只是被格式化：`tsconfig.json` 只覆盖 `src/**`，因此 `tsconfig.test.json` 把它扩展到 `test/**` 和 `integration/**`（它保持独立，是为了让测试文件永远无法影响生产构建）。这不是形式主义——在测试套件没有被类型检查的那段时间里，某处 `resolveSegments` 调用一直传着一个已被移除的参数，静默返回 `[]`，并使四个断言变成了空断言。

关于测试目录，有两个 Biome 设置，都在 `biome.json` 里（它是严格 JSON，不接受注释，所以在这里说明）：
- `files.ignore` 排除了 `integration/S2B Test Vault/**` —— 那里是第三方插件包、主题以及 Obsidian 自己的配置，Obsidian 每次启动都会重写它们。永远不要格式化它。
- 一条 `overrides` 条目对 `test/**` 和 `integration/**` 关闭了 `style/noNonNullAssertion`。在测试中 `expect(store.getAgent(id)!.name)` 正是要点所在：如果查找失败，测试就应该抛出。该规则对 `src/` 仍然开启。
- `bun run test` — Vitest 单元测试（单次运行）。`bun run test:watch` 进入监听模式。`bun run test:coverage` 生成覆盖率。
- `bun run test -- <pattern>` — 跑单个文件/模式，例如 `bun run test -- test/providers/openai.test.ts`。
- `bun run test:integration` — 针对一个真实运行的 Obsidian 实例的端到端测试（见下文"集成测试"）。
- `bun run setup-vault` — 把 `build/smart-second-brain/` 软链接进 `integration/S2B Test Vault/.obsidian/plugins/`。首次构建后跑一次即可。

除了 `bun.lock` 已记录的内容，不需要单独的 `bun install` 步骤；未经重新生成锁文件，**不要**手工编辑 `package.json` 里的版本号。

## 文档在站点上，不在 README 里

面向用户的文档位于 **`s2b-dev/site`** 仓库（签出在 `../site`），发布在 `smartsecondbrain.dev`。这里的 README 被刻意保持精简——一句话介绍、安装、开发设置、链接。不要把功能列表、供应商表格或 FAQ 内容再塞回来；正是这类重复导致 README 逐渐过时。

**在发版之前**，请刷新站点上那些可枚举的事实——这一步没有自动化。清单在 `../site/CLAUDE.md` 的 "Before a plugin release" 一节，涵盖供应商列表、内置 skills、内置工具、`minAppVersion` 与平台支持情况。改动 `PROVIDER_TEMPLATES`、`BUILT_IN_TOOL_IDS`、`src/skills/defaults/` 或 `manifest.json`，都意味着站点也要同步更新。

**发布说明写在 `CHANGELOG.md`**，每个稳定版本一个 `## X.Y.Z (YYYY-MM-DD)` 小节，最新的在最前面。它是唯一来源：插件会把它以 `?raw` 打包进去，并在更新后于 "What's new" 标签页中展示自上次所见版本以来的小节（`utils/releaseNotes.ts`、`views/releaseNotes/`）；发布工作流会把该 tag 的小节复制进 GitHub 草稿，并且缺少该小节的稳定 tag 会导致工作流失败。请在发版提交里、打 tag 之前写好该小节。预发布版本不需要小节，也从不触发公告。

插件还从若干界面**链向**该站点（故障排查设置、隐私行、引导流程、供应商设置、Agent 编辑器）。这些 URL 每一条都记录在 `src/utils/docs.ts` —— 绝不要在调用处内联 `smartsecondbrain.dev` 的 URL。该文件是与站点路由之间的一份契约：当路由变动时，要对照 `../site/dist/sitemap-0.xml` 和 `../site/astro.config.mjs` 中的 `redirects` 块来核对。渲染统一走 `components/ui/DocsLink.svelte`（设置行用图标变体，通过 `nameSuffix`；分节描述用内联变体）。

**绝不要用 `window.open` 打开外部 `http(s)` URL。** Obsidian 的 iOS WKWebView 从未实现窗口创建，在那里它无条件返回 null，于是点击会悄无声息地什么都不做——已在真机上验证（见 `providers/openrouterOAuth.ts` 中的 `navigateToAuthorizeUrl`）。请渲染一个锚点元素：`components/ui/ExternalLinkButton.svelte` 覆盖了最常见的情况——设置行里想要一个**看起来像**按钮的东西，并且它匹配 Obsidian 的按钮尺寸（`height: var(--input-height)`、`4px 12px`），因而与真正的按钮齐平。`obsidian://` 深链是例外——由应用的协议处理器接管，不涉及窗口。

## 架构

本节是架构的权威描述。（曾经有一份更长的 `docs/architecture-overview.md`，但它已经过时，于 2026 年 8 月被删除；如有需要从 git 历史中恢复，但不要相信它的内容。）

### 组合根（Composition root）

`src/main.ts`（`SecondBrainPlugin`）是生命周期的唯一所有者。它：
- 构造数据存储，然后同步注册视图/命令/扩展。
- 把重量级初始化（`LexicalSearchService`、`VectorStoreService`、`SkillsService`、`AgentManager`）推迟到 `onLayoutReady`，好让工作区立刻渲染出来。如果聊天在初始化完成前被打开，`AgentManager.ensureAgent()` 会惰性初始化。
- 打补丁 `WorkspaceLeaf.prototype.openFile`，使 `.chat` 文件始终在配置好的侧栏分栏中打开，而不是替换当前激活的笔记。
- 注册三个视图：`VIEW_TYPE_CHAT`（`.chat` FileView）、`VIEW_TYPE_SMART_GRAPH`、`VIEW_TYPE_ONBOARDING`。（`VIEW_TYPE_NOTE_CONTEXT` 存在，但**在首个发布版本中被禁用**——它的注册、命令与激活器都在 `main.ts` 中被注释掉了。）

### 分层结构

- `src/agent/` — 大模型编排。`Agent.ts` 封装 LangChain 的 React-agent 执行与流式输出；`AgentManager.ts` 是面向 Obsidian 的门面：注册供应商、绑定工具（`tools/`）、把基础提示词与所选 skills 组装成系统提示词，并按模型动态解析多模态能力。`ObsidianChatManager.ts` 是一个自定义的 LangGraph checkpoint 存储器：线程以 gzip 压缩的 JSON `.chat` 文件存放在 vault 中，快速索引放在插件数据里。由于 LangGraph 会在每个 checkpoint 中重复完整的消息历史（并在 `Send` 任务载荷中再来一遍），该文件格式把每条消息去重进一个内容寻址的 `messageTable`（`threadDataCodec.ts`，格式 v2；旧文件在加载时被重写）——没有它，长线程会呈 O(N²) 增长（#431）。**对话历史是一棵 checkpoint 树，而不是扁平列表**——编辑/重新生成会创建分支。
- `src/providers/` — 模板化的供应商定义（每个厂商一个文件），外加一个单例运行时 `registry.ts`，它只保存**已配置**的供应商。OpenAI 兼容被当作一等模板对待。同一模板支持多个实例，各自拥有不同的显示名/端点。
- `src/vectorstore/` — 混合检索。`VectorStoreService.ts` 拥有索引生命周期，并支持按嵌入模型区分的多个索引（聊天检索与图谱分析可以使用不同模型）。`HNSWVectorStore.ts` + `hnswWorker.ts` 负责近似最近邻；`MiniSearchService.ts` 负责 BM25 风格的词法回退（在完全没有配置嵌入模型时也能工作）。搜索查询会在查询时包上该嵌入模型系列的检索指令（`queryInstruction.ts`：Qwen3-Embedding/harrier 用 `Instruct: …\nQuery:`，BGE/mxbai 用句子前缀）；文档是原样嵌入的，因此这是仅作用于查询端的，永远不需要重建索引。
- `src/search/` — 查询规划、词法打分、最近笔记加权、最终排序流水线，被搜索弹窗与 `search_notes` 工具共用。
- **Agent 上下文集中在 vault 的同一个文件夹下。** 一个 agent 的全部可编辑上下文都归拢到一个可配置的根目录 `agentFolder`（默认 `Agents/`）之下，含三个固定的子目录，于是系统提示词所依据的一切都是真实、用户可见的笔记：
  - `Agents/Memories/` — 共享的工作记忆笔记（跨 agent 全局；写入其中的操作一律自动批准）。
  - `Agents/Skills/` — skill 的 `<name>/SKILL.md` 目录。**一切皆 skill**：原先的 4 项能力（`vault`、`notes`、`web`、`update`）以内置的**核心 skill** 形式发布，其正文就是它们的指引，`allowed-tools` frontmatter 负责挂接内置工具；用户 skill 是同样的东西，只是不挂接工具。发现流程扫描该文件夹，把每个含 `SKILL.md` 的目录都当作一个 skill（没有保留名，也没有 `GUIDANCE.md`）。
  - `Agents/<Agent Name>/AGENT.md` — 每个 agent 一个文件夹，存放它的定义笔记。笔记的**正文就是系统提示词**：基础指令、`# Current Date` 小节和 `# Memory` 小节，全部集中在一处可编辑的地方。没有记忆开关——一个 agent 是否参与记忆，取决于它的笔记里是否还有那个小节，用户直接删掉即可。文件夹是重命名/复制/删除操作的基本单位（见 `PromptFilesService`）。
    整棵树都属于插件机制，通过 `utils/fileFiltering.ts` 中的 `isAgentFilePath` 被排除在索引/搜索/图谱之外（路径辅助函数在 `utils/agentPaths.ts`）。有一处刻意的例外：`list_directory` 总是显示 `Agents/Memories/` —— 记忆笔记不在搜索索引中，因此那份列表是 agent 发现记忆的唯一途径（默认的 `# Memory` 小节会把它指引到那里）。旧安装在首次运行时被归拢（`SkillsService.migrateAgentFolder`，从旧的顶层 `Skills/` 文件夹或更早的 vault 外 `<configDir>/skills`）；v6 的 `migrateCoreSkills` 会删除残留的、每个核心 skill 一份的 `GUIDANCE.md` 文件，好让内置核心 skill 的 `SKILL.md` 干净地播种进同一批目录。
- `src/skills/` — 两阶段 skill 系统（Agent Skills 风格）：启动时发现 frontmatter，按需加载完整内容。内置默认值在 `src/skills/defaults/`（包括 `vault`/`notes`/`web`/`manage-skills` 这几个核心 skill —— 最后一个在获得创建/删除能力之前叫 `update-skills`，在 schema v8 中迁移）。**`allowed-tools` 是承重结构**：只有当某个*已启用*的 skill 通过 `allowed-tools` 挂接了某内置工具，且该工具的 `toolsConfig[toolId].enabled` 覆盖没有否决它时，`AgentManager.buildToolsForAgent` 才会绑定该工具。所有 skill 指引都以惰性方式触达模型——在 `# Skills` 的 `<available_skills>` 块中以描述形式被宣传，正文通过 `load_skill` 按需加载；一个其声明的内置工具**全部**被逐工具覆盖否决掉的 skill，会从两处可见性中同时隐藏（`AgentManager.skillHasUsableTools`），这样模型永远不会被教一个注定绑定不上的工具。`manage_skills` 工具（即 "Manage Skills" 核心 skill，自 schema v14 起默认开启；Tools 弹窗可将其关闭）允许 agent 创建新 skill、修订自己已挂接的 skill，或删除用户要求删除的 skill（无论最初是谁写的；这条只是指引，因为只有对话本身才持有该请求）；与 `manage_notes` 不同，它的每个操作都立即生效，没有 `pendingChangesStore` 审阅环节——创建 skill 与挂接 skill 是同一个动作。新建的 skill 不会获得显式的 `agent.skills` 条目，因此它的文件一落到磁盘上就会被读作已挂接（`?? true`）。新 skill 上的 `allowedTools` 会经过一份固定的只读白名单过滤，绝不原样透传——这是防止 agent 通过刚写好的 skill 给自己授予新能力的唯一一道闸门。删除内置核心 skill 会被拒绝（它只会在下次启动时通过 `bootstrapDefaultSkills` 再次出现）。由于一个工具可能被多个 skill 挂接（例如某个集成 skill 重复声明了一个核心 skill 已拥有的工具），逐工具覆盖**不是**按 skill 配置的——它们集中在一个 agent 级的 `ToolsModal`（从 Agent 编辑器 General 分节的 "Tools" 行打开），该弹窗把全部 `BUILT_IN_TOOL_IDS` 平铺列出，并显示每个工具由哪些 skill 挂接着。
- `src/agent/promptFiles.ts` — 每个 agent 的 `<Agent Name>/AGENT.md` 的文件后端存储。代码中的常量 `DEFAULT_AGENT_PROMPT` 仍是工厂默认值，供 diff/重置界面对比之用；文件则是可编辑的副本。那些必须保持"活"的值以占位符的形式写进正文（`{{memoryFolder}}`、`{{date}}`），并在组装时由 `substitutePromptPlaceholders` 替换，因此绝不会有陈旧内容被固化进存储文本；组装阶段只追加那些不可避免是动态的部分（`# Skills` 块、无写入工具时的守卫）。每条笔记带有一小块由插件管理的 frontmatter（`author`、`version` —— 扁平键，以便 Obsidian 的 Properties 界面渲染它们），其中的 `version` 记录该正文写作时所基于的出厂基线，与 skills 对 SKILL.md 的版本化方式一致；正是它让"默认值在你的编辑之下发生了变动"这件事可被检测出来，并且它会随笔记一起穿过同步/复制（复制一个 agent 会原样复制笔记，出处信息一并带走）。所有面向模型的内容只使用剥掉 frontmatter 的**正文** —— 组装、diff 弹窗、以及出厂历史的指纹计算都是如此，因此重新盖章永远不会被误认为是用户定制。内容在内存中以"已解析的正文+版本"形式缓存（初始化时以及 vault 变更时填充），于是 `assembleSystemPrompt` 与响应式的陈旧指引 getter 读它时不必访问磁盘。编辑发生在 vault 笔记里（铅笔/"open note"）；`SystemPromptModal` 这个 diff 弹窗保留下来用于与默认值对比和重置。由于笔记位于它自己的文件夹里，重命名/复制/删除都是目录操作。（Skill/工具指引不再存放在这里 —— 它就是 skill 正文，通过笔记或 `manage_skills` 编辑。）
- `src/stores/` — 通过 Svelte 5 runes 实现的响应式状态（`*.svelte.ts`）。`dataStore` 是权威配置与密钥的间接层（与它同处一地的非 store 居民有：负责默认 agent 与加载期归一化的 `agentDefaults.ts`、负责 schema 版本与迁移表的 `dataMigrations.ts`、负责提示词陈旧检测的 `staleGuidance.ts`）；`chatStore` 掌管 `ChatSession` 与 `SessionRegistry`，而所有从 checkpoint 历史**推导**时间线的逻辑（checkpoint 图、`MessagePair`、工具时间线、摘要标记、上下文块）都在那个纯粹的、不含 rune 的 `chatTimeline.ts` 里；`pendingChangesStore` 暂存待审阅的笔记变更。`state.svelte.ts` 是一片叶子（只持有插件句柄）—— `stores/` 下的任何东西都不得被 `providers/*` 或 `utils/*` 导入；见下面关于导入环的规则。
- `src/components/` — 按功能纵向切分的 Svelte UI：`chat/`、`graph/`、`settings/`、`modal/`，以及共享的 `ui/` 基础件。Markdown 渲染走 Obsidian 自己的渲染器（不是自造的）。正文是 Svelte 组件的弹窗应继承 `modal/SvelteModal.ts`（`mountComponent(component, props, layout?)`；它负责挂载/卸载与布局覆盖），而不是重新实现一遍生命周期。
- `src/views/` — 很薄的 Obsidian 视图包装（`ItemView`/`FileView`/`PluginSettingTab`），负责挂载 Svelte 组件。以 Svelte 为主体的 `ItemView` 继承 `views/SvelteItemView.ts`，它是 `SvelteModal` 在视图侧的孪生兄弟。
- `src/editor/` — CodeMirror 扩展（`inlineDiffExtension`、`selectionHighlightExtension`）以及一个用于阅读视图 diff 的 markdown 后处理器。待审变更的刷新是事件驱动的，通过自定义 DOM 事件 `s2b-pending-changes-updated`。
- `src/lib/` — 屏蔽宿主怪癖的适配层：`obsidianFetch.ts`（优先原生 fetch，CORS 场景回退到 `requestUrl`）、`aiTransport.ts`（流式模式回退）、`secretStorage.ts`、`query.ts`（TanStack Query）、`i18n.ts` + `en.json`（目前只有英文）。
- `src/hooks/` — Svelte 5 响应式 context 辅助（`*.svelte.ts`）：可见笔记、选区、可用模型、密钥。
- `src/utils/` — 纯辅助函数（PDF 抽取、聚类/投影、通过 `computeWorkerManager.ts` 编排 worker、token 估算、wikilink 抽取）。

### 横切关注点

- **分阶段写入：** 会改动笔记的工具都经过 `pendingChangesStore` 交由用户审阅，而不是立即应用。审阅循环是双向闭合的：结果（已接受 / 已拒绝 / 部分应用，以及仍处于待定状态的路径）会作为上下文块注入模型下一轮的用户回合，走的是与可见笔记相同的 augment/strip 机制；而同一线程中对一个已处于待定状态的更新再次暂存时，会 rebase 到该待定提案的 `newContent` 之上，于是后来的提案同时携带两轮编辑。条目以模型的工具调用 id（`config.toolCall.id`）为键，这让聊天中的 `manage_notes` 卡片能显示实时的审阅状态标签。暂存之后笔记发生了变化提案就永远无法被接受（应用时无条件做冲突检查，删除亦然）；每一个审阅界面 —— 聊天栏、聊天内 hunk、编辑模式与阅读视图的操作栏 —— 都会检测这一点并禁用"接受"按钮并给出说明，而不是让它报错。
- **Worker 卸载：** 图谱投影/聚类以及 HNSW 运算都在 worker 中运行（`hnswWorker.ts`、`computeWorker.ts`），以保持界面流畅。
- **能力驱动的多模态：** 视觉/PDF 支持是在运行时按模型解析的 —— 不要硬编码对供应商的假设。
- **密钥：** `dataStore` 保存的是密钥 ID，不是明文值；明文值通过 `secretStorage.ts` 解析。
- **AsyncLocalStorage：** `lib/asyncLocalStorage.ts` 是唯一的 ALS 来源，在桌面端它是 Node 22 基于 `async_hooks` 实现的一个移植版本。绝不要把 Node 自带的 `AsyncLocalStorage` 类交给 LangChain（或任何其他东西）在渲染进程中使用：从 Node 24（Electron 40+、Obsidian 安装器 1.13+）起，它把帧存放在 V8 的 continuation-preserved embedder data 中，而那正是 Blink 的任务归属调度器也会写入的槽位，于是在一个被归属了交互任务中的首次 `getStore()` 会让渲染进程崩溃（#478、#481）。
- **没有运行时导入环。** 使用 `.madgerc` 为 `{"detectiveOptions":{"ts":{"skipTypeImports":true,"skipAsyncImports":true}}}` 的 `bunx madge --circular --extensions ts src/main.ts` 报告零环；请保持这一状态。维系它的那些接缝是：`providers/*` 从不导入 `stores/dataStore`（它们通过叶子 `state.svelte.ts` 的 `getPlugin()` 读取，而 `providerRuntime` 通过 `onCodexSessionChange` 播报 Codex 会话变更，由 `main.ts` 把它接到查询失效上）；`utils/agentPaths` 与 `utils/fileFiltering` 从 `utils/agentPathSource.ts` 读取 agent 文件夹，该文件由 `PluginDataStore` 在构造时安装；`utils/actionNotice.ts` 中打开界面的辅助函数对它要打开的弹窗与服务使用动态 `import()`。内置工具的元数据（显示名、UI 摘要、存储的默认 `ToolConfig`）只有唯一一张表：`agent/tools/builtInToolDefaults.ts`。

## 构建

`vite.config.ts` 输出一个供 Obsidian 使用的 CommonJS 包 `main.js`。外部依赖：`obsidian`、`electron`、所有 `@codemirror/*` 与 `@lezer/*`（由宿主提供）、`@sap-ai-sdk/langchain`（可选依赖），以及 Node 内置模块。开发模式输出到 `build/smart-second-brain/` 并带 sourcemap；生产模式会清空目录并输出压缩后的产物到 `build/prod`。

测试通过 `vitest.config.ts` 中的 `test/__mocks__/` 别名来 mock `obsidian`、`electron` 和 `@sap-ai-sdk/langchain`。单元测试套件使用 `jsdom`，以 `pool: forks`、`fileParallelism: false` 和 `mockReset: true` 运行以防止状态泄漏。覆盖率统计范围仅为 `src/providers/**`。

## 代码约定

- **Biome** 统管 lint/format。制表符（宽度 4）、行宽 120、始终写分号、处处尾逗号。`useConst` 与 `useImportType` 关闭。导入自动整理。
- **Svelte 5 runes：**
  - 在以下场景使用 `$effect`：DOM 操作（canvas、动画）、第三方库集成、清理（定时器、监听器）、一次性初始化、仅浏览器可用的操作（分析、日志）。
  - **避免**用 `$effect` 做状态同步（不要在变量之间同步状态）或计算值（改用 `$derived`）。
- **优先使用自定义组件而不是裸 HTML。** 本项目有一套 Obsidian 风格的包装组件 —— 请用它们。特别是：设置中的每一个表单控件都必须包在 `SettingContainer` 里（带 `name=` 和 `desc=`），以匹配 Obsidian 的布局惯例：
  ```svelte
  <SettingContainer name="API Key" desc="Your provider API key">
      <TextComponent inputType="password" bind:value={apiKey} />
  </SettingContainer>
  ```
- **优先使用 Obsidian 原生样式而不是自定义 CSS。** 尽可能贴合原生的外观与行为，而不是另起炉灶。图标按钮使用原生的 `.clickable-icon` 类（它已经提供了静止时透明 → `--background-modifier-hover` 的高亮、原生圆角和光标样式），而不是手写 hover 背景。多依赖 Obsidian 的 CSS 变量（`--background-modifier-hover`、`--radius-s`、`--text-muted` 等），让插件跟随用户的主题。只有在原生确实表达不出意图时才添加自定义 CSS。

## 在真实 vault 中验证改动

手工验证时优先使用 Obsidian CLI，而不是"改完就祈祷"。始终按名字指定测试 vault，且 `vault=` 放在**最前面**：

```bash
obsidian vault="S2B Test Vault" command id=smart-second-brain:search-notes
obsidian vault="S2B Test Vault" dev:dom selector='.s2b-search-modal' total
obsidian vault="S2B Test Vault" dev:screenshot path="/tmp/search-modal.png"
obsidian vault="S2B Test Vault" dev:errors
```

稳定的手工流程：
1. 在 Obsidian 桌面应用中打开一次该测试 vault。
2. 运行一个 `command`。
3. 在检查之前先**轮询**选择器 —— 某些命令会在 UI 挂载完成之前就返回。如果弹窗没有立刻出现，不要就此判定失败。
4. 使用 `command`、`dev:dom`、`dev:screenshot`、`dev:errors`。`eval` 与 `dev:cdp` 保留给 DOM 查询和截图不足以解决问题的场景 —— 它们更脆弱。

已知问题：在 macOS 上，从 Codex Desktop 启动 `obsidian` 可能导致 Obsidian 意外退出（上游 `openai/codex#13706`）。如果遇到这种情况，改用普通终端运行 CLI，或重新打开 vault 并减少 CLI 调用。参考流程在 `integration/helpers/cli.ts`；另见 `.github/skills/` 下的 `obsidian-integration-test` skill。

## 并行智能体槽位

多个智能体会话可以同时工作，而不会在构建上互相竞争，也不会踩到彼此的实时 vault。三个**固定槽位**作为本仓库的兄弟目录存在（由 `bun run setup-slots` 创建一次，该脚本是幂等的）：

```
s2b-dev/
├── smart-second-brain/     ← 主签出：属于用户的。在槽位里工作时
│                             绝不要在这里构建 —— 用户实时测试所用的
│                             vault 软链接指向的是它的 build/。
└── agents/
    ├── wt1/                ← git worktree（自己的 node_modules，自己的 build/）
    ├── S2B WT1/            ← Obsidian vault，插件软链到 wt1/build/
    ├── wt2/  +  S2B WT2/
    ├── wt3/  +  S2B WT3/
    └── .locks/             ← 槽位占用标记
```

任何需要构建或实时验证的任务，都遵循如下**协议**：

1. `scripts/claim-slot.sh <task-or-branch-name>` —— 占用第一个空闲槽位，并打印它的 worktree 目录与 vault 名字。如果没有空闲槽位，去问用户，而不要在主签出里干活。`--status` 可列出占用者。
2. `cd` 进该槽位的 worktree。它处于 detached HEAD；在那里创建你的任务分支（`git fetch && git switch -c <branch> origin/main`）。若依赖有变化，跑 `bun install --frozen-lockfile`。
3. 构建用**一次性**的 `bunx vite build --mode development`（绝不要加 `--watch` —— 残留下来的 watcher 历史上是产物损坏的根源）。输出进入该槽位自己的 `build/smart-second-brain/`。
4. 只针对**你自己槽位的 vault**做实时验证，例如 `obsidian vault="S2B WT1" command id=app:reload`，然后走常规的 `command`/`dev:dom`/`dev:screenshot`/`dev:errors` 流程。绝不要从槽位会话里去操作 `S2B Test Vault` 或用户的 vault。
5. 集成测试可以通过环境变量指向槽位 vault：
   `S2B_TEST_VAULT="S2B WT1" S2B_TEST_VAULT_PATH="../agents/S2B WT1" bun run test:integration`
   （优先用绝对路径）。注意：从**两个槽位同时**跑完整套件的行为未经验证 —— 该套件假设 Obsidian 实例是安静的（`globalSetup` 会做一次禁用/启用循环）。并行工作时优先用实时 CLI 验证；若确实需要并发跑完整套件，请先与用户协调。
6. **在 PR 打开之后，先把自动化审阅推到干净状态，才算完成任务。** 本仓库有一个 PR 审阅机器人（Greptile）；它会在几分钟内审阅每一个被推送的提交。用 `gh pr view <n> --json comments,reviews`（摘要）和 `gh api repos/s2b-dev/smart-second-brain/pulls/<n>/comments`（行内发现）大约每 2 分钟轮询一次。处理**每一条**发现：是真问题就修复并推送；机器人判断有误时，就在评论下方简短回复理由。重复此过程，直到机器人最新的审阅覆盖了你的最新提交且没有未解决的发现（机器人摘要评论的页脚会写明最后审阅的提交）。不要合并 —— 合并在用户自己做完实时测试之后由用户决定。
7. PR 达到机器人干净状态后，执行 `scripts/release-slot.sh <wtN>`。离开时保持 worktree 干净。如果用户的实时测试之后需要返工，再次占用一个槽位来做后续修改。

一次性的宿主设置：每个槽位 vault 都必须向 Obsidian 注册一次。当 Obsidian 处于关闭状态时，`setup-slots` 会自动完成；否则请手工把每个 `agents/S2B WT<n>` 文件夹作为 vault 打开一次。

`bun run check` / `format` / `lint` / `test` 在槽位 worktree 内部都能正常工作。

## 集成测试

`integration/` 通过 CLI（`integration/helpers/cli.ts`）针对一个真实运行的 Obsidian 跑 Vitest。设置步骤：

1. `bun run build`
2. `bun run setup-vault`（一次性软链接）
3. 在 Obsidian 中打开 `integration/S2B Test Vault` 并启用该插件。
4. （可选）为依赖大模型的测试配置一个带有效 API key 的供应商。
5. `bun run test:integration` —— 或跑单个文件：`bunx vitest run --config vitest.integration.config.ts integration/plugin-lifecycle.test.ts`

测试**串行**运行（`fileParallelism: false`，共享同一个 Obsidian 实例），超时 120s，失败重试 1 次。需要大模型的测试（`agent-interaction`、`chat-e2e-flow`、`multi-turn`）在未配置供应商时会自动跳过，但如果配置了供应商而 key 无效，则会**失败**。要完全跳过它们：

```bash
bunx vitest run --config vitest.integration.config.ts --exclude 'integration/{agent-interaction,chat-e2e-flow,multi-turn}.test.ts'
```

`globalSetup.ts` 会在套件开始前执行一次禁用/启用循环，以从干净状态启动。
