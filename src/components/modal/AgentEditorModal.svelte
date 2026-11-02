<script lang="ts">
import { Notice, getIconIds, normalizePath, type Modal } from "obsidian";
import { obsidianSettingsAction, showActionNotice } from "../../utils/actionNotice";
import { onMount } from "svelte";
import { AddSkillModal } from "./AddSkillModal";
import { ToolsModal } from "./ToolsModal";
import { MCPServerModal } from "./MCPServerModal";
import { ModelSelectionModal } from "./ModelSelectionModal";
import { SystemPromptModal } from "./SystemPromptModal";
import ManagedEntityItem from "../settings/ManagedEntityItem.svelte";
import ModelSettingControl from "../settings/ModelSettingControl.svelte";
import SettingContainer from "../settings/SettingContainer.svelte";
import SettingGroup from "../settings/SettingGroup.svelte";
import SettingItem from "../settings/SettingItem.svelte";
import Badge from "../ui/Badge.svelte";
import Button from "../ui/Button.svelte";
import DocsLink from "../ui/DocsLink.svelte";
import Icon from "../ui/Icon.svelte";
import PickerPopover from "../ui/PickerPopover.svelte";
import Search from "../ui/Search.svelte";
import Text from "../ui/Text.svelte";
import Toggle from "../ui/Toggle.svelte";
import GenericAIIcon from "../ui/logos/GenericAIIcon.svelte";
import { useAvailableModels } from "../../hooks/useAvailableModels.svelte";
import { installObsidianFetch } from "../../lib/obsidianFetch";
import type SecondBrainPlugin from "../../main";
import {
	type PluginIntegration,
	confirmEnableIntegrationPrivacy,
	getPluginIcon,
	skillIcon,
	coreSkillRank,
	toExecToolId,
} from "../../agent/integrations/pluginIntegrations";
import { DEFAULT_AGENT_PROMPT } from "../../agent/prompts";
import { normalizeShipped } from "../../utils/shippedDefaults";
import { agentDefinitionPath, agentDir } from "../../utils/agentPaths";
import { Logger } from "../../utils/logging";
import { extractErrorMessage } from "../../utils/errorMessage";
import { humanizeSkillName } from "../../skills";
import {
	DEFAULT_AGENT_ICON,
	type AgentConfig,
	type BuiltInToolId,
	type MCPServerConfig,
	type SkillDisplayInfo,
} from "../../types/plugin";
import { getProviderDefinition } from "../../providers/index";
import { buildPersistedChatModel } from "../../utils/persistedChatModel";
import { getData } from "../../stores/dataStore.svelte";

interface Props {
	modal: Modal;
	plugin: SecondBrainPlugin;
	agentId: string;
}

let { modal, plugin, agentId }: Props = $props();

const pluginData = getData();
const models = useAvailableModels();

const POPULAR_AGENT_ICONS = [
	"bot",
	"brain",
	"sparkles",
	"search",
	"book-open",
	"briefcase",
	"messages-square",
	"lightbulb",
	"compass",
	"folders",
	"file-text",
	"workflow",
] as const;

// getIconIds() returns lucide icons with a "lucide-" prefix, but setIcon (and every
// stored agent icon, e.g. DEFAULT_AGENT_ICON "brain") uses the unprefixed name — strip it.
const BUILT_IN_AGENT_ICONS = Array.from(new Set(getIconIds().map((id) => id.replace(/^lucide-/, "")))).sort(
	(left, right) => left.localeCompare(right),
);

let agents = $derived(pluginData.agents);
let selectedAgent = $derived(agents[agentId]);
let agentIconQuery = $state("");
let isAgentIconPickerOpen = $state(false);

function applyChanges() {
	plugin.agentManager?.invalidateAgentRunnable(agentId);
}

function updateAgentName(name: string) {
	// Capture the agent folder's current path (derived from the OLD name) before committing
	// the rename, then move the folder — AGENT.md and all — to the new name-based path.
	const oldDir = agentDir(agentId);
	pluginData.updateAgent(agentId, { name });
	void plugin.promptFilesService?.renameAgentDir(agentId, oldDir);
	modal.setTitle(`Edit Agent: ${name || "未命名"}`);
}

function updateAgentIcon(icon: string) {
	const trimmed = icon.trim();
	const isValid = trimmed.length > 0 && BUILT_IN_AGENT_ICONS.includes(trimmed);
	const nextIcon = isValid ? trimmed : DEFAULT_AGENT_ICON;
	pluginData.updateAgent(agentId, { icon: nextIcon });
}

const selectedAgentIcon = $derived(selectedAgent?.icon?.trim() || DEFAULT_AGENT_ICON);

const matchingAgentIcons = $derived.by(() => {
	const query = agentIconQuery.trim().toLowerCase();
	if (!query) {
		return Array.from(POPULAR_AGENT_ICONS);
	}

	return BUILT_IN_AGENT_ICONS.filter((iconName) => iconName.toLowerCase().includes(query)).slice(0, 72);
});

const matchingAgentIconCount = $derived.by(() => {
	const query = agentIconQuery.trim().toLowerCase();
	if (!query) {
		return POPULAR_AGENT_ICONS.length;
	}

	return BUILT_IN_AGENT_ICONS.reduce((count, iconName) => {
		return iconName.toLowerCase().includes(query) ? count + 1 : count;
	}, 0);
});

const currentModelDisplay = $derived.by(() => {
	if (!selectedAgent?.chatModel) return null;
	const providerDef = getProviderDefinition(selectedAgent.chatModel.provider, pluginData.getAllProviderMeta());
	return {
		model: selectedAgent.chatModel.model,
		logo: providerDef && "logo" in providerDef && providerDef.logo ? providerDef.logo : GenericAIIcon,
	};
});

const currentSummarizationModelDisplay = $derived.by(() => {
	if (!selectedAgent?.summarizationModel) return null;
	const providerDef = getProviderDefinition(
		selectedAgent.summarizationModel.provider,
		pluginData.getAllProviderMeta(),
	);
	return {
		model: selectedAgent.summarizationModel.model,
		logo: providerDef && "logo" in providerDef && providerDef.logo ? providerDef.logo : GenericAIIcon,
	};
});

const currentTitleModelDisplay = $derived.by(() => {
	if (!selectedAgent?.titleModel) return null;
	const providerDef = getProviderDefinition(selectedAgent.titleModel.provider, pluginData.getAllProviderMeta());
	return {
		model: selectedAgent.titleModel.model,
		logo: providerDef && "logo" in providerDef && providerDef.logo ? providerDef.logo : GenericAIIcon,
	};
});

