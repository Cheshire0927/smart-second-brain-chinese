import { type App, Modal, Notice, Setting, type TFile } from "obsidian";

/**
 * Rename a `.widget` file from its own tab. Obsidian's built-in rename is an inline edit
 * in the file explorer, which does nothing visible when the explorer is closed or the
 * file is folded away, so the tab gets a small dialog of its own. Only the name changes;
 * the folder and extension stay.
 */
export class RenameWidgetModal extends Modal {
	private name: string;

	constructor(
		app: App,
		private readonly file: TFile,
	) {
		super(app);
		this.name = file.basename;
	}

	onOpen(): void {
		this.titleEl.setText("重命名 Widget");
		const nameSetting = new Setting(this.contentEl).setName("名称").addText((text) => {
			text.setValue(this.name).onChange((value) => {
				this.name = value;
			});
			text.inputEl.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					void this.submit();
				}
			});
		});
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText("重命名")
					.setCta()
					.onClick(() => void this.submit()),
			);
		const input = nameSetting.controlEl.querySelector("input");
		input?.focus();
		input?.select();
	}

	private async submit(): Promise<void> {
		const name = this.name.trim();
		if (!name) {
			new Notice("请输入名称。");
			return;
		}
		// Same set the chat-save naming strips (`widgetFileBasename`): the OS-illegal
		// characters plus the ones Obsidian reads as link syntax (# ^ [ ]), which would
		// make the file unresolvable by path for the agent's tools.
		if (/[\\/:*?"<>|#^[\]]/.test(name)) {
			new Notice('名称不能包含 \\ / : * ? " < > | # ^ [ ]');
			return;
		}
		if (name === this.file.basename) {
			this.close();
			return;
		}
		const folder = this.file.parent?.path && this.file.parent.path !== "/" ? `${this.file.parent.path}/` : "";
		const target = `${folder}${name}.${this.file.extension}`;
		if (this.app.vault.getAbstractFileByPath(target)) {
			new Notice(`此文件夹中已存在“${name}”。`);
			return;
		}
		try {
			await this.app.fileManager.renameFile(this.file, target);
			this.close();
		} catch (error) {
			new Notice(`重命名失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
