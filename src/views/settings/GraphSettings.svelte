<script lang="ts">
import EmbeddingIndexSection from "../../components/settings/EmbeddingIndexSection.svelte";
import ModelSettingControl from "../../components/settings/ModelSettingControl.svelte";
import SettingGroup from "../../components/settings/SettingGroup.svelte";
import SettingItem from "../../components/settings/SettingItem.svelte";
import RangeSlider from "../../components/ui/RangeSlider.svelte";
import Toggle from "../../components/ui/Toggle.svelte";
import { ModelSelectionModal } from "../../components/modal/ModelSelectionModal";
import { useAvailableModels } from "../../hooks/useAvailableModels.svelte";
import { getData } from "../../stores/dataStore.svelte";
import { getPlugin } from "../../stores/state.svelte";

const pluginData = getData();
const plugin = getPlugin();
const models = useAvailableModels();

// Helper to update a single graph setting field
function updateSetting<K extends keyof typeof pluginData.smartGraphSettings>(
	key: K,
	value: (typeof pluginData.smartGraphSettings)[K],
) {
	pluginData.smartGraphSettings = { ...pluginData.smartGraphSettings, [key]: value };
}

const graphChatModel = $derived(pluginData.smartGraphSettings.graphChatModel ?? null);

/**
 * Whether the configured naming model would have private titles withheld.
 *
 * Note titles are the entire payload for topic naming, so a private note is
 * withheld outright rather than partially redacted.
 */
const graphModelWithholdsPrivate = $derived(
	graphChatModel != null && !pluginData.isProviderTrusted(graphChatModel.provider),
);

/**
 * The naming-model description, which gains a warning only while it is actually
 * true — invisible for a trusted or local provider.
 *
 * Sits on the model row rather than the automatic toggle because withholding is
 * a property of the selected provider: it applies to manual naming too. Stated
 * here at all because the automatic pass deliberately runs silent (it fires on
 * every topic change, and a notice there would nag), so for a user who never
 * presses the button in the Topics panel this is the only place it surfaces.
 */
const namingModelDesc = $derived(
	graphModelWithholdsPrivate
		? "用于为主题命名的模型。若不设置，主题将以其关联最紧密的笔记命名。" +
				"该服务商未被信任处理私密笔记，因此私密标题不会参与命名。"
		: "用于为主题命名的模型。若不设置，主题将以其关联最紧密的笔记命名。",
);

function openGraphModelSelection() {
	new ModelSelectionModal(
		plugin,
		"chat",
		graphChatModel ? { provider: graphChatModel.provider, model: graphChatModel.model } : null,
		(selected) => {
			updateSetting("graphChatModel", selected ? { ...selected, modelConfig: {} } : null);
		},
	).open();
}
</script>

<SettingGroup heading="主题名称">
  <SettingItem name="主题命名模型" desc={namingModelDesc}>
    <ModelSettingControl
      available={models.hasProviders && models.hasModels}
      loading={models.hasProviders && models.isLoadingModels}
      configureLabel={!models.hasProviders ? "配置服务商" : "配置模型"}
      unavailableHint={!models.hasProviders ? "尚未配置任何 AI 服务商。" : undefined}
      onConfigure={() => models.openSettings()}
      placeholder="选择模型"
      selectedLabel={graphChatModel?.model ?? null}
      onSelect={openGraphModelSelection}
      secondaryLabel={graphChatModel ? "清除" : undefined}
      onSecondary={graphChatModel ? () => updateSetting("graphChatModel", null) : undefined}
    />
  </SettingItem>
  <SettingItem
    name="自动命名主题"
    desc="主题发生变化时自动命名。关闭后仅能从图谱的「主题」面板手动命名。"
  >
    <Toggle
      checked={pluginData.smartGraphSettings.autoLabelClusters ?? false}
      onchange={(value) => updateSetting("autoLabelClusters", value)}
    />
  </SettingItem>
</SettingGroup>

<!-- Selecting a graph index turns on semantic edges: notes with no wiki links are
     connected to their nearest topic, so topic detection can place them. Without
     one the graph falls back to wiki links only. -->
<EmbeddingIndexSection purpose="graph" />
