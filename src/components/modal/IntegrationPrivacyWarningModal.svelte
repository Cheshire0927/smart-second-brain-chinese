<script lang="ts">
import Button from "../ui/Button.svelte";
import Toggle from "../ui/Toggle.svelte";

interface Props {
	displayName: string;
	onConfirm: (dontAskAgain: boolean) => void;
	onCancel: () => void;
}

let { displayName, onConfirm, onCancel }: Props = $props();

let dontAskAgain = $state(false);
</script>

<div class="modal-title">隐私警告</div>
<div class="modal-content">
  <p>
    启用 <strong>{displayName}</strong> 会为智能体提供一个工具，该工具在主线程上以完整仓库权限运行 JavaScript 调用本插件的 API。
  </p>
  <p>
    <strong>你的隐私规则不适用于此工具。</strong>你为当前服务商标为私密的笔记，仍可通过它读取或写入；而 <code>search_notes</code>、
    <code>read_content</code> 和 <code>manage_notes</code> 则遵守这些规则。
  </p>
</div>

<label class="s2b-dont-ask-again">
  <Toggle checked={dontAskAgain} onchange={(checked) => (dontAskAgain = checked)} />
  <span>不再对任何集成询问</span>
</label>

<div class="modal-button-container">
  <Button buttonText="取消" onClick={onCancel} />
  <Button buttonText="仍然启用" styles="mod-warning" onClick={() => onConfirm(dontAskAgain)} />
</div>

<style>
  .s2b-dont-ask-again {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    cursor: pointer;
  }

  .s2b-dont-ask-again span {
    color: var(--text-muted);
    font-size: var(--font-ui-small);
  }
</style>