function formatContextWindowLabel(tokens: number): string {
	if (tokens >= 1000) {
		const rounded = Number.isInteger(tokens / 1000) ? String(tokens / 1000) : (tokens / 1000).toFixed(1);
		return `${rounded}k`;
	}
	return `${tokens}`;
}

const summarizationContextWindowWarning = $derived.by(() => {
	const chatContextWindow = selectedAgent?.chatModel?.modelConfig?.contextWindow;
	const summarizationContextWindow = selectedAgent?.summarizationModel?.modelConfig?.contextWindow;
	if (!chatContextWindow || !summarizationContextWindow) return null;
	if (summarizationContextWindow >= chatContextWindow) return null;
	return `This summarization model has a smaller context window (${formatContextWindowLabel(summarizationContextWindow)}) than the chat model (${formatContextWindowLabel(chatContextWindow)}), so history compaction may fail earlier.`;
});

function openModelSelectionModal() {
	const currentSelection = selectedAgent?.chatModel
		? { provider: selectedAgent.chatModel.provider, model: selectedAgent.chatModel.model }
		: null;
	new ModelSelectionModal(plugin, "chat", currentSelection, (selected) => {
		if (!selected) return;
		pluginData.updateAgent(agentId, {
			chatModel: buildPersistedChatModel(selected.provider, selected.model, selectedAgent?.chatModel),
		});
		void applyChanges();
	}).open();
}

function openSummarizationModelSelectionModal() {
	const currentSelection = selectedAgent?.summarizationModel
		? {
				provider: selectedAgent.summarizationModel.provider,
				model: selectedAgent.summarizationModel.model,
			}
		: null;
	new ModelSelectionModal(plugin, "chat", currentSelection, (selected) => {
		if (!selected) return;
		pluginData.updateAgent(agentId, {
			summarizationModel: buildPersistedChatModel(
				selected.provider,
				selected.model,
				selectedAgent?.summarizationModel,
			),
		});
		void applyChanges();
	}).open();
}

function resetSummarizationModel() {
	pluginData.updateAgent(agentId, { summarizationModel: null });
	void applyChanges();
}

function openTitleModelSelectionModal() {
	const currentSelection = selectedAgent?.titleModel
		? {
				provider: selectedAgent.titleModel.provider,
				model: selectedAgent.titleModel.model,
			}
		: null;
	new ModelSelectionModal(plugin, "chat", currentSelection, (selected) => {
		if (!selected) return;
		pluginData.updateAgent(agentId, {
			titleModel: buildPersistedChatModel(selected.provider, selected.model, selectedAgent?.titleModel),
		});
		void applyChanges();
	}).open();
}

function resetTitleModel() {
	pluginData.updateAgent(agentId, { titleModel: null });
	void applyChanges();
}

function openAgentNote() {
	if (!selectedAgent) return;
	const path = normalizePath(agentDefinitionPath(agentId));
	// Seed the file from the default if it doesn't exist yet (e.g. an agent created this
	// session, before init-time seeding runs), then open it.
	void (async () => {
		await plugin.promptFilesService?.ensureAgentPrompt(agentId);
		modal.close();
		plugin.app.workspace.openLinkText(path, "", true);
	})();
}

// Whether this agent's definition note has drifted from the shipped default. Reads the
// prompt-file cache, which is reactive (kept fresh by writes and the vault-change handler), so
// "使用默认值" in the diff modal hides the button again. When false, we hide the "Diff with
// default" button — matching the skill guidance behaviour (diff only shown when drifted).
const promptDrifted = $derived.by(() => {
	if (!selectedAgent) return false;
	const content = plugin.promptFilesService?.getAgentPrompt(agentId) ?? DEFAULT_AGENT_PROMPT;
	// Same normalization the shipped-default check uses, so a file that differs only by
	// line endings or a trailing newline doesn't offer a diff against identical text.
	return normalizeShipped(content) !== normalizeShipped(DEFAULT_AGENT_PROMPT);
});

function openPromptDiff() {
	if (!selectedAgent) return;
	// Delegate rather than rebuild the modal here: AgentManager owns the save contract
	// (invalidate caches on success, surface a Notice on failure), and duplicating it was
	// how this call site ended up silently swallowing write errors.
	plugin.agentManager?.openSystemPromptDiff(agentId);
}

function openRenderedSystemPromptModal() {
	if (!selectedAgent) return;
	new SystemPromptModal(
		plugin,
		{ getPrompt: async () => plugin.agentManager.assembleSystemPrompt() },
		{
			title: "最终系统提示词",
			description:
				"预览注入动态工具指引与技能后完整组装的系统提示词。",
			readOnly: true,
		},
	).open();
}

let skillsRefreshCounter = $state(0);

const skills = $derived.by(() => {
	const _refresh = skillsRefreshCounter;
	const skillsService = plugin.skillsService;
	if (!skillsService?.isDiscovered()) return [];
	const cachedSkills = skillsService.getCachedSkills();
	const agentSkills = selectedAgent?.skills ?? {};
	const result: SkillDisplayInfo[] = [];
	for (const [skillName, metadata] of cachedSkills) {
		const displayName = humanizeSkillName(metadata.frontmatter.name);
		result.push({
			id: skillName,
			displayName,
			description: metadata.frontmatter.description,
			enabled: agentSkills[skillName]?.enabled ?? true,
			category: metadata.category ?? "custom",
			corePluginId: metadata.corePluginId,
			linkedPluginId: metadata.linkedPluginId,
		});
	}
	return result;
});

// Core skills: the S2B built-in skills first (fixed order), then Obsidian core-plugin
// skills (Canvas, Bases, …). Shares coreSkillRank with the agents-summary icon strip so
// the two never drift.
const coreSkills = $derived(
	skills.filter((skill) => skill.category === "core").sort((a, b) => coreSkillRank(a) - coreSkillRank(b)),
);
// Community-plugin skills are only shown when their linked plugin is actually installed
// in this vault. A skill for an uninstalled plugin has no working exec tool and nothing
// the user can act on, so it is hidden entirely (installed-but-disabled still shows,
// with a "未启用" affordance).
const pluginSkills = $derived(skills.filter((skill) => skill.category === "plugin" && isSkillPluginInstalled(skill)));
const customSkills = $derived(skills.filter((skill) => skill.category === "custom"));

