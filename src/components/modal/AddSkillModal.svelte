<script lang="ts">
import { normalizePath } from "obsidian";
import type SecondBrainPlugin from "../../main";
import {
	slugifySkillName,
	humanizeSkillName,
	validateSkillName,
	validateDescription,
	parseFrontmatter,
} from "../../skills";
import { Tabs } from "bits-ui";
import { createObsidianFetch } from "../../lib/obsidianFetch";
import SettingContainer from "../settings/SettingContainer.svelte";
import Button from "../ui/Button.svelte";
import DocsLink from "../ui/DocsLink.svelte";
import ExternalLinkButton from "../ui/ExternalLinkButton.svelte";
import SlidingTabs, { type SlidingTab } from "../ui/SlidingTabs.svelte";
import Text from "../ui/Text.svelte";
import type { AddSkillModal } from "./AddSkillModal";

interface Props {
	modal: AddSkillModal;
	plugin: SecondBrainPlugin;
	agentId: string;
	onSave: (skillId: string) => void | Promise<void>;
}

const { modal, plugin, agentId, onSave }: Props = $props();

// Mode: "create" or "import"
type Mode = "create" | "import";
let mode = $state<Mode>("create");

const SKILL_MODE_TABS: SlidingTab<Mode>[] = [
	{ id: "create", label: "新建", icon: "plus" },
	{ id: "import", label: "从 URL 导入", icon: "download" },
];

let skillName = $state("");
let skillDescription = $state("");
// Body for the new SKILL.md. Empty in the create flow (we scaffold a starter), or the
// fetched body when importing. The user writes/edits the real instructions in the opened note.
let importedBody = $state("");
let validationError = $state("");

// Import mode state
let importUrl = $state("");
let importLoading = $state(false);
let importError = $state("");

// Generate slug from display name
const skillSlug = $derived(slugifySkillName(skillName));

// Validate per Agent Skills spec
const validation = $derived(() => {
	if (!skillName.trim()) return { valid: false, error: "请填写名称" };

	const nameResult = validateSkillName(skillSlug);
	if (!nameResult.valid) {
		return { valid: false, error: nameResult.errors[0]?.message || "名称无效" };
	}

	const descResult = validateDescription(skillDescription);
	if (!descResult.valid) {
		return { valid: false, error: descResult.errors[0]?.message || "请填写描述" };
	}

	return { valid: true, error: "" };
});

const isValid = $derived(validation().valid);

/**
 * Convert a GitHub URL to raw content URL.
 * Supports: github.com blob URLs, raw.githubusercontent.com
 */
function toRawGitHubUrl(url: string): string {
	// Already a raw URL
	if (url.includes("raw.githubusercontent.com")) {
		return url;
	}
	// Convert github.com/owner/repo/blob/branch/path to raw URL
	const blobMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)/);
	if (blobMatch) {
		const [, owner, repo, branch, path] = blobMatch;
		return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
	}
	return url;
}

async function handleImport() {
	if (!importUrl.trim()) {
		importError = "请输入 URL";
		return;
	}

	importLoading = true;
	importError = "";

	try {
		const rawUrl = toRawGitHubUrl(importUrl.trim());
		const obsidianFetch = createObsidianFetch(fetch);
		const response = await obsidianFetch(rawUrl);

		if (!response.ok) {
			throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
		}

		const content = await response.text();

		// Parse the SKILL.md content
		const { frontmatter, body } = parseFrontmatter(content);

		if (!frontmatter.name || !frontmatter.description) {
			throw new Error("SKILL.md 无效：frontmatter 缺少 name 或 description");
		}

		// Populate fields; keep the imported body so it's written into the new note verbatim.
		skillName = humanizeSkillName(frontmatter.name);
		skillDescription = frontmatter.description;
		importedBody = body;

		// Switch to create view so the user can confirm name/description before we scaffold + open.
		mode = "create";
		importUrl = "";
	} catch (err) {
		importError = err instanceof Error ? err.message : "导入技能失败";
	} finally {
		importLoading = false;
	}
}

const SKILLS_MARKETPLACE_URL = "https://skillsmp.com/";

/** Starter body written into a brand-new skill (when not importing an existing one). */
function scaffoldBody(): string {
	return `# ${skillName.trim()}\n\nDescribe when to use this skill and the steps to follow.\n`;
}

