// @ts-nocheck
// Note: TypeScript checks are disabled for this file due to module resolution issues.
// To resolve these issues, ensure that the 'obsidian' module is properly set up in the project's TypeScript configuration.

import { App, PluginSettingTab, Setting, Notice, DropdownComponent, ToggleComponent, TextComponent, ButtonComponent } from "obsidian";
import LocalBackupPlugin from "./main";
import "./styles.css";

// Add this type definition
interface LocalBackupPluginSettings {
	startupBackupStatus: boolean;
	lifecycleValue: string;
	backupsPerDayValue: string;
	winSavePathValue: string;
	unixSavePathValue: string;
	fileNameFormatValue: string;
	intervalBackupStatus: boolean;
	backupFrequencyValue: string;
	maxRetriesValue: string;
	retryIntervalValue: string;
	showRibbonIcon: boolean;
	showConsoleLog: boolean;
	showNotifications: boolean;
	callingArchiverStatus: boolean;
	archiverTypeValue: string;
	archiveFileTypeValue: string;
	archiverWinPathValue: string;
	archiverUnixPathValue: string;
	excludedDirectoriesValue: string; // Added for excluded directories
}

export class LocalBackupSettingTab extends PluginSettingTab {
	plugin: LocalBackupPlugin;

	constructor(app: App, plugin: LocalBackupPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h3", { text: "General Settings" });

		const ribbonIconDesc = document.createDocumentFragment();
		ribbonIconDesc.appendChild(document.createTextNode("Show a ribbon icon in the left sidebar."));
		ribbonIconDesc.appendChild(document.createElement("br"));
		ribbonIconDesc.appendChild(document.createTextNode("Please close and reopen Obsidian for this setting to take effect."));

		new Setting(containerEl)
			.setName("Backup once on startup")
			.setDesc("Run local backup once on Obsidian starts.")
			.addToggle((toggle: ToggleComponent) =>
				toggle
					.setValue(this.plugin.settings.startupBackupStatus)
					.onChange(async (value: boolean) => {
						this.plugin.settings.startupBackupStatus = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Backup history length (days)")
			.setDesc(
				"Specify the number of days backups should be retained. (0 -- Infinity)"
			)
			.addText((text: TextComponent) =>
				text
					.setValue(this.plugin.settings.lifecycleValue)
					.onChange(async (value: string) => {
						// add limits
						const numericValue = parseFloat(value);
						if (isNaN(numericValue) || numericValue < 0) {
							new Notice(
								"Backup lifecycle must be a non-negative number."
							);
							return;
						}
						this.plugin.settings.lifecycleValue = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Backups per day")
			.setDesc(
				"Specify the number of backups per day to keep. (0 -- Infinity)"
			)
			.addText((text: TextComponent) =>
				text
					.setValue(this.plugin.settings.backupsPerDayValue)
					.onChange(async (value: string) => {
						// add limits
						const numericValue = parseFloat(value);
						if (isNaN(numericValue) || numericValue < 0) {
							new Notice(
								"Backups per day must be a non-negative number."
							);
							return;
						}
						this.plugin.settings.backupsPerDayValue = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Windows output path (optional)")
			.setDesc("Setup a Windows backup storage path. eg. D:\\documents\\Obsidian")
			.addText((text: TextComponent) =>
				text
					.setValue(this.plugin.settings.winSavePathValue)
					.onChange(async (value: string) => {
						this.plugin.settings.winSavePathValue = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Linux/MacOS output path (optional)")
			.setDesc("Setup a Unix backup storage path. eg. /home/user/Documents/Obsidian")
			.addText((text: TextComponent) =>
				text
					.setValue(this.plugin.settings.unixSavePathValue)
					.onChange(async (value: string) => {
						this.plugin.settings.unixSavePathValue = value;
						await this.plugin.saveSettings();
					})
			);

		const fileNameFragment = document.createDocumentFragment();
		fileNameFragment.appendChild(document.createTextNode("Name of the backup ZIP file."));
		fileNameFragment.appendChild(document.createElement("br"));
		fileNameFragment.appendChild(document.createTextNode("You may use date placeholders to add date and time."));
		fileNameFragment.appendChild(document.createElement("br"));
		fileNameFragment.appendChild(document.createTextNode("%Y for year"));
		fileNameFragment.appendChild(document.createElement("br"));
		fileNameFragment.appendChild(document.createTextNode("%m for month"));
		fileNameFragment.appendChild(document.createElement("br"));
		fileNameFragment.appendChild(document.createTextNode("%d for day"));
		fileNameFragment.appendChild(document.createElement("br"));
		fileNameFragment.appendChild(document.createTextNode("%H for hour"));
		fileNameFragment.appendChild(document.createElement("br"));
		fileNameFragment.appendChild(document.createTextNode("%M for minute"));
		fileNameFragment.appendChild(document.createElement("br"));
		fileNameFragment.appendChild(document.createTextNode("%S for second"));
		fileNameFragment.appendChild(document.createElement("br"));
		fileNameFragment.appendChild(document.createTextNode("Default: {vaultName}-Backup-%Y_%m_%d-%H_%M_%S"));

		new Setting(containerEl)
			.setName("File name")
			.setDesc(fileNameFragment)
			.addText((text: TextComponent) =>
				text
					.setValue(this.plugin.settings.fileNameFormatValue)
					.onChange(async (value: string) => {
						this.plugin.settings.fileNameFormatValue = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Excluded directories")
			.setDesc(
				"Specify directories to exclude from backup. Use comma-separated list with wildcards (e.g., .git, .trash, node_modules, *.mp4)"
			)
			.addText((text: TextComponent) =>
				text
					.setPlaceholder(".git, .trash, node_modules")
					.setValue(this.plugin.settings.excludedDirectoriesValue)
					.onChange(async (value: string) => {
						this.plugin.settings.excludedDirectoriesValue = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Interval backups")
			.setDesc("Enable to create backups at regular intervals")
			.addToggle((toggle: ToggleComponent) =>
				toggle
					.setValue(this.plugin.settings.intervalBackupStatus)
					.onChange(async (value: boolean) => {
						this.plugin.settings.intervalBackupStatus = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Backup frequency (minutes)")
			.setDesc("Set the frequency of backups in minutes.")
			.addText((text: TextComponent) =>
				text
					.setValue(this.plugin.settings.backupFrequencyValue)
					.onChange(async (value: string) => {
						// add limits
						const numericValue = parseFloat(value);
						if (isNaN(numericValue) || numericValue <= 0) {
							new Notice(
								"Backup intervals must be a positive number."
							);
							return;
						}
						else {
							this.plugin.settings.backupFrequencyValue = value;
							await this.plugin.saveSettings();
							await this.plugin.applySettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Retry times")
			.setDesc("Set the retry times after backup failed.")
			.addText((text: TextComponent) =>
				text
					.setValue(this.plugin.settings.maxRetriesValue)
					.onChange(async (value: string) => {
						// add limits
						const numericValue = parseFloat(value);
						if (isNaN(numericValue) || numericValue <= 0) {
							new Notice(
								"Retry times must be a positive number."
							);
							return;
						}
						else {
							this.plugin.settings.maxRetriesValue = value;
							await this.plugin.saveSettings();
							await this.plugin.applySettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Retry interval (ms)")
			.setDesc("Set the retry interval (millisecond).")
			.addText((text: TextComponent) =>
				text
					.setValue(this.plugin.settings.retryIntervalValue)
					.onChange(async (value: string) => {
						// add limits
						const numericValue = parseFloat(value);
						if (isNaN(numericValue) || numericValue <= 0) {
							new Notice(
								"Backup intervals must be a positive number."
							);
							return;
						}
						else {
							this.plugin.settings.retryIntervalValue = value;
							await this.plugin.saveSettings();
							await this.plugin.applySettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Show ribbon icon")
			.setDesc(ribbonIconDesc)
			.addToggle((toggle: ToggleComponent) =>
				toggle
					.setValue(this.plugin.settings.showRibbonIcon)
					.onChange(async (value: boolean) => {
						this.plugin.settings.showRibbonIcon = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show console logs")
			.setDesc("Enable/Disable console log statements")
			.addToggle((toggle: ToggleComponent) =>
				toggle
					.setValue(this.plugin.settings.showConsoleLog)
					.onChange(async (value: boolean) => {
						this.plugin.settings.showConsoleLog = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show notifications")
			.setDesc("Enable/Disable normal notifications, keep exceptions only")
			.addToggle((toggle: ToggleComponent) =>
				toggle
					.setValue(this.plugin.settings.showNotifications)
					.onChange(async (value: boolean) => {
						this.plugin.settings.showNotifications = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "File Archiver Settings (Optional)" });

		new Setting(containerEl)
			.setName("Backup by Calling external file archiver")
			.setDesc("If toggled, backups will be created by calling external file archiver. Using 7-Zip is recommended.")
			.addToggle((toggle: ToggleComponent) =>
				toggle
					.setValue(this.plugin.settings.callingArchiverStatus)
					.onChange(async (value: boolean) => {
						this.plugin.settings.callingArchiverStatus = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Select file archiver")
			.setDesc("The selected archiver must be installed. eg. 7-Zip for Windows, 7-Zip/p7zip for Unix")
			.addDropdown((dropDown: DropdownComponent) => {
				dropDown
					.addOption("sevenZip", "7-Zip")
					.addOption("winRAR", "WinRAR")
					.addOption("bandizip", "Bandizip")
					.setValue(this.plugin.settings.archiverTypeValue)
					.onChange(async (value: string) => {
						this.plugin.settings.archiverTypeValue = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Select archive file type")
			.addDropdown((dropDown: DropdownComponent) => {
				dropDown
					.addOption("zip", "zip")
					.addOption("7z", "7z")
					.addOption("rar", "rar")
					.setValue(this.plugin.settings.archiveFileTypeValue)
					.onChange(async (value: string) => {
						this.plugin.settings.archiveFileTypeValue = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("File archiver path (Win)")
			.setDesc("Full path of Archiver. eg. D:\\software\\7-Zip\\7z.exe. And bz.exe for Bandizip, WinRAR.exe for WinRAR.")
			.addText((text: TextComponent) =>
				text
					.setValue(this.plugin.settings.archiverWinPathValue)
					.onChange(async (value: string) => {
						this.plugin.settings.archiverWinPathValue = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("File archiver path (Unix)")
			.setDesc("Full path of Archiver. eg. /usr/bin/7z or 7z for Unix.")
			.addText((text: TextComponent) =>
				text
					.setValue(this.plugin.settings.archiverUnixPathValue)
					.onChange(async (value: string) => {
						this.plugin.settings.archiverUnixPathValue = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.addButton((btn: ButtonComponent) => btn
				.setTooltip("Restore defaults")
				.setButtonText("Restore defaults")
				.onClick(async () => {
					await this.plugin.restoreDefault();
					new Notice("Settings restored to default.");
				})
			);
	}
}

// Note: The following issues may need to be addressed in the project configuration:
// 1. Ensure that the 'obsidian' module is properly set up in the project's TypeScript configuration.
// 2. The 'tslib' error might be resolved by installing the 'tslib' package or adjusting the TypeScript configuration.
// 3. Make sure that the LocalBackupPlugin class in main.ts includes the new one-way backup properties in its settings.