async function refreshSkillsList() {
	await plugin.skillsService?.discoverSkills();
	skillsRefreshCounter++;
}

onMount(() => {
	modal.setTitle(`Edit Agent: ${selectedAgent?.name ?? "智能体"}`);
	void refreshSkillsList();

	// A plugin installed/enabled in Obsidian's settings while this modal is open won't
	// show up until we re-resolve integrations (resolvePluginIntegrations reads live
	// app.plugins state, not a Svelte signal). Obsidian's community-plugin manager emits
	// an untyped "changed" event on install/enable/disable — subscribe to it so new
	// api-plugins auto-discover here immediately, not only after an Obsidian reload.
	const refresh = () => {
		void refreshSkillsList();
	};
	// @ts-ignore - app.plugins is not in the official Obsidian types
	const pluginManager = plugin.app.plugins as
		| { on?: (name: string, cb: () => void) => unknown; offref?: (ref: unknown) => void }
		| undefined;
	const changeRef = pluginManager?.on?.("changed", refresh);
	// Fallback for returning from an external window; harmless duplicate refresh otherwise.
	window.addEventListener("focus", refresh);
	return () => {
		if (changeRef) pluginManager?.offref?.(changeRef);
		window.removeEventListener("focus", refresh);
	};
});

// Skills are real vault notes now, so "edit" just opens the SKILL.md in Obsidian rather
// than a bespoke editor modal. Close this modal first so the note is visible in the workspace.
function openSkillNote(skillId: string) {
	const metadata = plugin.skillsService?.getCachedSkills().get(skillId);
	if (!metadata) {
		new Notice("找不到该技能的文件。");
		return;
	}
	const skillPath = normalizePath(`${metadata.path}/SKILL.md`);
	modal.close();
	plugin.app.workspace.openLinkText(skillPath, "", true);
}

function openAddSkillModal() {
	new AddSkillModal(plugin, agentId, async () => {
		await refreshSkillsList();
		await applyChanges();
	}).open();
}

function isPluginInstalled(pluginId: string): boolean {
	return plugin.agentManager?.isPluginInstalled(pluginId) ?? false;
}

function isPluginEnabled(pluginId: string): boolean {
	return plugin.agentManager?.isPluginEnabled(pluginId) ?? false;
}

function isInternalPluginEnabled(pluginId: string): boolean {
	const checker = plugin.agentManager?.isInternalPluginEnabled;
	return typeof checker === "function" ? checker.call(plugin.agentManager, pluginId) : false;
}

function isSkillPluginAvailable(skill: SkillDisplayInfo): boolean {
	if (skill.corePluginId) return isInternalPluginEnabled(skill.corePluginId);
	if (skill.linkedPluginId) return isPluginEnabled(skill.linkedPluginId);
	return true;
}

function isSkillPluginInstalled(skill: SkillDisplayInfo): boolean {
	if (skill.corePluginId) return true;
	if (skill.linkedPluginId) return isPluginInstalled(skill.linkedPluginId);
	return true;
}

async function toggleSkill(skillId: string, newEnabled: boolean) {
	const skill = skills.find((entry) => entry.id === skillId);
	if (!skill) return;
	if (skill.category !== "custom") {
		const linkedPlugin = plugin.skillsService?.getCachedSkills().get(skillId)?.linkedPluginId;
		if (linkedPlugin) {
			if (!plugin.agentManager?.isPluginInstalled(linkedPlugin)) {
				showActionNotice(
					`The ${skill.displayName} plugin isn't installed yet.`,
					obsidianSettingsAction("community-plugins", "浏览社区插件"),
				);
				return;
			}
			if (!plugin.agentManager?.isPluginEnabled(linkedPlugin)) {
				showActionNotice(
					`The ${skill.displayName} plugin is installed but not enabled.`,
					obsidianSettingsAction("community-plugins", "打开社区插件"),
				);
				return;
			}
		}
	}
	// Bundle code-exec with the skill: if the linked plugin exposes a callable `.api`, enabling
	// the skill also grants API scripting (unsandboxed, bypasses per-provider privacy rules —
	// see createPluginApiExecTool), and disabling revokes it. Warn before granting it; a cancel
	// here still enables the skill itself, just without the exec tool bundled on.
	const integration = skillExecIntegration(skill);
	const grantsExec = newEnabled && !!integration;
	if (grantsExec && !(await confirmEnableIntegrationPrivacy(plugin.app, pluginData, skill.displayName))) {
		return;
	}

	pluginData.setAgentSkillEnabled(agentId, skillId, newEnabled);
	if (integration) {
		pluginData.setAgentPluginExecEnabled(agentId, toExecToolId(integration.pluginId), newEnabled);
	}
	void applyChanges();
}

async function deleteSkill(skillId: string) {
	const skill = skills.find((entry) => entry.id === skillId);
	if (!skill || skill.category !== "custom") return;
	await plugin.skillsService?.deleteSkill(skillId);
	await refreshSkillsList();
	await applyChanges();
}

function openPluginPage(pluginId: string) {
	window.open(`obsidian://show-plugin?id=${pluginId}`);
}

// --- Per-plugin code-exec integrations (bundled with the linked skill's toggle) ---

// Map of pluginId → integration, for plugins that currently expose a callable `.api`.
// A plugin skill whose linkedPluginId is present here gains code-exec scripting when
// the skill is enabled (see toggleSkill), so the skill and its code-exec share one switch.
const execIntegrationsByPlugin = $derived.by<Map<string, PluginIntegration>>(() => {
	// resolvePluginIntegrations() reads live app.plugins state, which is not a Svelte
	// signal — depend on skillsRefreshCounter so newly installed/enabled plugins get
	// picked up when we refresh (e.g. on window focus after returning from Obsidian's
	// plugin settings), not only after a full modal recreation / Obsidian reload.
	const _refresh = skillsRefreshCounter;
	const resolved = plugin.agentManager?.resolvePluginIntegrations() ?? [];
	return new Map(resolved.map((integ) => [integ.pluginId, integ]));
});

function skillExecIntegration(skill: SkillDisplayInfo): PluginIntegration | undefined {
	if (!skill.linkedPluginId) return undefined;
	return execIntegrationsByPlugin.get(skill.linkedPluginId);
}

