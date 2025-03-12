import { App, Plugin, addIcon, Notice, Workspace } from "obsidian";
import { join } from "path";
import { LocalBackupSettingTab } from "./settings";
import {
	replaceDatePlaceholdersWithValues,
	LocalBackupUtils,
	getDefaultPath,
	getDefaultName,
} from "./utils";
import { ICON_DATA } from "./constants";
import { NewVersionNotifyModal, PromptModal } from "./modals";

interface LocalBackupPluginSettings {
	versionValue: string;
	startupBackupStatus: boolean;
	onquitBackupStatus: boolean;
	lifecycleValue: string;
	backupsPerDayValue: string;
	maxRetriesValue: string;
	retryIntervalValue: string;
	winSavePathValue: string;
	unixSavePathValue: string;
	fileNameFormatValue: string;
	intervalBackupStatus: boolean;
	backupFrequencyValue: string;
	callingArchiverStatus: boolean;
	archiverTypeValue: string;
	archiveFileTypeValue: string;
	archiverWinPathValue: string;
	archiverUnixPathValue: string;
	showRibbonIcon: boolean;
	showConsoleLog: boolean;
	showNotifications: boolean;
	excludedDirectoriesValue: string;
}

const DEFAULT_SETTINGS: LocalBackupPluginSettings = {
	versionValue: "",
	startupBackupStatus: false,
	onquitBackupStatus: false,
	lifecycleValue: "3",
	backupsPerDayValue: "3",
	maxRetriesValue: "1",
	retryIntervalValue: "100",
	winSavePathValue: getDefaultPath(),
	unixSavePathValue: getDefaultPath(),
	fileNameFormatValue: getDefaultName(),
	intervalBackupStatus: false,
	backupFrequencyValue: "10",
	callingArchiverStatus: false,
	archiverTypeValue: "sevenZip",
	archiveFileTypeValue: "zip",
	archiverWinPathValue: "",
	archiverUnixPathValue: "",
	showRibbonIcon: true,
	showConsoleLog: false,
	showNotifications: true,
	excludedDirectoriesValue: "",
};

export default class LocalBackupPlugin extends Plugin {
	settings: LocalBackupPluginSettings;
	utils: LocalBackupUtils;
	intervalId: NodeJS.Timeout | null = null;

