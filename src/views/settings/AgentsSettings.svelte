<script lang="ts">
import { Notice, type TFolder } from "obsidian";
import { AgentEditorModal } from "../../components/modal/AgentEditorModal";
import FolderSuggest from "../../components/modal/FolderSuggest.svelte";
import ManagedEntityItem from "../../components/settings/ManagedEntityItem.svelte";
import ManagedEntitySection from "../../components/settings/ManagedEntitySection.svelte";
import SettingGroup from "../../components/settings/SettingGroup.svelte";
import SettingItem from "../../components/settings/SettingItem.svelte";
import Badge from "../../components/ui/Badge.svelte";
import Button from "../../components/ui/Button.svelte";
import { confirmDelete } from "../../components/modal/ConfirmModal";
import Dropdown from "../../components/ui/Dropdown.svelte";
import Icon from "../../components/ui/Icon.svelte";
import Toggle from "../../components/ui/Toggle.svelte";
import { getProviderDefinition } from "../../providers/index";
import { getData } from "../../stores/dataStore.svelte";
import { DEFAULT_AGENT_ID } from "../../stores/agentDefaults";
import { getPlugin } from "../../stores/state.svelte";
import { DEFAULT_AGENT_ICON, type ChatOpenLocation } from "../../types/plugin";
import { isMobileUI } from "../../utils/platform";

const pluginData = getData();
const plugin = getPlugin();

const chatOpenLocationOptions: { display: string; value: ChatOpenLocation }[] = [
	{ display: "主区域（标签页）", value: "tab" },
	{ display: "左侧边栏", value: "left" },
	{ display: "右侧边栏", value: "right" },
];

function suggestFolders(): TFolder[] {
	return plugin.app.vault.getAllFolders(true);
}

// Persist a new agent-context root, then seed core skills + base prompts into it (skip-if-exists;
// existing files in the old folder are left untouched) so the change takes effect without a reload.
async function changeAgentFolder(path: string): Promise<void> {
	pluginData.agentFolder = path;
	await plugin.reinitAgentFolder();
}

let agents = $derived(pluginData.agents);
let agentIds = $derived(Object.keys(agents));

function openAgentEditor(agentId: string) {
	new AgentEditorModal(plugin, agentId).open();
}

function createNewAgent() {
	const agent = pluginData.createAgent("新建智能体");
	pluginData.selectedAgentId = agent.id;
	// Seed the base prompt note immediately so it exists in the vault before the editor opens.
	void plugin.promptFilesService?.ensureAgentPrompt(agent.id);
	openAgentEditor(agent.id);
}

function duplicateAgent(agentId: string) {
	const sourceAgent = agents[agentId];
	if (!sourceAgent) return;
	const duplicated = pluginData.duplicateAgent(agentId, `${sourceAgent.name}（副本）`);
	pluginData.selectedAgentId = duplicated.id;
	// Carry over the source's edited base + memory prompts to the duplicate's own notes.
	void plugin.promptFilesService?.copyAgentPrompt(agentId, duplicated.id);
	openAgentEditor(duplicated.id);
}

async function deleteAgent(agentId: string) {
	if (agentId === DEFAULT_AGENT_ID) {
		new Notice("无法删除内置的默认智能体");
		return;
	}
	const agent = agents[agentId];
	if (!(await confirmDelete(plugin.app, agent?.name ?? agentId))) return;
	try {
		// Remove the agent's folder BEFORE the agent leaves config, and AWAIT it:
		// deleteAgentDir resolves the folder path from the agent's (name-based) entry, and
		// only once the agent is gone can its name be reused by another agent. Fully ordering
		// the removal closes the window where a reused name could point deletion at the wrong
		// folder.
		await plugin.promptFilesService?.deleteAgentDir(agentId);
		pluginData.deleteAgent(agentId);
		plugin.agentManager?.invalidateAgentRunnable(agentId);
	} catch (error) {
		new Notice(error instanceof Error ? error.message : "删除智能体失败");
	}
}

function selectDefaultAgent(agentId: string) {
	if (pluginData.defaultAgentId === agentId) return;
	pluginData.setDefaultAgentId(agentId);
}

