<script lang="ts">
import Button from "../ui/Button.svelte";
import type { PrivacyWarningModal } from "./PrivacyWarningModal";

interface Props {
	modal: PrivacyWarningModal;
	onConfirm: () => void;
	onCancel: () => void;
}

let { modal, onConfirm, onCancel }: Props = $props();
</script>

<div class="modal-title">隐私警告</div>
<div class="modal-content">
  <p>
    你的聊天记录中引用了<strong>私密笔记</strong>，而你要切换到的服务商
    <strong>不可信，不允许访问私密笔记</strong>。
  </p>
  <p>继续操作可能会把私密笔记内容暴露给该服务商。</p>
</div>

<div class="modal-button-container">
  <Button buttonText="取消" onClick={onCancel} />
  <Button buttonText="仍然继续" styles="mod-warning" onClick={onConfirm} />
</div>