	async onload() {
		await this.loadSettings();

		const settingTab = new LocalBackupSettingTab(this.app, this);
		this.addSettingTab(settingTab);

		await this.loadUtis();

		// startup notice
		try {
			if (this.settings.versionValue !== this.manifest.version) {
				new NewVersionNotifyModal(this.app, this).open();
				await this.saveSettings();
			}
		} catch (error) {
			new Notice(
				`Please reconfigure \`Local Backup\` after upgrading to ${this.manifest.version}!`,
				10000
			);
		}

		// Run local backup command
		this.addCommand({
			id: "run-local-backup",
			name: "Run local backup",
			callback: async () => {
				await this.archiveVaultWithRetryAsync();
			},
		});
		this.addCommand({
			id: "run-specific-backup",
			name: "Run specific backup",
			callback: async () => {
				new PromptModal(
					"Input specific file name",
					"Specific-Backup-%Y_%m_%d-%H_%M_%S",
					false,
					this.app,
					this
				).open();
			},
		});

		// Add ribbon icon
		if (this.settings.showRibbonIcon) {
			addIcon("sidebar-icon", ICON_DATA);
			this.addRibbonIcon("sidebar-icon", "Run local backup", () => {
				if (this.settings.showNotifications) {
					new Notice("Running local backup...");
				}
				this.archiveVaultWithRetryAsync();
			});
		}

		// run startup codes.
		if (this.settings.startupBackupStatus) {
			await this.archiveVaultWithRetryAsync();
		}

		await this.applySettings();

		if (this.settings.onquitBackupStatus) {
			this.app.workspace.on("quit", () =>
				this.archiveVaultWithRetryAsync()
			);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async loadUtis() {
		this.utils = new LocalBackupUtils(this.app, this);
	}

	async saveSettings() {
		this.settings.versionValue = this.manifest.version;
		await this.saveData(this.settings);
	}

	async archiveVaultWithRetryAsync(specificFileName: string = "") {
		const maxRetries = parseInt(this.settings.maxRetriesValue);
		let retryCount = 0;

		const retryInterval = parseInt(this.settings.retryIntervalValue);

		while (retryCount < maxRetries) {
			try {
				await this.archiveVaultAsync(specificFileName);
				break;
			} catch (error) {
				console.error(
					`Error during archive attempt ${retryCount + 1}: ${error}`
				);
				retryCount++;

				if (retryCount < maxRetries) {
					await this.delay(retryInterval);
					if (this.settings.showConsoleLog) {
						console.log(
							`Retrying archive attempt ${retryCount + 1}...`
						);
					}
				} else {
					console.error(
						`Failed to create vault backup after ${maxRetries} attempts.`
					);
					new Notice(
						`Failed to create vault backup after ${maxRetries} attempts: ${error}`
					);
				}
			}
		}
	}

	async archiveVaultAsync(specificFileName: string) {
		try {
			await this.loadSettings();

			let fileName =
				specificFileName || this.settings.fileNameFormatValue;
			const fileNameWithDateValues =
				replaceDatePlaceholdersWithValues(fileName);
			const backupZipName = `${fileNameWithDateValues}.zip`;
			const vaultPath = (this.app.vault.adapter as any).basePath;
			const platform = process.platform;
			let savePathValue = "";
			let archiverPathValue = "";
			let lifecycleValue = "";
			let backupsPerDayValue = "";
			if (platform === "win32") {
				savePathValue = this.settings.winSavePathValue;
				archiverPathValue = this.settings.archiverWinPathValue;
			} else if (platform === "linux" || platform === "darwin") {
				savePathValue = this.settings.unixSavePathValue;
				archiverPathValue = this.settings.archiverUnixPathValue;
			}
			lifecycleValue = this.settings.lifecycleValue;
			backupsPerDayValue = this.settings.backupsPerDayValue;
			let backupFilePath = join(savePathValue, backupZipName);

			if (this.settings.callingArchiverStatus) {
				backupFilePath = join(
					savePathValue,
					`${fileNameWithDateValues}.${this.settings.archiveFileTypeValue}`
				);
				await this.utils.createFileByArchiver(
					this.settings.archiverTypeValue,
					archiverPathValue,
					this.settings.archiveFileTypeValue,
					vaultPath,
					backupFilePath
				);
			} else {
				await this.utils.createZipByAdmZip(vaultPath, backupFilePath);
			}

			if (this.settings.showConsoleLog) {
				console.log(`Vault backup created: ${backupFilePath}`);
			}
			if (this.settings.showNotifications) {
				new Notice(`Vault backup created: ${backupFilePath}`);
			}

			this.utils.deleteBackupsByLifeCycle(
				savePathValue,
				savePathValue,
				this.settings.fileNameFormatValue,
				lifecycleValue
			);

			this.utils.deletePerDayBackups(
				savePathValue,
				savePathValue,
				this.settings.fileNameFormatValue,
				backupsPerDayValue
			);
		} catch (error) {
			throw error;
		}
	}

	async delay(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async startAutoBackupInterval(intervalMinutes: number) {
		if (this.intervalId) {
			clearInterval(this.intervalId);
		}

		this.intervalId = setInterval(async () => {
			await this.archiveVaultWithRetryAsync();
		}, intervalMinutes * 60 * 1000);

		new Notice(
			`Auto backup interval started: Running every ${intervalMinutes} minutes.`
		);
	}

	stopAutoBackupInterval() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
			if (this.settings.showNotifications) {
				new Notice("Auto backup interval stopped.");
			}
		}
	}

	async applySettings() {
		await this.loadSettings();

		if (
			this.settings.intervalBackupStatus &&
			!isNaN(parseInt(this.settings.backupFrequencyValue))
		) {
			const intervalMinutes = parseInt(
				this.settings.backupFrequencyValue
			);
			await this.startAutoBackupInterval(intervalMinutes);
		} else if (!this.settings.intervalBackupStatus) {
			this.stopAutoBackupInterval();
		}
	}

	async restoreDefault() {
		this.settings = { ...DEFAULT_SETTINGS };
		this.settings.versionValue = this.manifest.version;
		await this.saveSettings();
	}

	onunload() {
		if (this.settings.showConsoleLog) {
			console.log("Local Backup unloaded");
		}
	}
}