// Plugin api-integrations with NO skill covering them yet — both curated integrations
// whose (community-plugin) skill hasn't been seeded and auto-discovered plugins exposing
// a public api. These render as inline rows in the Integrations list. Enabling one seeds
// its skill (prewritten bundled skill if available, else an introspect-first template)
// linked to it, then enables that skill plus its own exec_<plugin> tool — after which the
// plugin renders as a normal curated Plugin Skills row (editable) and drops out of this list.
interface AutoIntegrationDisplay {
	pluginId: string;
	displayName: string;
	execEnabled: boolean;
}

const autoDiscoveredIntegrations = $derived.by<AutoIntegrationDisplay[]>(() => {
	const execState = selectedAgent?.pluginExecTools ?? {};
	// A plugin is "covered" by a skill if any discovered skill links to it.
	const coveredPluginIds = new Set(
		skills.map((skill) => skill.linkedPluginId).filter((id): id is string => Boolean(id)),
	);
	const result: AutoIntegrationDisplay[] = [];
	for (const integ of execIntegrationsByPlugin.values()) {
		// Covered iff a skill is actually on disk linking this plugin. Curated integrations
		// (dataview/tasks/tasknotes) are no longer seeded at startup, so until the user
		// enables one it has no covering skill and belongs in this list — enabling it seeds
		// the prewritten skill (or a template) via seedIntegrationSkill.
		if (coveredPluginIds.has(integ.pluginId)) continue;
		result.push({
			pluginId: integ.pluginId,
			displayName: integ.displayName,
			execEnabled: execState[toExecToolId(integ.pluginId)] ?? false,
		});
	}
	return result;
});

async function toggleAutoIntegration(pluginId: string, displayName: string, newEnabled: boolean) {
	if (newEnabled) {
		// Unsandboxed main-thread `app` access bypasses per-provider privacy rules — warn
		// before seeding anything so a cancel leaves no skill and no exec tool enabled.
		if (!(await confirmEnableIntegrationPrivacy(plugin.app, pluginData, displayName))) return;

		// Seed the integration's skill on demand (prewritten if bundled, else an
		// introspect-first template), then enable it alongside the exec tool. Re-discover
		// so the new skill enters the cache and the row re-renders as a curated Plugin Skill.
		let skillId = skills.find((skill) => skill.linkedPluginId === pluginId)?.id;
		if (!skillId) {
			const service = plugin.skillsService;
			if (!service) {
				new Notice("技能仍在初始化，请稍后重试。");
				return;
			}
			try {
				skillId = (await service.seedIntegrationSkill(pluginId, displayName)) ?? undefined;
			} catch (error) {
				Logger.error(`[AgentEditor] seedIntegrationSkill failed for ${pluginId}:`, error);
				new Notice(`Could not create skill for ${displayName}: ${extractErrorMessage(error)}`);
				return;
			}
			if (!skillId) {
				new Notice(`Could not create skill for ${displayName}.`);
				return;
			}
			// Re-discover so the new skill enters the cache; without this the enable below
			// targets a skillId the reactive `skills` list doesn't know about yet, so the row
			// wouldn't flip to a curated Plugin Skill.
			await refreshSkillsList();
		}
		pluginData.setAgentSkillEnabled(agentId, skillId, true);
		pluginData.setAgentPluginExecEnabled(agentId, toExecToolId(pluginId), true);
	} else {
		// Only revoke the exec tool; leave any seeded skill file in place for reuse.
		pluginData.setAgentPluginExecEnabled(agentId, toExecToolId(pluginId), false);
	}
	void applyChanges();
}

function getMCPToolsBadgeLabel(serverId: string, toolsState?: MCPServerToolsState): string {
	if (toolsState?.loading) return "正在加载工具";
	if (toolsState?.error) return "工具加载失败";
	if (toolsState?.tools) return `${toolsState.tools.length} tools`;
	return "加载工具";
}

function getToolEnabled(toolId: BuiltInToolId): boolean {
	return pluginData.isAgentToolEnabled(agentId, toolId);
}

/** Icon for a core-skill row (shared with the agents-list strip via `skillIcon`). */
function coreSkillIcon(skill: SkillDisplayInfo): string {
	return skillIcon(skill);
}

function openToolsModal() {
	if (!selectedAgent) return;
	new ToolsModal(plugin, agentId, { onChange: () => void applyChanges() }).open();
}

// --- Subagents (references to other agents) ---

const subAgentIds = $derived(selectedAgent?.subAgentIds ?? []);

/**
 * Agents that can be enabled as subagents. Includes this agent itself (an
 * isolated-context copy is a valid delegation target); self is sorted first.
 */
const subAgentCandidates = $derived(
	Object.values(agents).sort((l, r) => {
		if (l.id === agentId) return -1;
		if (r.id === agentId) return 1;
		return l.name.localeCompare(r.name);
	}),
);

function isSubAgentEnabled(refId: string): boolean {
	return subAgentIds.includes(refId);
}

function handleSubAgentToggle(refId: string) {
	pluginData.toggleSubAgentRef(agentId, refId);
	void applyChanges();
}

function getSubAgentModelLabel(agent: AgentConfig): string {
	const model = agent.chatModel ? agent.chatModel.model : "未配置模型";
	return agent.id === agentId ? `${model} · isolated copy of this agent` : model;
}

let mcpServerIds = $derived(selectedAgent ? Object.keys(selectedAgent.mcpServers) : []);

interface MCPToolInfo {
	name: string;
	description?: string;
}

interface MCPServerToolsState {
	loading: boolean;
	error: string | null;
	tools: MCPToolInfo[];
}

let mcpServerTools = $state<Record<string, MCPServerToolsState>>({});
let expandedServerId = $state<string | null>(null);

function openAddMCPServer() {
	new MCPServerModal(
		plugin,
		null,
		null,
		(serverId: string, config: MCPServerConfig) => {
			pluginData.setAgentMCPServer(agentId, serverId, config);
			void applyChanges();
		},
		{ hasServer: (serverId: string) => Boolean(selectedAgent?.mcpServers[serverId]) },
	).open();
}

function openEditMCPServer(serverId: string) {
	const config = selectedAgent?.mcpServers[serverId];
	if (!config) return;
	new MCPServerModal(
		plugin,
		serverId,
		config,
		(newServerId: string, updatedConfig: MCPServerConfig) => {
			// A rename re-keys the entry: drop the old id, then write the new one.
			if (newServerId !== serverId) {
				pluginData.deleteAgentMCPServer(agentId, serverId);
			}
			pluginData.setAgentMCPServer(agentId, newServerId, updatedConfig);
			void applyChanges();
		},
		{ hasServer: (candidateId: string) => Boolean(selectedAgent?.mcpServers[candidateId]) },
		(deletedServerId: string) => {
			pluginData.deleteAgentMCPServer(agentId, deletedServerId);
			void applyChanges();
		},
	).open();
}

