import type SecondBrainPlugin from "../../main";
import IndexingReportModalComponent from "./IndexingReportModal.svelte";
import { SvelteModal } from "./SvelteModal";

export class IndexingReportModal extends SvelteModal {
	private indexId: string;

	constructor(plugin: SecondBrainPlugin, indexId: string) {
		super(plugin.app);
		this.indexId = indexId;
	}

	onOpen() {
		this.setTitle("索引报告");
		this.mountComponent(
			IndexingReportModalComponent,
			{ modal: this, indexId: this.indexId },
			{ width: "min(600px, 90vw)", maxWidth: "90vw", contentFill: false },
		);
	}
}