async function handleSave() {
	if (!isValid) {
		validationError = validation().error;
		return;
	}

	// Write a SKILL.md (scaffold for a new skill, or the imported body) then open the note so
	// the user writes the real instructions in Obsidian — consistent with the edit (pencil) flow.
	const skillsService = plugin.skillsService;
	const result = await skillsService.saveSkill({
		frontmatter: {
			name: skillSlug,
			description: skillDescription.trim(),
		},
		content: importedBody.trim() ? importedBody : scaffoldBody(),
	});

	if (!result.valid) {
		validationError = result.errors[0]?.message || "保存技能失败";
		return;
	}

	// Re-discover skills to update cache, then let the agent reinitialize.
	await skillsService.discoverSkills();
	await onSave(skillSlug);

	// Open the freshly created note for editing, then close the modal.
	const metadata = skillsService.getCachedSkills().get(skillSlug);
	if (metadata) {
		const skillPath = normalizePath(`${metadata.path}/SKILL.md`);
		modal.close();
		plugin.app.workspace.openLinkText(skillPath, "", true);
	} else {
		modal.close();
	}
}
</script>

<div class="add-skill-modal-content">
  <SlidingTabs bind:value={mode} tabs={SKILL_MODE_TABS}>
    <Tabs.Content value="create">
      <SettingContainer
        name="名称"
        desc={skillSlug && skillSlug !== skillName.toLowerCase()
          ? `Saved as: ${skillSlug}`
          : "技能的显示名称。"}
      >
        <Text
          id="add-skill-name"
          inputType="text"
          value={skillName}
          placeholder="e.g., Code Review, Writing Style"
          onchange={(val) => (skillName = val)}
        />
      </SettingContainer>

      <SettingContainer
        name="描述"
        desc="说明技能的作用与适用场景。添加后会打开技能笔记，供你编写完整指令。"
      >
        <Text
          id="add-skill-description"
          inputType="text"
          value={skillDescription}
          placeholder="描述何时使用该技能…"
          onchange={(val) => (skillDescription = val)}
        />
      </SettingContainer>

      {#if validationError}
        <div class="add-skill-error">{validationError}</div>
      {/if}
    </Tabs.Content>

    <Tabs.Content value="import">
      <SettingContainer
        name="SKILL.md URL"
        desc="粘贴指向 SKILL.md 文件的 GitHub URL，支持 github.com 与 raw.githubusercontent.com 链接。"
      >
        <Text
          id="add-skill-import-url"
          inputType="text"
          value={importUrl}
          placeholder="https://github.com/owner/repo/blob/main/skills/my-skill/SKILL.md"
          onchange={(val) => (importUrl = val)}
        />
      </SettingContainer>

      <!-- SkillsMP is where skills are found; the docs explain the SKILL.md format an
           imported one has to satisfy, so both belong on this row. -->
      <SettingContainer name="浏览技能" desc="在 skillsmp.com 查找社区技能。">
        {#snippet nameSuffix()}
          <DocsLink doc="skills" subject="技能" />
        {/snippet}
        <ExternalLinkButton href={SKILLS_MARKETPLACE_URL} label="打开 SkillsMP" />
      </SettingContainer>

      {#if importError}
        <div class="add-skill-error">{importError}</div>
      {/if}
    </Tabs.Content>
  </SlidingTabs>

  <!-- Obsidian's own footer class, so the buttons sit where they do in every
       core modal instead of in a hand-rolled row. -->
  <div class="modal-button-container">
    <Button buttonText="取消" onClick={() => modal.close()} />
    {#if mode === "import"}
      <Button
        buttonText={importLoading ? "正在导入…" : "导入"}
        cta={true}
        onClick={handleImport}
        disabled={importLoading || !importUrl.trim()}
      />
    {:else}
      <Button buttonText="添加并打开笔记" cta={true} onClick={handleSave} disabled={!isValid} />
    {/if}
  </div>
</div>

<style>
  .add-skill-modal-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .add-skill-error {
    color: var(--text-error);
    font-size: var(--font-ui-small);
    padding: 8px 12px;
    background: var(--background-modifier-error);
    border-radius: 6px;
  }

  /* The tab strip owns the spacing above; without this the first SettingContainer's
     own top border sits directly under it with no breathing room. */
  .add-skill-modal-content :global([data-tabs-content]) {
    padding-top: 4px;
  }
</style>