function getAgentModelSummary(agentId: string): string {
	const agent = agents[agentId];
	if (!agent?.chatModel) {
		return "未选择聊天模型";
	}
	const providerDef = getProviderDefinition(agent.chatModel.provider, pluginData.getAllProviderMeta());
	return `${providerDef?.displayName ?? agent.chatModel.provider} · ${agent.chatModel.model}`;
}

// Enabled-skills summary for an agent row: a capped strip of the enabled skills' icons
// with a "+N" overflow chip. Icons come from AgentManager.getEnabledSkillIcons (single
// source of truth — see collectEnabledSkills).
const MAX_SKILL_ICONS = 12;
function getAgentSkillsSummary(agentId: string): { icons: string[]; overflow: number; count: number } {
	const icons = plugin.agentManager?.getEnabledSkillIcons(agentId) ?? [];
	return {
		icons: icons.slice(0, MAX_SKILL_ICONS),
		overflow: Math.max(0, icons.length - MAX_SKILL_ICONS),
		count: icons.length,
	};
}
</script>

<div class="agents-settings">
  <ManagedEntitySection
    heading="智能体"
    description="智能体将模型、系统提示词、技能、工具和 MCP 服务器组合成可复用的助手，用于不同的工作流。"
    emptyMessage="尚未配置任何智能体。"
    hasItems={agentIds.length > 0}
  >
    {#snippet actions()}
      <Button buttonText="添加智能体" cta={true} onClick={createNewAgent} />
    {/snippet}

    {#each agentIds as agentId (agentId)}
      {@const agent = agents[agentId]}
      {@const skillsSummary = getAgentSkillsSummary(agentId)}
      <ManagedEntityItem
        name={agent.name}
        selected={pluginData.defaultAgentId === agentId}
        radio={agentIds.length > 1
          ? {
              selected: pluginData.defaultAgentId === agentId,
              onclick: () => selectDefaultAgent(agentId),
              ariaLabel: `将 ${agent.name} 设为默认智能体`,
            }
          : undefined}
      >
        {#snippet leading()}
          <span class="agent-avatar" class:agent-avatar--default={pluginData.defaultAgentId === agentId}>
            <Icon name={agent.icon?.trim() || DEFAULT_AGENT_ICON} size="s" />
          </span>
        {/snippet}

        {#snippet badges()}
          {#if agentId === DEFAULT_AGENT_ID}
            <Badge label="内置" tone="muted" />
          {/if}
        {/snippet}

        {#snippet children()}
          <div class="agent-summary-row">
            <span class="agent-model-summary">{getAgentModelSummary(agentId)}</span>
            {#if skillsSummary.count > 0}
              <span class="agent-skills-icons">
                {#each skillsSummary.icons as icon, i (i)}
                  <Icon name={icon} size="xs" />
                {/each}
                {#if skillsSummary.overflow > 0}
                  <span class="agent-skills-overflow">+{skillsSummary.overflow}</span>
                {/if}
              </span>
            {/if}
          </div>
        {/snippet}

        {#snippet actions()}
          {#if agentId !== DEFAULT_AGENT_ID}
            <Button
              iconId="trash"
              ariaLabel="删除智能体"
              tooltip="删除智能体"
              onClick={() => deleteAgent(agentId)}
            />
          {/if}
          <Button
            iconId="settings"
            ariaLabel="编辑智能体"
            tooltip="编辑智能体"
            onClick={() => openAgentEditor(agentId)}
          />
          <Button
            iconId="copy"
            ariaLabel="复制智能体"
            tooltip="复制智能体"
            onClick={() => duplicateAgent(agentId)}
          />
        {/snippet}
      </ManagedEntityItem>
    {/each}
  </ManagedEntitySection>

  <SettingGroup heading="智能体存储">
    <SettingItem
      name="智能体文件夹"
      desc="存放智能体上下文（技能、记忆和基础提示词）的仓库文件夹。更改后会在新位置初始化，原有文件保持不变。"
    >
      <FolderSuggest
        app={plugin.app}
        value={pluginData.agentFolder}
        placeholder="智能体"
        suggestionFn={(query) =>
          suggestFolders().filter((folder) =>
            folder.path.toLowerCase().includes(query.toLowerCase()),
          )}
        onSelected={(path: string) => void changeAgentFolder(path)}
        onSubmit={(path: string) => void changeAgentFolder(path)}
      />
    </SettingItem>
  </SettingGroup>

  <SettingGroup heading="聊天">
    <SettingItem name="聊天文件夹" desc="用于存放聊天文件及相关数据的文件夹">
      <FolderSuggest
        app={plugin.app}
        value={pluginData.targetFolder}
        placeholder="聊天"
        suggestionFn={(query) =>
          suggestFolders().filter((folder) =>
            folder.path.toLowerCase().includes(query.toLowerCase()),
          )}
        onSelected={(path: string) => (pluginData.targetFolder = path)}
        onSubmit={(path: string) => (pluginData.targetFolder = path)}
      />
    </SettingItem>

    <SettingItem
      name="附件文件夹"
      desc="聊天文件附件的存放文件夹。留空则使用 Obsidian 的附件文件夹。"
    >
      <FolderSuggest
        app={plugin.app}
        value={pluginData.attachmentFolder}
        placeholder={pluginData.resolvedAttachmentFolder}
        suggestionFn={(query) =>
          suggestFolders().filter((folder) =>
            folder.path.toLowerCase().includes(query.toLowerCase()),
          )}
        onSelected={(path: string) => (pluginData.attachmentFolder = path)}
        onSubmit={(path: string) => (pluginData.attachmentFolder = path)}
      />
    </SettingItem>

    <SettingItem name="在以下位置打开新聊天" desc="新聊天窗口的打开位置">
      <Dropdown
        type="options"
        dropdown={chatOpenLocationOptions}
        selected={pluginData.chatOpenLocation}
        onchange={(value) => (pluginData.chatOpenLocation = value)}
      />
    </SettingItem>

    <!-- Obsidian mobile has no status bar (addStatusBarItem is a no-op there), so the
         toggle would control nothing. Hide it rather than offering a dead switch. -->
    {#if !isMobileUI()}
      <SettingItem
        name="在状态栏显示活跃智能体"
        desc="为每个有运行中智能体的聊天在状态栏显示可点击的指示器。"
      >
        <Toggle
          checked={pluginData.showActiveAgentsInStatusBar}
          onchange={(checked) => (pluginData.showActiveAgentsInStatusBar = checked)}
        />
      </SettingItem>
    {/if}
  </SettingGroup>

  <SettingGroup heading="Widget">
    <SettingItem
      name="Widget 文件夹"
      desc="在聊天中生成的 Widget 点击保存按钮后存放的位置。"
    >
      <FolderSuggest
        app={plugin.app}
        value={pluginData.widgetsFolder}
        placeholder="Widget"
        suggestionFn={(query) =>
          suggestFolders().filter((folder) =>
            folder.path.toLowerCase().includes(query.toLowerCase()),
          )}
        onSelected={(path: string) => (pluginData.widgetsFolder = path)}
        onSubmit={(path: string) => (pluginData.widgetsFolder = path)}
      />
    </SettingItem>
  </SettingGroup>
</div>

<style>
  .agents-settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .agent-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
  }

  .agent-avatar--default {
    background: color-mix(in srgb, var(--interactive-accent) 16%, var(--background-secondary));
    border-color: color-mix(in srgb, var(--interactive-accent) 45%, var(--background-modifier-border));
    color: var(--text-accent);
  }

  /* These live inside ManagedEntityItem's `children` snippet and are only referenced
     within {#if} branches, so Svelte's scoped-CSS analysis prunes the plain-class rules
     (unlike .agent-avatar, which survives via its class: directive). Scope them with
     :global so the flex layout actually reaches the rendered row. */
  :global(.agent-summary-row) {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  :global(.agent-model-summary) {
    color: var(--text-muted);
  }

  :global(.agent-skills-icons) {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    color: var(--text-muted);
  }

  :global(.agent-skills-overflow) {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
</style>
