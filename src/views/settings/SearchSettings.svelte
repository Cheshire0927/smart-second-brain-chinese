<script lang="ts">
import { SearchDisplaySettingsModal } from "../../components/modal/SearchDisplaySettingsModal";
import EmbeddingIndexSection from "../../components/settings/EmbeddingIndexSection.svelte";
import SettingGroup from "../../components/settings/SettingGroup.svelte";
import SettingItem from "../../components/settings/SettingItem.svelte";
import Button from "../../components/ui/Button.svelte";
import Toggle from "../../components/ui/Toggle.svelte";
import { getData } from "../../stores/dataStore.svelte";
import { getPlugin } from "../../stores/state.svelte";
import { isMobileUI } from "../../utils/platform";

const pluginData = getData();
const plugin = getPlugin();

const displaySummary = $derived.by(() => {
	const enabledLabels: string[] = [];
	if (pluginData.searchShowPath) enabledLabels.push("路径");
	if (pluginData.searchShowTags) enabledLabels.push("标签");
	if (pluginData.searchShowMatchBadges) enabledLabels.push("匹配标记");
	if (pluginData.searchShowMatchContext) enabledLabels.push("内容摘要");

	return enabledLabels.length > 0 ? enabledLabels.join(", ") : "无额外信息";
});

function openDisplaySettingsModal() {
	new SearchDisplaySettingsModal(plugin.app).open();
}
</script>

<SettingGroup heading="显示">
  <SettingItem
    name="结果详情"
    desc={`选择每条搜索结果中显示哪些元数据与上下文。当前：${displaySummary}。`}
  >
    <Button buttonText="配置" onClick={openDisplaySettingsModal} />
  </SettingItem>

  {#if isMobileUI()}
    <SettingItem
      name="在导航栏使用 S2B 搜索"
      desc="让底部导航栏的放大镜按钮打开 Smart Second Brain 搜索，而非 Obsidian 的快速切换器。仅该按钮改变——快速切换器仍可从命令面板及其快捷键打开。"
    >
      <Toggle
        checked={pluginData.overrideMobileNavbarSearch}
        onchange={(checked) => (pluginData.overrideMobileNavbarSearch = checked)}
      />
    </SettingItem>
  {/if}
</SettingGroup>

<EmbeddingIndexSection purpose="search" />
