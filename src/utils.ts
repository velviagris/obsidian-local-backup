import * as path from "path";
import * as fs from "fs-extra";
import AdmZip from "adm-zip";
import { exec } from "child_process";
import { App } from "obsidian";
import LocalBackupPlugin from "./main";

export class LocalBackupUtils {
	plugin: LocalBackupPlugin;

	constructor(app: App, plugin: LocalBackupPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Delete backups by lifecycleSetting
	 * @param winSavePath
	 * @param unixSavePath
	 * @param fileNameFormat
	 * @param lifecycle
	 * @returns
	 */
	deleteBackupsByLifeCycle(
		winSavePath: string,
		unixSavePath: string,
		fileNameFormat: string,
		lifecycle: string
	) {
			this.log("Run deleteBackupsByLifeCycle", "log");

		const os = require("os");
		const platform = os.platform();
		let savePathSetting = "";

		if (platform === "win32") {
			savePathSetting = winSavePath;
		} else if (platform === "linux" || platform === "darwin") {
			savePathSetting = unixSavePath;
		}

		const currentDate = new Date();

		// calculate the target date
		if (parseInt(lifecycle) !== 0) {
			currentDate.setDate(currentDate.getDate() - parseInt(lifecycle));
		}

		fs.readdir(savePathSetting, (err, files) => {
			if (err) {
				this.log(err.message, "error");
				return;
			}

			// lifecycleSetting
			if (parseInt(lifecycle) !== 0) {
				files.forEach((file) => {
					const filePath = path.join(savePathSetting, file);
					const stats = fs.statSync(filePath);
					const fileNameRegex =
						this.generateRegexFromCustomPattern(fileNameFormat);
					const matchFileName = file.match(fileNameRegex);

					if (stats.isFile() && matchFileName !== null) {
						const parseTime = stats.mtime;
						const createDate = new Date(
							parseTime.getFullYear(),
							parseTime.getMonth(),
							parseTime.getDate()
						);

						if (createDate < currentDate) {
							fs.remove(filePath);
								this.log(`Backup removed by deleteBackupsByLifeCycle: ${filePath}`, "log");
						}
					}
				});
			}
		});
	}

	/**
	 * Delete backups by backupsPerDayValue
	 * @param winSavePath
	 * @param unixSavePath
	 * @param fileNameFormat
	 * @param backupsPerDay
	 */
	deletePerDayBackups(
		winSavePath: string,
		unixSavePath: string,
		fileNameFormat: string,
		backupsPerDay: string
	) {
			this.log("Run deletePerDayBackups", "log");

		if (parseInt(backupsPerDay) === 0) {
			return;
		}

		const os = require("os");
		const platform = os.platform();
		let savePathSetting = "";

		if (platform === "win32") {
			savePathSetting = winSavePath;
		} else if (platform === "linux" || platform === "darwin") {
			savePathSetting = unixSavePath;
		}

		fs.readdir(savePathSetting, (err, files) => {
			if (err) {
				this.log(err.message, "error");
				return;
			}

			const currentDate = new Date();
			currentDate.setHours(0, 0, 0, 0);
			const fileNameRegex =
				this.generateRegexFromCustomPattern(fileNameFormat);

			const backupFiles = files.filter((file) => {
				const filePath = path.join(savePathSetting, file);
				const stats = fs.statSync(filePath);
				const matchFileName = file.match(fileNameRegex);

				return stats.isFile() && matchFileName !== null;
			});

			const todayBackupFiles = backupFiles.filter((file) => {
				const filePath = path.join(savePathSetting, file);
				const stats = fs.statSync(filePath);
				const parseTime = stats.mtime;
				const createDate = new Date(
					parseTime.getFullYear(),
					parseTime.getMonth(),
					parseTime.getDate()
				);

				return createDate.getTime() === currentDate.getTime();
			});

			if (todayBackupFiles.length > parseInt(backupsPerDay)) {
				const filesToDelete = todayBackupFiles.slice(
					0,
					todayBackupFiles.length - parseInt(backupsPerDay)
				);

				filesToDelete.forEach((file) => {
					const filePath = path.join(savePathSetting, file);
					fs.remove(filePath, (err) => {
						if (err) {
							this.log(`Failed to remove backup file: ${filePath}, ${err.message}`, "error");
						} else {
								this.log(`Backup removed by deletePerDayBackups: ${filePath}`, "log");
						}
					});
				});
			}
		});
	}

	/**
	 * Generate regex from custom pattern,
	 * @param customPattern
	 * @returns
	 */
	generateRegexFromCustomPattern(customPattern: string): RegExp {
		// Replace placeholders like %Y, %m, etc. with corresponding regex patterns
		const regexPattern = customPattern
			.replace(/%Y/g, "\\d{4}") // Year
			.replace(/%m/g, "\\d{2}") // Month
			.replace(/%d/g, "\\d{2}") // Day
			.replace(/%H/g, "\\d{2}") // Hour
			.replace(/%M/g, "\\d{2}") // Minute
			.replace(/%S/g, "\\d{2}"); // Second

		// Create a regular expression to match the custom pattern
		return new RegExp(regexPattern);
	}

	/**
	 * Create zip file by adm-zip
	 * @param vaultPath
	 * @param backupZipPath
	 */
	async createZipByAdmZip(vaultPath: string, backupZipPath: string) {
		// const AdmZip = require("adm-zip");
		const zip = new AdmZip();

		// Get excluded patterns from settings
		const excludedPatterns = this.plugin.settings.excludedDirectoriesValue
			.split(",")
			.map((pattern) => pattern.trim())
			.filter((pattern) => pattern.length > 0);

		if (
			excludedPatterns.length > 0 &&
			this.plugin.settings.showConsoleLog
		) {
			this.log(`Excluding patterns: ${excludedPatterns.join(", ")}`, "log");
		}

		// If no exclusions, add the entire folder
		if (excludedPatterns.length === 0) {
			zip.addLocalFolder(vaultPath);
		} else {
			// Add files and folders selectively
			const fs = require("fs-extra");
			const path = require("path");

			// Function to recursively add files and folders
			const addFilesRecursively = (
				dirPath: string,
				relativePath: string = ""
			) => {
				const entries = fs.readdirSync(dirPath);

				for (const entry of entries) {
					const fullPath = path.join(dirPath, entry);
					const entryRelativePath = path.join(relativePath, entry);

					// Check if this path should be excluded
					if (
						this.shouldExcludePath(
							entryRelativePath,
							excludedPatterns
						)
					) {
						continue;
					}

					const stats = fs.statSync(fullPath);

					if (stats.isDirectory()) {
						// Recursively add subdirectories
						addFilesRecursively(fullPath, entryRelativePath);
					} else {
						// Add file to zip
						zip.addLocalFile(fullPath, relativePath);
					}
				}
			};

			// Start recursive addition from vault root
			addFilesRecursively(vaultPath);
		}

		await zip.writeZipPromise(backupZipPath);
	}

	/**
	 * Create file by external archiver
	 * @param archiverType
	 * @param archiverPath
	 * @param vaultPath
	 * @param backupZipPath
	 * @returns
	 */
	async createFileByArchiver(
		archiverType: string,
		archiverPath: string,
		archiveFileType: string,
		vaultPath: string,
		backupFilePath: string,
		customizedArguments: string
	) {
		// Get excluded patterns from settings
		const excludedPatterns = this.plugin.settings.excludedDirectoriesValue
			.split(",")
			.map((pattern) => pattern.trim())
			.filter((pattern) => pattern.length > 0);

		// Prepare exclusion parameters for different archivers
		let exclusionParams = "";

		if (excludedPatterns.length > 0) {
				this.log(`Excluding patterns for ${archiverType}: ${excludedPatterns.join(
						", "
					)}`, "log");

			switch (archiverType) {
				case "sevenZip":
					// 7-Zip uses -xr!pattern for exclusions
					exclusionParams = excludedPatterns
						.map((pattern) => `-xr!${pattern}`)
						.join(" ");
					break;
				case "winRAR":
					// WinRAR uses -xpattern for exclusions
					exclusionParams = excludedPatterns
						.map((pattern) => `-x${pattern}`)
						.join(" ");
					break;
				case "bandizip":
					// Bandizip uses -ex:{list} for exclusions
					const exclusions = excludedPatterns
						.map((pattern) => `${pattern}/*`)
						.join(";");
					exclusionParams = `-ex:"${exclusions}"`;
					break;
			}
		}

		switch (archiverType) {
			case "sevenZip":
				const sevenZipPromise = new Promise<void>((resolve, reject) => {
					const command = `"${archiverPath}" a "${backupFilePath}" "${vaultPath}" ${exclusionParams} ${customizedArguments}`;
						this.log(`command: ${command}`, "log");

					exec(command, (error, stdout, stderr) => {
						if (error) {
							this.log(`Failed to create file by 7-Zip: ${error.message}`, "error");
							reject(error);
						} else {
								this.log("File created by 7-Zip successfully.", "log");
							resolve();
						}
					});
				});
				return sevenZipPromise;

			case "winRAR":
				const winRARPromise = new Promise<void>((resolve, reject) => {
					const command = `"${archiverPath}" a -ep1 -rh ${exclusionParams} ${customizedArguments} "${backupFilePath}" "${vaultPath}\\*"`;
						this.log(`command: ${command}`, "log");

					exec(command, (error, stdout, stderr) => {
						if (error) {
							this.log(`Failed to create file by WinRAR: ${error.message}`, "error");
							reject(error);
						} else {
								this.log("File created by WinRAR successfully.", "log");
							resolve();
						}
					});
				});
				return winRARPromise;

			case "bandizip":
				const bandizipPromise = new Promise<void>((resolve, reject) => {
					const command = `"${archiverPath}" c ${exclusionParams} ${customizedArguments} "${backupFilePath}" "${vaultPath}"`;
						this.log(`command: ${command}`, "log");

					exec(command, (error, stdout, stderr) => {
						if (error) {
							this.log(`Failed to create file by Bandizip: ${error.message}`, "error");
							reject(error);
						} else {
								this.log("File created by Bandizip successfully.", "log");
							resolve();
						}
					});
				});
				return bandizipPromise;

			default:
				break;
		}
	}

	/**
	 * Check if a path should be excluded based on the wildcards
	 * @param filePath The path to check
	 * @param excludedPatterns Array of patterns to exclude
	 * @returns True if the path should be excluded, false otherwise
	 */
	shouldExcludePath(filePath: string, excludedPatterns: string[]): boolean {
		if (!excludedPatterns || excludedPatterns.length === 0) {
			return false;
		}

		const normalizedPath = filePath.replace(/\\/g, "/");

		for (const pattern of excludedPatterns) {
			if (!pattern.trim()) continue;

			// Convert glob pattern to regex
			const regexPattern = pattern
				.trim()
				.replace(/\./g, "\\.") // Escape dots
				.replace(/\*/g, ".*") // Convert * to .*
				.replace(/\?/g, "."); // Convert ? to .

			const regex = new RegExp(regexPattern, "i");

			if (regex.test(normalizedPath)) {
					this.log(
						`Excluding path: ${filePath} (matched pattern: ${pattern})`, "log"
					);
				return true;
			}
		}

		return false;
	}

	/**
	 * Logging function
	 * @param message
	 * @param type
	 */
	log(message: string, type: string) {
		if (this.plugin.settings.showConsoleLog) {
			switch (type) {
				case "log":
					console.log(message);
					break;
				case "error":
					console.error(message);
					break;
				case "debug":
					console.debug(message);
					break;
				default:
					console.log(message);
					break;
			}
		}
	}
}

/**
 * Replaces date placeholders (%Y, %m, etc) with their appropriate values (2021, 01, etc)
 * @param value - The string to replace placeholders in
 */
export const replaceDatePlaceholdersWithValues = (value: string) => {
	const now = new Date();
	if (value.includes("%Y")) {
		value = value.replace(/%Y/g, now.getFullYear().toString());
	}

	if (value.includes("%m")) {
		value = value.replace(
			/%m/g,
			(now.getMonth() + 1).toString().padStart(2, "0")
		);
	}

	if (value.includes("%d")) {
		value = value.replace(/%d/g, now.getDate().toString().padStart(2, "0"));
	}

	if (value.includes("%H")) {
		value = value.replace(
			/%H/g,
			now.getHours().toString().padStart(2, "0")
		);
	}

	if (value.includes("%M")) {
		value = value.replace(
			/%M/g,
			now.getMinutes().toString().padStart(2, "0")
		);
	}

	if (value.includes("%S")) {
		value = value.replace(
			/%S/g,
			now.getSeconds().toString().padStart(2, "0")
		);
	}

	return value;
};

/**
 * Gets the date placeholders for ISO8604 format (YYYY-MM-DDTHH:MM:SS)
 * We return underscores instead of dashes to separate the date and time
 * @returns Returns iso date placeholders
 */
export const getDatePlaceholdersForISO = (includeTime: boolean) => {
	if (includeTime) {
		return "%Y_%m_%d-%H_%M_%S";
	}
	return "%Y_%m_%d";
};

/**
 * Get path of current vault
 * @returns
 */
export function getDefaultPath(): string {
	const defaultPath = path.dirname((this.app.vault.adapter as any).basePath);
	// this.settings.savePathSetting = defaultPath
	return defaultPath;
}

/**
 * Get default backup name
 * @returns
 */
export function getDefaultName(): string {
	const vaultName = this.app.vault.getName();
	const defaultDatePlaceholders = getDatePlaceholdersForISO(true);
	return `${vaultName}-Backup-${defaultDatePlaceholders}`;
}
