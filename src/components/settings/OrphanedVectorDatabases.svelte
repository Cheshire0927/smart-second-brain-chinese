<script module lang="ts">
/*
 * Scan results live at module level: the row is rendered once per settings
 * tab that embeds `EmbeddingIndexSection` (search and graph), and a deletion
 * from one tab must not leave the other showing databases that are gone.
 */
let orphans = $state<OrphanedDatabase[]>([]);
let originUsage = $state<number | null>(null);
let deleting = $state(false);
</script>

<script lang="ts">
import { untrack } from "svelte";
import { Notice } from "obsidian";
import SettingContainer from "./SettingContainer.svelte";
import Button from "../ui/Button.svelte";
import { ConfirmModal } from "../modal/ConfirmModal";
import { getData } from "../../stores/dataStore.svelte";
import { getPlugin } from "../../stores/state.svelte";
import { Logger } from "../../utils/logging";
import {
	deleteOrphanedDatabases,
	estimateOriginStorage,
	formatBytes,
	listOrphanedVectorDatabases,
	type OrphanedDatabase,
} from "../../vectorstore/orphanedDatabases";

/*
 * Vector databases outlive their index configuration by design (#432, step 5):
 * removing a provider or an index config leaves its vectors on disk until an
 * explicit delete. This row lists the leftovers for this vault and deletes them
 * after confirmation. It renders nothing when there is nothing to clean up or
 * when the runtime cannot enumerate databases.
 */

const pluginData = getData();
const plugin = getPlugin();

const configuredIds = $derived(pluginData.embeddingIndexes.map((index) => index.id));
// A value signature: `embeddingIndexes` is a fresh array on every store write,
// and keying the effect on its identity would rescan on unrelated saves.
const configuredSignature = $derived(configuredIds.join("|"));

async function scan(): Promise<void> {
	try {
		const found = await listOrphanedVectorDatabases(pluginData.vaultSlug, configuredIds);
		orphans = found ?? [];
		originUsage = (await estimateOriginStorage())?.usage ?? null;
	} catch (error) {
		Logger.error("[OrphanedVectorDatabases] Scan failed:", error);
		orphans = [];
	}
}

$effect(() => {
	// Rescan whenever the configured set changes (an index was deleted or added).
	void configuredSignature;
	untrack(() => void scan());
});

const totalEstimatedBytes = $derived(orphans.reduce((sum, orphan) => sum + (orphan.estimatedBytes ?? 0), 0));

function describe(orphan: OrphanedDatabase): string {
	if (orphan.kind === "legacy-sidecar") return `${orphan.label}（旧版图谱数据）`;
	const chunks = orphan.chunkCount ?? 0;
	return `${orphan.indexId}（${chunks} ${chunks === 1 ? "块" : "块"}）`;
}

const description = $derived.by(() => {
	const count = orphans.length;
	const parts = [
		`有 ${count} 个已存储的${count === 1 ? "数据库" : "数据库"}不再${count === 1 ? "" : ""}属于任何已配置的嵌入索引${
			totalEstimatedBytes > 0 ? `（至少 ${formatBytes(totalEstimatedBytes)} 的向量）` : ""
		}：${orphans.map(describe).join(", ")}。`,
	];
	if (originUsage !== null) {
		parts.push(`此设备上 Obsidian 的存储占用在所有仓库中共计 ${formatBytes(originUsage)}。`);
	}
	return parts.join(" ");
});

async function deleteOrphans(): Promise<void> {
	const names = orphans.map((orphan) => orphan.name);
	if (names.length === 0) return;
	const modal = new ConfirmModal(
		plugin.app,
		"删除孤立索引？",
		`这将永久删除 ${names.length} 个已存储的${names.length === 1 ? "数据库" : "数据库"}，它们未被任何已配置的嵌入索引使用。日后重新添加其中某个模型时，将从头重建其索引。`,
		"删除",
	);
	modal.open();
	const { confirmed } = await modal.promise;
	if (!confirmed) return;

	deleting = true;
	try {
		const outcome = await deleteOrphanedDatabases(names);
		if (outcome.failed.length === 0) {
			new Notice(
				`已删除 ${outcome.deleted.length} 个孤立${outcome.deleted.length === 1 ? "索引" : "索引"}。`,
			);
		} else {
			for (const failure of outcome.failed) {
				Logger.error(`[OrphanedVectorDatabases] Could not delete ${failure.name}: ${failure.reason}`);
			}
			new Notice(
				`已删除 ${outcome.deleted.length} 个，${outcome.failed.length} 个删除失败：${outcome.failed[0].reason}`,
			);
		}
	} finally {
		deleting = false;
		await scan();
	}
}
</script>

{#if orphans.length > 0}
  <SettingContainer name="孤立的向量数据库" desc={description}>
    <Button buttonText="删除孤立索引" disabled={deleting} onClick={() => void deleteOrphans()} />
  </SettingContainer>
{/if}
