<script lang="ts">
import {
	MAX_EMBEDDING_BATCH_SIZE,
	MIN_EMBEDDING_BATCH_SIZE,
	getDefaultEmbeddingBatchSize,
	normalizeEmbeddingBatchSize,
} from "../../vectorstore/batchSize";
import { useAvailableModels } from "../../hooks/useAvailableModels.svelte";
import { getProviderDefinition } from "../../providers";
import ModelSettingControl from "../settings/ModelSettingControl.svelte";
import SettingContainer from "../settings/SettingContainer.svelte";
import Button from "../ui/Button.svelte";
import Text from "../ui/Text.svelte";
import GenericAIIcon from "../ui/logos/GenericAIIcon.svelte";
import type SecondBrainPlugin from "../../main";
import { ModelSelectionModal, type SelectedModel } from "./ModelSelectionModal";
import type { EmbeddingIndexSetupModal } from "./EmbeddingIndexSetupModal";

interface Props {
	modal: EmbeddingIndexSetupModal;
	plugin: SecondBrainPlugin;
	currentSelection: SelectedModel | null;
	onSave: (selectedModel: SelectedModel, batchSize: number) => void;
	/** Resolves true when an index was imported, false when cancelled or rejected.
	 * Omitted when importing isn't available (desktop-only), which hides the row. */
	onImport?: () => Promise<boolean>;
}

const { modal, plugin, currentSelection, onSave, onImport }: Props = $props();
const availableModels = useAvailableModels();
let selectedModel = $state<SelectedModel | null>(null);
let isImporting = $state(false);

$effect(() => {
	if (!selectedModel && currentSelection) {
		selectedModel = currentSelection;
	}
});

const suggestedBatchSize = $derived.by(() => {
	if (!selectedModel) {
		return MIN_EMBEDDING_BATCH_SIZE;
	}

	const existingIndex = plugin.pluginData.getEmbeddingIndex(`${selectedModel.provider}:${selectedModel.model}`);
	return existingIndex?.batchSize ?? getDefaultEmbeddingBatchSize(selectedModel.provider);
});

let batchSize = $state(0);
let error = $state("");
let lastModelKey = $state<string | null>(null);

$effect(() => {
	if (!selectedModel) {
		return;
	}

	const nextModelKey = `${selectedModel.provider}:${selectedModel.model}`;
	if (nextModelKey !== lastModelKey) {
		batchSize = suggestedBatchSize;
		lastModelKey = nextModelKey;
		error = "";
	}
});

const selectedModelLabel = $derived.by(() => {
	if (!selectedModel) {
		return null;
	}

	return selectedModel.model;
});

const selectedModelLogo = $derived.by(() => {
	if (!selectedModel) {
		return null;
	}

	const providerDefinition = getProviderDefinition(selectedModel.provider, plugin.pluginData.getAllProviderMeta());
	return providerDefinition && "logo" in providerDefinition && providerDefinition.logo
		? providerDefinition.logo
		: GenericAIIcon;
});

function openModelSelection() {
	new ModelSelectionModal(plugin, "embedding", selectedModel, (model) => {
		if (!model) {
			return;
		}

		selectedModel = model;
		error = "";
	}).open();
}

function handleSave() {
	if (!selectedModel) {
		error = "请选择一个嵌入模型。";
		return;
	}

	if (!Number.isFinite(batchSize)) {
		error = "批大小必须是数字。";
		return;
	}

	if (batchSize < MIN_EMBEDDING_BATCH_SIZE || batchSize > MAX_EMBEDDING_BATCH_SIZE) {
		error = `Batch size must be between ${MIN_EMBEDDING_BATCH_SIZE} and ${MAX_EMBEDDING_BATCH_SIZE}.`;
		return;
	}

	error = "";
	onSave(selectedModel, normalizeEmbeddingBatchSize(batchSize, selectedModel.provider));
	modal.close();
}

// A successful import selects the imported index outright, so there is nothing
// left to configure here and the modal closes. Cancelling the file dialog (or
// picking a file that gets rejected — that reports itself through a notice) must
// leave the modal open, so the user can still build an index instead.
async function handleImport() {
	if (!onImport || isImporting) {
		return;
	}

	isImporting = true;
	try {
		if (await onImport()) {
			modal.close();
		}
	} catch (importError) {
		error = importError instanceof Error ? importError.message : String(importError);
	} finally {
		isImporting = false;
	}
}
</script>

<div class="embedding-index-setup-modal">
  <div class="modal-intro">选择一个模型，然后按需调整批大小。</div>

  <div class="settings-panel">
    <SettingContainer name="嵌入模型" desc="用于构建和刷新此索引。">
      <ModelSettingControl
        available={availableModels.hasProviders && availableModels.hasEmbedModels}
        loading={availableModels.hasProviders && availableModels.isLoadingModels}
        configureLabel={!availableModels.hasProviders ? "配置服务商" : "配置模型"}
        unavailableHint={!availableModels.hasProviders
          ? "尚未配置 AI 服务商。"
          : "在你的服务商中未找到嵌入模型。"}
        onConfigure={() => availableModels.openSettings(() => modal.close(), { needsEmbedding: true })}
        placeholder="选择模型"
        selectedLabel={selectedModelLabel}
        selectedLogo={selectedModelLogo}
        onSelect={openModelSelection}
      />
    </SettingContainer>

    <SettingContainer
      name="批大小"
      desc={`Notes per embedding request. Lower values are safer for local models; higher values are better for hosted providers. Range: ${MIN_EMBEDDING_BATCH_SIZE}-${MAX_EMBEDDING_BATCH_SIZE}.`}
    >
      <Text
        inputType="number"
        value={batchSize}
        placeholder={suggestedBatchSize.toString()}
        onchange={(value) => {
          batchSize = value;
          error = "";
        }}
      />
    </SettingContainer>

    {#if onImport}
      <SettingContainer
        name="导入已有索引"
        desc="加载从其他仓库导出的索引，而不重新构建。仅当导出文件过时才需要重建。"
      >
        <Button
          iconId="upload"
          buttonText={isImporting ? "正在导入…" : "导入"}
          disabled={isImporting}
          onClick={() => void handleImport()}
        />
      </SettingContainer>
    {/if}

    {#if error}
      <div class="setting-item">
        <div class="text-[--text-error] text-sm">{error}</div>
      </div>
    {/if}
  </div>
</div>

<div class="modal-button-container">
  <Button buttonText="取消" onClick={() => modal.close()} />
  <Button buttonText="开始建立索引" cta={true} onClick={handleSave} disabled={!selectedModel} />
</div>

<style>
  .embedding-index-setup-modal {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 0;
  }

  .modal-intro {
    color: var(--text-muted);
    font-size: 0.95rem;
    line-height: 1.4;
  }

  .settings-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
