<script lang="ts">
import { Notice } from "obsidian";
import SettingGroup from "../../components/settings/SettingGroup.svelte";
import SettingItem from "../../components/settings/SettingItem.svelte";
import SecretSelect from "../../components/settings/SecretSelect.svelte";
import Button from "../../components/ui/Button.svelte";
import Text from "../../components/ui/Text.svelte";
import Toggle from "../../components/ui/Toggle.svelte";
import { createObsidianFetch } from "../../lib/obsidianFetch";
import { suggestSecretId } from "../../lib/secretStorage";
import { getData } from "../../stores/dataStore.svelte";
import { getPlugin } from "../../stores/state.svelte";
import { VIEW_TYPE_ONBOARDING } from "../onboarding/OnboardingView";

const pluginData = getData();
const plugin = getPlugin();
const DEFAULT_LANGSMITH_ENDPOINT = "https://api.smith.langchain.com";
let langSmithEndpointDraft = $state(pluginData.langSmithEndpoint);
let langSmithCheckState = $state<"idle" | "pending" | "success" | "error">("idle");
let langSmithCheckMessage = $state("检查 LangSmith 连接");

$effect(() => {
	if (langSmithCheckState !== "pending") {
		langSmithEndpointDraft = pluginData.langSmithEndpoint;
	}
});

function replayOnboardingIntro() {
	pluginData.onboardingSplashSeen = false;
	pluginData.onboardingComplete = false;

	// activateOnboardingView reveals an existing Welcome leaf rather than remounting
	// it, so if one is already open (likely, in a dev vault) the flag reset above
	// would silently not replay anything — playIntro is only computed once, at the
	// Svelte component's construction. Detach any existing leaf first to force a
	// fresh mount; this is specific to this dev action, not activateOnboardingView
	// itself, since the real "reveal what's already open" behavior is correct for
	// the startup auto-open.
	for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE_ONBOARDING)) {
		leaf.detach();
	}

	// Startup auto-open also requires zero configured providers (see main.ts), which
	// a dev/test vault rarely has — so resetting the flags alone would silently do
	// nothing visible here. Open it directly instead of waiting on that gate; this
	// also closes Settings first (activateOnboardingView's own behavior), matching
	// what a real first run looks like when the plugin is enabled from Settings.
	void plugin.activateOnboardingView();
	new Notice("引导已重置并重新打开——将从头重播介绍动画。");
}

function restoreDismissedRecommendations() {
	const count = pluginData.dismissedRecommendations.length;
	pluginData.restoreDismissedRecommendations();
	new Notice(
		count > 0
			? `已恢复 ${count} 条已忽略的推荐${count === 1 ? "" : ""}。`
			: "没有可恢复的已忽略推荐。",
	);
}

function restoreIntegrationPrivacyWarning() {
	const wasSuppressed = pluginData.suppressIntegrationPrivacyWarning;
	pluginData.suppressIntegrationPrivacyWarning = false;
	new Notice(
		wasSuppressed
			? "集成隐私警告已恢复——下次启用集成时会再次显示。"
			: "集成隐私警告此前未被隐藏。",
	);
}

function getLangSmithCheckIcon(): string {
	if (langSmithCheckState === "success") return "check-circle";
	if (langSmithCheckState === "error") return "x-circle";
	return "refresh-cw";
}

function getLangSmithCheckButtonStyles(): string {
	if (langSmithCheckState === "success") return "langsmith-check-button is-success";
	if (langSmithCheckState === "error") return "langsmith-check-button is-error";
	if (langSmithCheckState === "pending") return "langsmith-check-button is-pending";
	return "langsmith-check-button";
}

function normalizeLangSmithEndpoint(endpoint: string): string {
	return (endpoint.trim() || DEFAULT_LANGSMITH_ENDPOINT).replace(/\/+$/, "");
}

async function handleCheckLangSmithConnection() {
	const apiKey = pluginData.langSmithApiKey;
	if (!pluginData.langSmithApiKeyId || !apiKey) {
		langSmithCheckState = "error";
		langSmithCheckMessage = "请先选择 LangSmith API 密钥";
		new Notice(langSmithCheckMessage);
		return;
	}

	pluginData.langSmithEndpoint = langSmithEndpointDraft.trim() || DEFAULT_LANGSMITH_ENDPOINT;
	const endpoint = normalizeLangSmithEndpoint(langSmithEndpointDraft);

	let validationUrl: string;
	try {
		validationUrl = new URL("/api/v1/sessions?limit=1", `${endpoint}/`).toString();
	} catch {
		langSmithCheckState = "error";
		langSmithCheckMessage = "LangSmith 端点 URL 无效";
		new Notice(langSmithCheckMessage);
		return;
	}

	langSmithCheckState = "pending";
	langSmithCheckMessage = "正在检查 LangSmith 连接……";

	try {
		const obsidianFetch = createObsidianFetch(window.fetch.bind(window));
		const response = await obsidianFetch(validationUrl, {
			method: "GET",
			headers: {
				"x-api-key": apiKey,
				accept: "application/json",
			},
		});

		if (response.ok) {
			langSmithCheckState = "success";
			langSmithCheckMessage = "LangSmith 连接成功";
			new Notice(langSmithCheckMessage);
			return;
		}

		const responseText = (await response.text()).trim();
		if (response.status === 401 || response.status === 403) {
			langSmithCheckState = "error";
			langSmithCheckMessage = "LangSmith 拒绝了此 API 密钥";
		} else if (response.status === 404) {
			langSmithCheckState = "error";
			langSmithCheckMessage = "LangSmith 端点未提供预期的 API";
		} else {
			langSmithCheckState = "error";
			langSmithCheckMessage = responseText
				? `LangSmith 检查失败（${response.status}）：${responseText}`
				: `LangSmith 检查失败，状态码 ${response.status}`;
		}
		new Notice(langSmithCheckMessage);
	} catch (error) {
		langSmithCheckState = "error";
		langSmithCheckMessage = error instanceof Error ? error.message : "无法连接到 LangSmith";
		new Notice(`LangSmith 检查失败：${langSmithCheckMessage}`);
	}
}
</script>

