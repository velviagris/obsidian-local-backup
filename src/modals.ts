import { App, ButtonComponent, Component, MarkdownRenderer, Modal, Platform, Setting, TextAreaComponent, TextComponent } from "obsidian";
import LocalBackupPlugin from "./main";

export class NewVersionNotifyModal extends Modal {
    plugin: LocalBackupPlugin;

    constructor(app: App, plugin: LocalBackupPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        const release = "0.1.9";

        const header = `### New in Local Backup ${release}\n`
        const text = `Thank you for using Local Backup!\n`;

        const contentDiv = contentEl.createDiv("local-backup-update-modal");
        const releaseNotes = [
            "1. Remove `One Way Backup Settings`",
            "2. Add option to exclude folders using wildcards. (Contributed by @Miguel Primentel)"
        ]
            .join("\n");

        const andNow = `Here are the updates in the latest version:`;
        const markdownStr = `${header}\n${text}\n${andNow}\n\n---\n\n${addExtraHashToHeadings(
            releaseNotes
        )}`;

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Okey")
                    .setCta()
                    .onClick(() => {
                        this.plugin.saveSettings();

                        this.close();
                    }));

        void MarkdownRenderer.renderMarkdown(
            markdownStr,
            contentDiv,
            this.app.vault.getRoot().path,
            new Component(),
        );
    }

    onClose() {
        let { contentEl } = this;
        contentEl.empty();
    }
}

function addExtraHashToHeadings(
    markdownText: string,
    numHashes = 1
): string {
    // Split the markdown text into an array of lines
    const lines = markdownText.split("\n");

    // Loop through each line and check if it starts with a heading syntax (#)
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("#")) {
            // If the line starts with a heading syntax, add an extra '#' to the beginning
            lines[i] = "#".repeat(numHashes) + lines[i];
        }
    }

    // Join the array of lines back into a single string and return it
    return lines.join("\n");
}

export class PromptModal extends Modal {
	plugin: LocalBackupPlugin;
    private resolve: (value: string) => void;
    private submitted = false;
    private value: string;

    constructor(
        private prompt_text: string,
        private default_value: string,
        private multi_line: boolean,
		app: App, plugin: LocalBackupPlugin
    ) {
        super(app);
		this.plugin = plugin;
    }

    onOpen(): void {
        this.titleEl.setText(this.prompt_text);
        this.createForm();
    }

    onClose(): void {
        this.contentEl.empty();
        if (!this.submitted) {
        }
    }

    createForm(): void {
        const div = this.contentEl.createDiv();
        div.addClass("templater-prompt-div");
        let textInput;
        if (this.multi_line) {
            textInput = new TextAreaComponent(div);

            // Add submit button since enter needed for multiline input on mobile
            const buttonDiv = this.contentEl.createDiv();
            buttonDiv.addClass("templater-button-div");
            const submitButton = new ButtonComponent(buttonDiv);
            submitButton.buttonEl.addClass("mod-cta");
            submitButton.setButtonText("Submit").onClick((evt: Event) => {
                this.resolveAndClose(evt);
            });
        } else {
            textInput = new TextComponent(div);
        }

        this.value = this.default_value ?? "";
        textInput.inputEl.addClass("templater-prompt-input");
        textInput.setPlaceholder("Type text here");
        textInput.setValue(this.value);
        textInput.onChange((value) => (this.value = value));
        textInput.inputEl.addEventListener("keydown", (evt: KeyboardEvent) =>
            this.enterCallback(evt)
        );
    }

    private enterCallback(evt: KeyboardEvent) {
        if (evt.isComposing || evt.keyCode === 229) return;

        if (this.multi_line) {
            if (Platform.isDesktop) {
                // eslint-disable-next-line no-empty
                if (evt.shiftKey && evt.key === "Enter") {
                } else if (evt.key === "Enter") {
                    this.resolveAndClose(evt);
                }
            } else {
                // allow pressing enter on mobile for multi-line input
                if (evt.key === "Enter") {
                    evt.preventDefault();
                }
            }
        } else {
            if (evt.key === "Enter") {
                this.resolveAndClose(evt);
            }
        }
    }

    private resolveAndClose(evt: Event | KeyboardEvent) {
        this.submitted = true;
        evt.preventDefault();
		this.plugin.archiveVaultWithRetryAsync(this.value);
        this.close();
    }

    async openAndGetValue(
        resolve: (value: string) => void,
    ): Promise<void> {
        this.resolve = resolve;
        this.open();
    }
}
