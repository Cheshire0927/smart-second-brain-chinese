<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/s2b-dev/smart-second-brain/main/assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/s2b-dev/smart-second-brain/main/assets/logo-light.svg">
  <img alt="Smart Second Brain" src="https://raw.githubusercontent.com/s2b-dev/smart-second-brain/main/assets/logo-light.svg" width="300">
</picture>

</div>

<br>

Your Smart Second Brain 是一个**免费且开源**的 Obsidian 插件，它让你的 vault 变得更聪明：更好的搜索、可交互的知识图谱，以及一个真正读过你笔记的 AI 助手。

搜索帮你找出笔记，图谱把它们归拢成你的 vault 真正在谈论的主题，而助手可以同时借助这两者来作答。**搜索和图谱开箱即用，不需要任何 AI 供应商。**接入一个供应商即可解锁完整的 agent。桌面端与移动端均可运行。

**[smartsecondbrain.dev](https://smartsecondbrain.dev)** 上有演示视频、功能介绍、设置指南与完整文档。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/s2b-dev/smart-second-brain/main/assets/hero-desktop-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/s2b-dev/smart-second-brain/main/assets/hero-desktop-light.png">
  <img alt="Smart Second Brain：智能图谱把 vault 按主题分组，旁边是一个阅读笔记并提出修改建议的聊天" src="https://raw.githubusercontent.com/s2b-dev/smart-second-brain/main/assets/hero-desktop-light.png">
</picture>

## 功能

- **[搜索](https://smartsecondbrain.dev/search/)**：把关键词匹配与语义理解结合起来，让你找到的是心里想着的那篇笔记，而不是敲进去的那几个字（[工作原理](https://smartsecondbrain.dev/search/how-it-works/)）
- **[智能图谱](https://smartsecondbrain.dev/graph/)**：推导出你的 vault 究竟在讲什么——依据你的链接、标签和你写下的内容把笔记归入各个主题，且无需维护任何东西（[工作原理](https://smartsecondbrain.dev/graph/how-it-works/)）
- **[Agents](https://smartsecondbrain.dev/agents/)**：读写你的笔记，并以 [widget](https://smartsecondbrain.dev/agents/widgets/) 的形式从中即时绘制图表与看板，支持 skills、记忆、MCP，以及与你其他插件的集成

## 安装

从 Obsidian 的社区插件中安装 **Smart Second Brain** 并启用它。搜索与智能图谱立刻可用，无需任何配置。

添加一个嵌入模型，并把它指定给搜索和图谱，即可解锁语义搜索，以及读得懂笔记内容（而不只是链接关系）的主题归类；再添加一个 AI 供应商即可启用 agent。参见[入门指南](https://smartsecondbrain.dev/start/installation/)。

开箱状态下，你的任何数据都不会离开本机。笔记只会发送给你自己配置的供应商，且没有任何遥测 —— 参见[隐私说明](https://smartsecondbrain.dev/privacy/model/)。唯一的其他网络请求是每天一次的检查更新：它从 GitHub 拉取本插件的 `manifest.json`，且不发送任何关于你的信息；可以在"设置 → 通用 → 检查更新"中关闭。

## 参与贡献

- 报告缺陷或提出功能建议请到[这里](https://github.com/s2b-dev/smart-second-brain/issues/new/choose)
- 提问请到 [Q&A](https://github.com/s2b-dev/smart-second-brain/discussions/categories/q-a)
- 分享你的 skill、agent 或工作流请到 [Show and tell](https://github.com/s2b-dev/smart-second-brain/discussions/categories/show-and-tell)
- 欢迎提交 pull request。[CONTRIBUTING.md](CONTRIBUTING.md) 里有开发环境设置以及我们如何处理 AI 辅助贡献；[AGENTS.md](AGENTS.md) 里有架构说明、命令与代码约定

我们最初是把它当作一个大学项目做出来的。那段时光早已结束，但我们仍在业余时间继续开发它 —— 作为前沿 AI 的一块试验田，也作为我们所热爱的 Obsidian 工作流中的一件工具。代码中有很大一部分由 AI 编码智能体写成；我们审阅、测试，并为每一处改动负责，提交与 PR 也会说明是否有智能体参与。

## 许可证

[MIT](LICENSE)
