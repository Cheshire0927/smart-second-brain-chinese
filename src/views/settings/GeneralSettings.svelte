<script lang="ts">
import ManagedEntitySection from "../../components/settings/ManagedEntitySection.svelte";
import { PrivacyListModal } from "../../components/modal/PrivacyListModal";
import ProviderItem from "../../components/settings/ProviderItem.svelte";
import SettingGroup from "../../components/settings/SettingGroup.svelte";
import SettingItem from "../../components/settings/SettingItem.svelte";
import Button from "../../components/ui/Button.svelte";
import Toggle from "../../components/ui/Toggle.svelte";
import DocsLink from "../../components/ui/DocsLink.svelte";
import { getData } from "../../stores/dataStore.svelte";
import { getPlugin } from "../../stores/state.svelte";
import { icon } from "../../utils/utils";
import { ProviderSetupModal } from "../provider-setup/ProviderSetup";

const pluginData = getData();
const plugin = getPlugin();

const privacyListModal = new PrivacyListModal(plugin.app);

// Provider management state
let configuredProviderIds = $derived(pluginData.getConfiguredProviders());

function handleOpenProviderSetup() {
	new ProviderSetupModal(plugin, {}).open();
}
</script>

<!-- Providers -->
<ManagedEntitySection
  heading="服务商"
  description="服务商用于将 Smart Second Brain 连接到聊天、嵌入及其他模型功能所需的 AI 服务。"
  emptyMessage="尚未配置任何服务商实例。"
  hasItems={configuredProviderIds.length > 0}
>
  {#snippet actions()}
    <Button buttonText="添加服务商" cta={true} onClick={handleOpenProviderSetup} />
  {/snippet}

  {#if configuredProviderIds.length > 0}
    {#each configuredProviderIds as provider (provider)}
      <ProviderItem {provider} />
    {/each}
  {/if}
</ManagedEntitySection>

<!-- Privacy -->
<SettingGroup heading="隐私">
  <SettingItem
    name="笔记访问策略"
    class="privacy-setting-item"
    desc="选择不受信任的服务商默认可见范围为「无」还是「全部」，并管理对应的文件列表。"
  >
    {#snippet nameSuffix()}
      <span
        class="privacy-trust-icon privacy-trust-icon--label"
        use:icon={"shield-check"}
        aria-hidden="true"
      ></span>
      <!-- Two vault modes crossed with per-provider trust, where the same toggle
           inverts meaning depending on the mode — more than one description line
           can carry, so link the page that lays it out. -->
      <DocsLink doc="privacyModel" subject="笔记访问策略" />
    {/snippet}

    <Button onClick={() => privacyListModal.open()} buttonText="管理" />
  </SettingItem>

  <SettingItem
    name="检查更新"
    desc="每天从 GitHub 获取一次本插件的版本号，发现新版本时显示提示。不会发送关于你或仓库的任何信息。若 Obsidian 自身的插件自动更新检查已开启，则跳过此项。"
  >
    <Toggle
      checked={pluginData.checkForUpdates}
      onchange={(checked) => (pluginData.checkForUpdates = checked)}
    />
  </SettingItem>
</SettingGroup>

<style>
  /* --icon-size drives the injected svg too: Obsidian's .svg-icon reads it for
     both axes, so sizing only the span leaves the glyph at the inherited 18px
     height and it overflows the box. */
  .privacy-trust-icon {
    --icon-size: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--icon-size);
    height: var(--icon-size);
    color: var(--text-accent);
    flex-shrink: 0;
  }

  .privacy-trust-icon :global(svg.svg-icon) {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .privacy-trust-icon--label {
    --icon-size: 14px;
  }
</style>