function toggleMCPServer(serverId: string) {
	pluginData.toggleAgentMCPServerEnabled(agentId, serverId);
	void applyChanges();
}

function buildMCPConfig(serverId: string, config: MCPServerConfig) {
	return {
		mcpServers: {
			[serverId]: { transport: "http" as const, url: config.url, headers: config.headers },
		},
	};
}

async function fetchServerTools(serverId: string) {
	const config = selectedAgent?.mcpServers[serverId];
	if (!config) return;
	mcpServerTools[serverId] = { loading: true, error: null, tools: [] };
	try {
		const patch = installObsidianFetch();
		try {
			const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
			const mcpClient = new MultiServerMCPClient(buildMCPConfig(serverId, config));
			const tools = await mcpClient.getTools();
			mcpServerTools[serverId] = {
				loading: false,
				error: null,
				tools: tools.map((tool) => ({
					name: tool.name,
					description: (tool as { description?: string }).description,
				})),
			};
		} finally {
			patch.release();
		}
	} catch (err) {
		mcpServerTools[serverId] = {
			loading: false,
			error: err instanceof Error ? err.message : "获取工具失败",
			tools: [],
		};
	}
}

function toggleToolsList(serverId: string) {
	if (expandedServerId === serverId) {
		expandedServerId = null;
	} else {
		expandedServerId = serverId;
		if (!mcpServerTools[serverId] || mcpServerTools[serverId].error) {
			void fetchServerTools(serverId);
		}
	}
}

function getServerToolsState(serverId: string): MCPServerToolsState | undefined {
	return mcpServerTools[serverId];
}

// The Memory card's manage_notes dependency is surfaced as a badge (see below).
</script>

