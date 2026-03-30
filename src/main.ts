import { App, Plugin, addIcon, Notice, Workspace } from "obsidian";
import { join } from "path";
import { LocalBackupSettingTab } from "./settings";
import {
	replaceDatePlaceholdersWithValues,
	LocalBackupUtils,
	getDefaultName,
	resolveBackupOutputPath,
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
	/** Optional; empty uses OBSIDIAN_LOCAL_BACKUP_PATH env, then vault parent. */
	backupOutputPathValue: string;
	fileNameFormatValue: string;
	intervalBackupStatus: boolean;
	backupFrequencyValue: string;
	callingArchiverStatus: boolean;
	archiverTypeValue: string;
	archiveFileTypeValue: string;
	archiverWinPathValue: string;
	archiverUnixPathValue: string;
	showConsoleLog: boolean;
	showNotifications: boolean;
	excludedDirectoriesValue: string;
	includedDirectoriesValue: string;
	customizedArguments: string;
}

const DEFAULT_SETTINGS: LocalBackupPluginSettings = {
	versionValue: "",
	startupBackupStatus: false,
	onquitBackupStatus: false,
	lifecycleValue: "3",
	backupsPerDayValue: "3",
	maxRetriesValue: "1",
	retryIntervalValue: "100",
	backupOutputPathValue: "",
	fileNameFormatValue: "Backup-%Y_%m_%d-%H_%M_%S",
	intervalBackupStatus: false,
	backupFrequencyValue: "10",
	callingArchiverStatus: false,
	archiverTypeValue: "sevenZip",
	archiveFileTypeValue: "zip",
	archiverWinPathValue: "",
	archiverUnixPathValue: "",
	showConsoleLog: false,
	showNotifications: true,
	excludedDirectoriesValue: "",
	includedDirectoriesValue: "",
	customizedArguments: "",
};

export default class LocalBackupPlugin extends Plugin {
	settings: LocalBackupPluginSettings;
	utils: LocalBackupUtils;
	intervalId: NodeJS.Timeout | null = null;

	async onload() {
		await this.loadSettings();

		const settingTab = new LocalBackupSettingTab(this.app, this);
		this.addSettingTab(settingTab);

		await this.loadUtils();

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
		const raw = await this.loadData();
		const merged = Object.assign(
			{},
			DEFAULT_SETTINGS,
			raw
		) as LocalBackupPluginSettings;
		if (
			raw &&
			!("backupOutputPathValue" in raw) &&
			(("winSavePathValue" in raw && (raw as any).winSavePathValue) ||
				("unixSavePathValue" in raw && (raw as any).unixSavePathValue))
		) {
			const legacy =
				process.platform === "win32"
					? (raw as any).winSavePathValue
					: (raw as any).unixSavePathValue;
			if (typeof legacy === "string" && legacy.trim() !== "") {
				merged.backupOutputPathValue = legacy;
			}
		}
		this.settings = merged;
	}

	async loadUtils() {
		this.utils = new LocalBackupUtils(this.app, this);
	}

	async saveSettings() {
		this.settings.versionValue = this.manifest.version;
		const payload = { ...this.settings } as Record<string, unknown>;
		delete payload.winSavePathValue;
		delete payload.unixSavePathValue;
		await this.saveData(payload);
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
				this.utils.log(
					`Error during archive attempt ${retryCount + 1}: ${error}`,
					"error"
				);
				retryCount++;

				if (retryCount < maxRetries) {
					await this.delay(retryInterval);
					this.utils.log(
						`Retrying archive attempt ${retryCount + 1}...`,
						"log"
					);
				} else {
					this.utils.log(
						`Failed to create vault backup after ${maxRetries} attempts.`,
						"error"
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
			const savePathValue = resolveBackupOutputPath(
				this.app,
				this.settings.backupOutputPathValue
			);
			let archiverPathValue = "";
			if (platform === "win32") {
				archiverPathValue = this.settings.archiverWinPathValue;
			} else if (platform === "linux" || platform === "darwin") {
				archiverPathValue = this.settings.archiverUnixPathValue;
			}
			let lifecycleValue = "";
			let backupsPerDayValue = "";
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
					backupFilePath,
					this.settings.customizedArguments
				);
			} else {
				await this.utils.createZipByAdmZip(vaultPath, backupFilePath);
			}

			this.utils.log(`Vault backup created: ${backupFilePath}`, "log");
			if (this.settings.showNotifications) {
				new Notice(`Vault backup created: ${backupFilePath}`);
			}

			this.utils.deleteBackupsByLifeCycle(
				savePathValue,
				this.settings.fileNameFormatValue,
				lifecycleValue
			);

			this.utils.deletePerDayBackups(
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
		this.settings.fileNameFormatValue = getDefaultName(this.app);
		await this.saveSettings();
	}

	onunload() {
		this.utils.log("Local Backup unloaded", "log");
	}
}