<!-- Onboarding -->
<SettingGroup heading="引导">
  <SettingItem
    name="重播引导介绍"
    desc="重置开场动画与完成标志——欢迎视图会再次播放介绍，并像首次运行一样在启动时自动打开（直到配置了服务商）。"
  >
    <Button buttonText="重置介绍" iconId="rotate-ccw" onClick={replayOnboardingIntro} />
  </SettingItem>
</SettingGroup>

<!-- Chat -->
<SettingGroup heading="聊天">
  <SettingItem
    name="显示工具原始输入/输出"
    desc="在聊天的工具调用行中显示确切的工具参数与原始输出内容。默认关闭——用户只会看到通俗摘要与友好的结构化结果。"
  >
    <Toggle
      checked={pluginData.showToolIODetails}
      onchange={(checked) => (pluginData.showToolIODetails = checked)}
    />
  </SettingItem>

  <SettingItem
    name="恢复已忽略的推荐"
    desc="恢复新聊天空白页中所有被忽略的推荐查询、插件技能提示和默认值更新通知。"
  >
    <Button
      buttonText="恢复"
      iconId="rotate-ccw"
      onClick={restoreDismissedRecommendations}
    />
  </SettingItem>

  <SettingItem
    name="恢复集成隐私警告"
    desc="撤销在启用插件集成的代码执行工具前所显示警告上的「不再询问」（该工具会绕过按服务商设定的隐私规则）。"
  >
    <Button
      buttonText="恢复"
      iconId="rotate-ccw"
      onClick={restoreIntegrationPrivacyWarning}
    />
  </SettingItem>
</SettingGroup>

<!-- Observability -->
<SettingGroup heading="可观测性">
  <SettingItem
    name="LangSmith 集成"
    desc="启用 LangSmith 遥测以进行调试与追踪"
  >
    <Toggle
      checked={pluginData.enableLangSmith}
      onchange={(checked) => (pluginData.enableLangSmith = checked)}
    />
  </SettingItem>

  {#if pluginData.enableLangSmith}
    <SettingItem
      name="API 密钥"
      desc="选择一个 Obsidian 钥匙串密钥用于 LangSmith 身份验证"
    >
      <SecretSelect
        value={pluginData.langSmithApiKeyId}
        suggestedId={suggestSecretId(plugin.app, "LangSmith", "apiKey")}
        onChange={(secretId) => (pluginData.langSmithApiKeyId = secretId)}
      />
    </SettingItem>

    <SettingItem name="项目名称" desc="用于归属运行记录的项目名称">
      <Text
        placeholder="obsidian-agent"
        inputType="text"
        value={pluginData.langSmithProject}
        onblur={(v) => (pluginData.langSmithProject = v)}
      />
    </SettingItem>

    <SettingItem name="端点 URL" desc="覆盖 LangSmith API 的基础 URL（可选）">
      <div class="flex items-center gap-2 w-full">
        <Button
          iconId={getLangSmithCheckIcon()}
          ariaLabel="检查 LangSmith API 密钥与端点"
          tooltip={langSmithCheckMessage}
          styles={getLangSmithCheckButtonStyles()}
          disabled={langSmithCheckState === "pending"}
          onClick={() => void handleCheckLangSmithConnection()}
        />
        <Text
          placeholder={DEFAULT_LANGSMITH_ENDPOINT}
          inputType="text"
          bind:value={langSmithEndpointDraft}
          class="flex-1"
          onblur={(v) => (pluginData.langSmithEndpoint = v)}
        />
      </div>
    </SettingItem>
  {/if}
</SettingGroup>

<style>
  :global(.langsmith-check-button) {
    color: var(--text-muted);
  }

  :global(.langsmith-check-button.is-success) {
    color: var(--text-success, #4caf50);
  }

  :global(.langsmith-check-button.is-error) {
    color: var(--text-error);
  }

  :global(.langsmith-check-button.is-pending .s2b-button-icon) {
    animation: langsmith-check-spin 1s linear infinite;
  }

  @keyframes langsmith-check-spin {
    from {
      transform: rotate(0deg);
    }

    to {
      transform: rotate(360deg);
    }
  }
</style>