{#if selectedAgent}
  <div class="agent-editor-container">
    <div class="agent-editor-pane">
      <SettingGroup heading="常规">
        <SettingItem name="名称" desc="此智能体的显示名称与图标">
          <PickerPopover
            bind:open={isAgentIconPickerOpen}
            triggerClass="agent-icon-trigger"
            contentClass="agent-icon-popover"
            tooltip="更换图标"
            side="bottom"
            align="start"
            sideOffset={8}
          >
            {#snippet trigger()}
              <span class="agent-icon-trigger-preview">
                <Icon name={selectedAgentIcon} size="m" />
              </span>
            {/snippet}

            <div class="agent-icon-browser">
              <Search
                class="agent-icon-search"
                value={agentIconQuery}
                placeholder="搜索内置图标"
                onchange={(value: string) => (agentIconQuery = value)}
              />

              <div class="agent-icon-results-header">
                <span>{agentIconQuery.trim() ? `Built-in icons (${matchingAgentIconCount})` : "常用图标"}</span>
              </div>

              <div class="agent-icon-grid">
                {#if matchingAgentIcons.length > 0}
                  {#each matchingAgentIcons as iconName}
                    <button
                      type="button"
                      class="agent-icon-option"
                      class:selected={selectedAgentIcon === iconName}
                      title={iconName}
                      onclick={() => {
                        updateAgentIcon(iconName);
                        isAgentIconPickerOpen = false;
                      }}
                    >
                      <span class="agent-icon-option-preview">
                        <Icon name={iconName} size="s" />
                      </span>
                      <span class="agent-icon-option-label">{iconName}</span>
                    </button>
                  {/each}
                {:else}
                  <div class="agent-icon-empty-state">
                    No built-in icons match this search.
                  </div>
                {/if}
              </div>
            </div>
          </PickerPopover>

          <Text
            inputType="text"
            class="agent-overview-name-input"
            placeholder="智能体名称"
            value={selectedAgent.name}
            onblur={(value: string) => updateAgentName(value)}
          />
        </SettingItem>

        <SettingItem name="聊天模型" desc="此智能体用于对话的主模型">
          <ModelSettingControl
            available={models.hasProviders && models.hasModels}
            loading={models.hasProviders && models.isLoadingModels}
            configureLabel={!models.hasProviders ? "配置服务商" : "配置模型"}
            unavailableHint={!models.hasProviders ? "尚未配置 AI 服务商。" : undefined}
            onConfigure={() => models.openSettings(() => modal.close())}
            placeholder="选择模型"
            selectedLabel={currentModelDisplay?.model ?? null}
            selectedLogo={currentModelDisplay?.logo ?? null}
            onSelect={openModelSelectionModal}
          />
        </SettingItem>

        <!-- The agent's whole definition is one note: base instructions, the current-date
             section, and the memory section, with live values written as placeholders that
             assembly substitutes. There is no memory toggle — an agent participates in memory
             iff its note still has the `# Memory` section, which the user can simply delete.
             The memory FOLDER (Agents/Memories/) stays global, shared by every agent, because
             remembered facts are properties of the user, not of one agent. -->
        <SettingItem
          name="系统提示词"
          desc="此智能体的指令（含记忆使用方式），作为独立的 AGENT.md 笔记存放在仓库中"
        >
          <div class="flex items-center gap-2 justify-end">
            <Button
              iconId="pencil"
              ariaLabel="打开智能体笔记"
              tooltip="打开智能体笔记"
              onClick={openAgentNote}
            />
            {#if promptDrifted}
              <Button buttonText="与默认对比" onClick={openPromptDiff} />
            {/if}
            <Button
              iconId="eye"
              ariaLabel="查看最终组装的提示词"
              tooltip="查看最终组装的提示词"
              onClick={openRenderedSystemPromptModal}
            />
          </div>
        </SettingItem>

        <!-- Tools are a pool shared across skills via `allowed-tools`, not owned by any one skill
             (e.g. the Tasks integration skill attaches search_notes, already attached by Explore
             vault) — so configuration lives here at the agent level rather than behind any single
             skill's row. -->
        <SettingItem
          name="工具"
          desc="启用、重命名并配置技能附带的各个工具。只有当至少一个已启用技能提供该工具时，它才可用。"
        >
          <Button buttonText="管理" onClick={openToolsModal} />
        </SettingItem>

        <SettingItem
          name="总结模型"
          desc="上下文窗口占满时用于压缩较早聊天记录的模型"
        >
          <div class="agent-model-setting">
            <ModelSettingControl
              available={models.hasProviders && models.hasModels}
              loading={models.hasProviders && models.isLoadingModels}
              configureLabel={!models.hasProviders ? "配置服务商" : "配置模型"}
              unavailableHint={!models.hasProviders
                ? "尚未配置 AI 服务商。"
                : undefined}
              onConfigure={() => models.openSettings(() => modal.close())}
              placeholder="自动（同聊天模型）"
              selectedLabel={currentSummarizationModelDisplay?.model ?? null}
              selectedLogo={currentSummarizationModelDisplay?.logo ?? null}
              onSelect={openSummarizationModelSelectionModal}
              secondaryLabel={selectedAgent.summarizationModel ? "重置" : undefined}
              onSecondary={selectedAgent.summarizationModel ? resetSummarizationModel : undefined}
            />
            {#if summarizationContextWindowWarning}
              <div class="agent-model-warning text-sm">{summarizationContextWindowWarning}</div>
            {/if}
          </div>
        </SettingItem>

        <SettingItem
          name="标题生成模型"
          desc="根据第一条用户消息生成对话标题的模型"
        >
          <ModelSettingControl
            available={models.hasProviders && models.hasModels}
            loading={models.hasProviders && models.isLoadingModels}
            configureLabel={!models.hasProviders ? "配置服务商" : "配置模型"}
            unavailableHint={!models.hasProviders ? "尚未配置 AI 服务商。" : undefined}
            onConfigure={() => models.openSettings(() => modal.close())}
            placeholder="自动（同聊天模型）"
            selectedLabel={currentTitleModelDisplay?.model ?? null}
            selectedLogo={currentTitleModelDisplay?.logo ?? null}
            onSelect={openTitleModelSelectionModal}
            secondaryLabel={selectedAgent.titleModel ? "重置" : undefined}
            onSecondary={selectedAgent.titleModel ? resetTitleModel : undefined}
          />
        </SettingItem>
      </SettingGroup>

      <SettingGroup heading="核心技能">
        <div class="setting-item agent-section-intro">
          <div class="setting-item-info">
            <div class="setting-item-description">
              Built-in skills every agent can use — vault exploration, note editing, web access, and
              skill management. Each is a skill: toggle it to attach its tools, or open its note to
              edit its instructions. Individual tools are configured from the Tools row above.
              <DocsLink variant="inline" doc="skills" />
            </div>
          </div>
        </div>

        <!-- One row per core skill: the bundled explore-vault/manage-notes/web/manage-skills skills
             (which attach built-in tools via allowed-tools) plus Obsidian core-plugin skills (Canvas, Bases, …).
             Per-tool configuration lives in the agent-level Tools modal (General section), not here —
             a skill's attached tools may be shared with other skills, so tool config isn't a
             per-skill concern. -->
        {#each coreSkills as ext (ext.id)}
          {@const pluginAvailable = isSkillPluginAvailable(ext)}
          <SettingItem name={ext.displayName} desc={ext.description}>
            {#snippet namePrefix()}
              <Icon name={coreSkillIcon(ext)} size="s" />
            {/snippet}
            {#snippet nameSuffix()}
              {#if !pluginAvailable}
                <Badge label="核心插件已禁用" tone="warning" />
              {/if}
            {/snippet}
            <Button
              iconId="pencil"
              ariaLabel={`Open ${ext.displayName} skill note`}
              tooltip={`Open ${ext.displayName} skill note`}
              onClick={() => openSkillNote(ext.id)}
            />
            <Toggle
              checked={ext.enabled && pluginAvailable}
              disabled={!pluginAvailable}
              onchange={() => void toggleSkill(ext.id, !ext.enabled)}
            />
          </SettingItem>
        {/each}
      </SettingGroup>

      <SettingGroup heading="集成">
        <div class="setting-item agent-section-intro">
          <div class="setting-item-info">
            <div class="setting-item-description">
              Skills backed by your installed community plugins. Each bundles a skill (and, where
              available, code-scripting) behind one switch.
              <DocsLink variant="inline" doc="integrations" />
            </div>
          </div>
        </div>

        <!-- One row per community-plugin skill (Dataview, Tasks, …). -->
        {#each pluginSkills as ext (ext.id)}
          {@const pluginAvailable = isSkillPluginAvailable(ext)}
          {@const execIntegration = skillExecIntegration(ext)}
          <SettingItem name={ext.displayName} desc={ext.description}>
            {#snippet namePrefix()}
              <Icon name={getPluginIcon(ext.linkedPluginId)} size="s" />
            {/snippet}
            {#snippet nameSuffix()}
              {#if !pluginAvailable}
                <Badge
                  label="未启用"
                  tone="warning"
                  interactive
                  onclick={() => openPluginPage(ext.linkedPluginId ?? ext.id)}
                />
              {:else if execIntegration && ext.enabled}
                <Badge label="API 脚本" tone="muted" />
              {/if}
            {/snippet}
            <Button
              iconId="pencil"
              ariaLabel={`Open ${ext.displayName} skill note`}
              tooltip={`Open ${ext.displayName} skill note`}
              onClick={() => openSkillNote(ext.id)}
            />
            <!-- Keyed on the enabled state: toggleSkill can reject asynchronously (the
                 privacy-warning modal's Cancel) when this row grants an exec tool, and
                 Toggle's `checked` is $bindable — a one-way prop only seeds its initial
                 value, so without a remount the switch would stay visually flipped after
                 a cancel even though the underlying skill/exec state reverted. -->
            {#key ext.enabled && pluginAvailable}
              <Toggle
                checked={ext.enabled && pluginAvailable}
                disabled={!pluginAvailable}
                onchange={() => void toggleSkill(ext.id, !ext.enabled)}
              />
            {/key}
          </SettingItem>
        {/each}

        <!-- Auto-discovered api-plugins with no skill yet. Enabling generates one. -->
        {#each autoDiscoveredIntegrations as integ (integ.pluginId)}
          <SettingItem
            name={integ.displayName}
            desc="自动发现暴露公开 API 的插件。启用后会创建一个可编辑的 API 脚本技能——智能体会在调用前探查该 API。运行于主线程（非沙箱）。"
          >
            {#snippet namePrefix()}
              <Icon name={getPluginIcon(integ.pluginId)} size="s" />
            {/snippet}
            {#snippet nameSuffix()}
              {#if integ.execEnabled}
                <Badge label="API 脚本" tone="muted" />
              {/if}
            {/snippet}
            <!--
              Toggle's `checked` is $bindable, so a plain one-way `checked={...}` only seeds
              its initial value — the child's own state never re-syncs afterward. That's fine
              for a synchronous onchange, but toggleAutoIntegration can reject asynchronously
              (the privacy-warning modal's Cancel), which would otherwise leave the switch
              visually on while the underlying pluginExecTools value is back to false. Keying
              on execEnabled forces a remount so the toggle re-reads the real state.
            -->
            {#key integ.execEnabled}
              <Toggle
                checked={integ.execEnabled}
                onchange={(next) => void toggleAutoIntegration(integ.pluginId, integ.displayName, next)}
              />
            {/key}
          </SettingItem>
        {/each}
      </SettingGroup>

      <SettingGroup heading="子智能体">
        <div class="setting-item agent-section-intro">
          <div class="setting-item-info">
            <div class="setting-item-description">
              Other agents this one can delegate to via the <code>task</code> tool — each subagent
              runs with its own model, tools, and prompt. Enabling this agent itself delegates to a
              fresh, isolated-context copy of it (useful for keeping the main conversation clean).
              Delegation is one level deep (a subagent's own subagents are ignored).
            </div>
          </div>
        </div>

        {#each subAgentCandidates as candidate (candidate.id)}
          {@const hasModel = !!candidate.chatModel}
          {@const isEnabled = isSubAgentEnabled(candidate.id)}
          <SettingItem
            name={candidate.id === agentId ? `${candidate.name} (this agent)` : candidate.name}
            desc={hasModel
              ? getSubAgentModelLabel(candidate)
              : "未配置聊天模型，无法用作子智能体"}
          >
            {#snippet namePrefix()}
              <Icon name={candidate.icon?.trim() || DEFAULT_AGENT_ICON} size="s" />
            {/snippet}
            <Toggle
              checked={isEnabled}
              disabled={!hasModel && !isEnabled}
              onchange={() => handleSubAgentToggle(candidate.id)}
            />
          </SettingItem>
        {/each}
      </SettingGroup>

      <SettingGroup heading="自定义">
        <div class="setting-item agent-section-intro">
          <div class="setting-item-info">
            <div class="setting-item-description">
              Skills you bring yourself — your own skills and MCP servers.
            </div>
          </div>
        </div>

        <!-- Custom skills — the user's own skills + MCP servers, each sub-group with its
             own "添加" button on the heading row. -->
        <SettingContainer name="技能" isHeading>
          <Button buttonText="添加技能" onClick={openAddSkillModal} />
        </SettingContainer>
        {#each customSkills as ext (ext.id)}
          <ManagedEntityItem
            class="skill-entity"
            name={ext.displayName}
            desc={ext.description}
          >
            {#snippet actions()}
              <Button
                iconId="trash"
                ariaLabel={`Delete ${ext.displayName}`}
                tooltip={`Delete ${ext.displayName}`}
                onClick={() => void deleteSkill(ext.id)}
              />
              <Button
                iconId="pencil"
                ariaLabel={`Open ${ext.displayName} skill note`}
                tooltip={`Open ${ext.displayName} skill note`}
                onClick={() => openSkillNote(ext.id)}
              />
              <!-- See the pluginSkills row above for why this is keyed: toggleSkill can
                   reject asynchronously if a hand-edited custom skill carries a
                   linkedPluginId (metadata.category overridden to "custom"). -->
              {#key ext.enabled}
                <Toggle checked={ext.enabled} onchange={() => void toggleSkill(ext.id, !ext.enabled)} />
              {/key}
            {/snippet}
          </ManagedEntityItem>
        {/each}
        {#if customSkills.length === 0}
          <div class="setting-item-description skill-empty-state">暂无自定义技能</div>
        {/if}

        <!-- A heading row rather than a section with an intro paragraph, so the docs
             link takes the compact icon form here. -->
        <SettingContainer name="MCP 服务器" isHeading>
          {#snippet nameSuffix()}
            <DocsLink doc="mcp" subject="MCP 服务器" />
          {/snippet}
          <Button buttonText="添加服务器" onClick={openAddMCPServer} />
        </SettingContainer>
        {#if mcpServerIds.length > 0}
          <div class="mcp-servers-list">
            {#each mcpServerIds as serverId (serverId)}
              {@const config = selectedAgent.mcpServers[serverId]}
              {@const toolsState = getServerToolsState(serverId)}
              {@const isExpanded = expandedServerId === serverId}
              <ManagedEntityItem
                class="mcp-entity"
                name={config.displayName}
                desc={config.url}
                meta="远程 HTTP MCP 服务器"
              >
                {#snippet badges()}
                  <Badge label="HTTP" tone="accent" />
                  <Badge
                    interactive
                    onclick={() => toggleToolsList(serverId)}
                    class={`mcp-tools-badge ${toolsState?.error ? "error" : ""} ${toolsState?.tools && toolsState.tools.length > 0 ? "has-tools" : ""}`}
                  >
                    {#if toolsState?.loading}
                      <Icon name="loader" size="xs" />
                    {:else if toolsState?.error}
                      <Icon name="alert-circle" size="xs" />
                    {:else}
                      <Icon name="wrench" size="xs" />
                    {/if}
                    <span>{getMCPToolsBadgeLabel(serverId, toolsState)}</span>
                  </Badge>
                {/snippet}

                {#snippet children()}
                  {#if isExpanded && toolsState}
                    <div class="mcp-tools-list">
                      {#if toolsState.loading}
                        <div class="mcp-tools-loading">正在加载工具…</div>
                      {:else if toolsState.error}
                        <div class="mcp-tools-error">
                          <Icon name="alert-circle" size="s" />
                          <span>{toolsState.error}</span>
                          <button
                            class="mcp-tools-retry"
                            onclick={() => void fetchServerTools(serverId)}>重试</button
                          >
                        </div>
                      {:else if toolsState.tools.length === 0}
                        <div class="mcp-tools-empty">暂无可用工具</div>
                      {:else}
                        {#each toolsState.tools as tool (tool.name)}
                          <div class="mcp-tool-item">
                            <span class="mcp-tool-name">{tool.name}</span>
                            {#if tool.description}
                              <span class="mcp-tool-desc">{tool.description}</span>
                            {/if}
                          </div>
                        {/each}
                      {/if}
                    </div>
                  {/if}
                {/snippet}

                {#snippet actions()}
                  <Button
                    iconId="pencil"
                    ariaLabel={`Edit ${config.displayName}`}
                    tooltip={`Edit ${config.displayName}`}
                    onClick={() => openEditMCPServer(serverId)}
                  />
                  <Toggle checked={config.enabled} onchange={() => toggleMCPServer(serverId)} />
                {/snippet}
              </ManagedEntityItem>
            {/each}
          </div>
        {:else}
          <div class="setting-item-description mcp-empty-state">
            No MCP servers configured for this agent.
          </div>
        {/if}
      </SettingGroup>
    </div>
  </div>
{/if}

<style>
  .agent-editor-container {
    height: 100%;
    min-height: 0;
    container-type: inline-size;
  }

  .agent-editor-pane {
    height: 100%;
    overflow-y: auto;
    padding-bottom: 12px;
    /* Spacing between the setting groups. Mirrors the settings tab, where the gap comes
       from the parent (see `.agents-settings` in AgentsSettings.svelte) rather than from
       margins on the groups themselves. */
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* `.setting-group` collides with an Obsidian core rule (`max-width: 700px; margin: 0 auto`)
     meant for the native settings tab. Inside this modal that centers and caps the groups;
     neutralize it here (scoped to this pane) rather than globally. */
  .agent-editor-pane :global(.setting-group) {
    max-width: none;
    margin-left: 0;
    margin-right: 0;
  }

  /* `:global` because the class is handed to `Text.svelte` as a prop, so this component's
     scope hash never reaches the rendered input. */
  :global(.agent-overview-name-input) {
    font-size: var(--font-ui-medium);
  }

  /* Icon-only trigger sitting immediately left of the name input, sized to match the
     input's height so the pair reads as one control. */
  :global(.agent-icon-trigger) {
    min-width: 0;
    justify-content: center;
    padding: 0;
    width: var(--input-height);
    height: var(--input-height);
    flex-shrink: 0;
  }

  /* Phone: core stretches both `.setting-item-control` buttons and inputs toward
     100%, which lets the icon trigger eat the row and crush the name input to its
     min-content. Pin the trigger to its square and give the freed space back to
     the input. `!important` because core's `.is-phone .modal .setting-item-control`
     rules out-specify these single-class selectors. */
  :global(.is-phone .modal .setting-item-control button.agent-icon-trigger) {
    width: var(--input-height) !important;
    flex: 0 0 auto !important;
  }

  :global(.is-phone .modal .setting-item-control input.agent-overview-name-input) {
    flex: 1 1 auto !important;
    width: auto !important;
    min-width: 0;
  }

  .agent-icon-trigger-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  :global(.agent-icon-popover) {
    width: min(380px, calc(100vw - 48px));
    max-width: min(380px, calc(100vw - 48px));
    z-index: calc(var(--layer-popover) + 20);
  }

  .agent-icon-browser {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .agent-icon-browser :global(.agent-icon-search) {
    width: 100%;
  }

  .agent-icon-option {
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
  }

  .agent-icon-option:hover {
    background: var(--background-modifier-hover);
  }

  .agent-icon-option.selected {
    border-color: color-mix(in srgb, var(--interactive-accent) 55%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-primary));
  }

  .agent-icon-results-header {
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
  }

  .agent-icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
    gap: 6px;
    max-height: 220px;
    overflow: auto;
    padding-right: 2px;
  }

  .agent-icon-option {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 8px 10px;
    border-radius: 12px;
    text-align: left;
  }

  .agent-icon-option-preview {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .agent-icon-option-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-ui-smaller);
  }

  .agent-icon-empty-state {
    padding: 10px 12px;
    border: 1px dashed var(--background-modifier-border);
    border-radius: 12px;
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
  }

  .mcp-tool-desc {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-top: 4px;
  }
  /* Section intro text. Lives INSIDE the card as a native `.setting-item` (rather than in
     the group heading) so the heading stays the compact 18px the settings tab uses and the
     16px heading-to-card gap reads the same on both surfaces. Mirrors
     `.managed-entity-section-header` in ManagedEntitySection.svelte. */
  .agent-section-intro {
    padding-bottom: 0 !important;
  }

  /* Muted text like `ManagedEntitySection`'s empty state. Aligns with the
     "技能" / "MCP 服务器" heading rows above it rather than the card edge:
     the message stands in for the whole list block, so it should line up with
     that block's heading. (The `.skill-entity` / `.mcp-entity` rows zero their
     own side padding because they carry their own internal inset — an empty
     paragraph has none, so matching them would outdent it.) */
  .skill-empty-state,
  .mcp-empty-state {
    margin: 0;
    padding: 8px 16px;
  }
  :global(.skill-entity),
  :global(.mcp-entity) {
    padding-left: 0;
    padding-right: 0;
  }
  :global(.mcp-tools-badge) {
    min-height: 22px;
  }
  :global(.mcp-tools-badge.has-tools) {
    background: rgba(var(--color-green-rgb, 76, 175, 80), 0.15);
    border-color: var(--text-success, #4caf50);
    color: var(--text-success, #4caf50);
  }
  :global(.mcp-tools-badge.error) {
    background: rgba(var(--color-red-rgb, 244, 67, 54), 0.15);
    border-color: var(--text-error, #f44336);
    color: var(--text-error, #f44336);
  }
  .mcp-tools-list {
    margin-top: 12px;
    padding: 12px;
    background: var(--background-secondary);
    border-radius: 6px;
    max-height: 300px;
    overflow-y: auto;
  }
  .mcp-tools-loading,
  .mcp-tools-empty {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.85rem;
    padding: 8px;
  }
  .mcp-tools-error {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-error, #f44336);
    font-size: 0.85rem;
    padding: 8px;
  }
  .mcp-tools-retry {
    margin-left: auto;
    padding: 4px 12px;
    font-size: 0.75rem;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
  }
  .mcp-tool-item {
    display: flex;
    flex-direction: column;
    padding: 8px;
    margin-bottom: 4px;
    background: var(--background-primary);
    border-radius: 4px;
  }
  .mcp-tool-name {
    font-weight: 500;
    font-family: var(--font-monospace);
    font-size: 0.85rem;
  }
  .agent-model-warning {
    color: var(--text-warning, #ffc107);
    max-width: 520px;
    width: 100%;
    text-align: right;
  }
  .agent-model-setting {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    width: 100%;
  }
</style>
