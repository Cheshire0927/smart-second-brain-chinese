<script lang="ts">
import { Notice } from "obsidian";
import { get } from "svelte/store";
import { t } from "svelte-i18n";
import SettingGroup from "../../components/settings/SettingGroup.svelte";
import SettingItem from "../../components/settings/SettingItem.svelte";
import Button from "../../components/ui/Button.svelte";
import Toggle from "../../components/ui/Toggle.svelte";
import { getData } from "../../stores/dataStore.svelte";
import { getPlugin } from "../../stores/state.svelte";
import { ConfirmModal } from "../../components/modal/ConfirmModal";
import DocsLink from "../../components/ui/DocsLink.svelte";
import ExternalLinkButton from "../../components/ui/ExternalLinkButton.svelte";
import { Logger } from "../../utils/logging";

const pluginData = getData();
const plugin = getPlugin();
const githubIssuesListUrl =
	"https://github.com/s2b-dev/smart-second-brain/issues?q=is%3Aissue%20state%3Aopen%20label%3Abug";
const githubIssuesNewUrl = "https://github.com/s2b-dev/smart-second-brain/issues/new/choose";

async function handleCleanupPluginData() {
	const modal = new ConfirmModal(
		plugin.app,
		get(t)("settings.clear_modal.title"),
		get(t)("settings.clear_modal.description"),
		"删除",
	);
	modal.open();
	if (!(await modal.promise).confirmed) return;

	try {
		// Each index is deleted independently, and a failure does not abort the cleanup:
		// `deleteIndex` rejects when its IndexedDB databases can't be dropped (e.g. a
		// connection still holds one), and letting that propagate would skip `deleteData()`
		// entirely — so "clear plugin data" would leave the plugin data behind too.
		const failed: string[] = [];
		for (const index of [...pluginData.embeddingIndexes]) {
			try {
				await plugin.vectorStoreService.deleteIndex(index.id);
			} catch (error) {
				failed.push(index.id);
				Logger.error(`[Troubleshooting] Failed to delete embedding index ${index.id}:`, error);
			}
		}

		await pluginData.deleteData();
		if (failed.length > 0) {
			new Notice(
				`插件数据已清除，但 ${failed.join(", ")} 的存储向量无法删除。详情请查看控制台。`,
			);
		} else {
			new Notice(get(t)("plugin_data_cleared"));
		}
	} catch (error) {
		new Notice(error instanceof Error ? error.message : "清理插件数据失败");
	}
}
</script>

<!-- Diagnostics -->
<SettingGroup heading="诊断">
  <SettingItem name={$t("settings.verbose")} desc={$t("settings.verbose_desc")}>
    <Toggle
      checked={pluginData.isVerbose}
      onchange={(checked) => (pluginData.isVerbose = checked)}
    />
  </SettingItem>
</SettingGroup>

<!-- Maintenance -->
<SettingGroup heading="维护">
  <SettingItem
    name="更新日志"
    desc={`你当前使用版本 ${plugin.manifest.version}。查看近期版本的变更内容。`}
  >
    <Button buttonText="查看更新日志" onClick={() => void plugin.showReleaseNotes()} />
  </SettingItem>

  <!-- Docs first, GitHub as the escalation path: the troubleshooting guide is
       organised by symptom (the agent won't respond, search returns nothing, a note
       is being withheld, …), so it answers most of what would otherwise arrive as
       an issue. -->
  <SettingItem
    name="故障排查指南"
    desc="常见问题及解决方法——智能体无响应、搜索结果不理想、笔记被隐藏、缺少 MCP 工具，以及移动端特有问题。"
  >
    <DocsLink variant="button" doc="troubleshooting" label="打开指南" />
  </SettingItem>

  <SettingItem
    name="仍未解决？"
    desc="浏览已有的 GitHub issue，确认问题是否已被记录。若没有，请新建 issue 并附上你尝试过的方法、错误信息及复现步骤。"
  >
    <div class="flex gap-2 flex-wrap">
      <ExternalLinkButton href={githubIssuesListUrl} label="查看已有 issue" />
      <ExternalLinkButton href={githubIssuesNewUrl} label="新建 issue" />
    </div>
  </SettingItem>

  <SettingItem name={$t("settings.clear")} desc={$t("settings.clear_desc")}>
    <Button
      buttonText={$t("settings.clear_label")}
      styles="mod-warning"
      onClick={() => void handleCleanupPluginData()}
    />
  </SettingItem>
</SettingGroup>
