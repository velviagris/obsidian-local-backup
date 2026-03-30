import * as path from "path";
import * as fs from "fs-extra";
import AdmZip from "adm-zip";
import { exec, execSync } from "child_process";
import { App } from "obsidian";
import LocalBackupPlugin from "./main";
import { BACKUP_OUTPUT_PATH_ENV_KEY } from "./constants";

export class LocalBackupUtils {
	plugin: LocalBackupPlugin;

	constructor(app: App, plugin: LocalBackupPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Delete backups by lifecycleSetting
	 * @param savePath Backup directory (resolved)
	 * @param fileNameFormat
	 * @param lifecycle
	 * @returns
	 */
	deleteBackupsByLifeCycle(
		savePath: string,
		fileNameFormat: string,
		lifecycle: string
	) {
		this.log("Run deleteBackupsByLifeCycle", "log");

		const savePathSetting = savePath;

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
	 * @param savePath Backup directory (resolved)
	 * @param fileNameFormat
	 * @param backupsPerDay
	 */
	deletePerDayBackups(
		savePath: string,
		fileNameFormat: string,
		backupsPerDay: string
	) {
		this.log("Run deletePerDayBackups", "log");

		if (parseInt(backupsPerDay) === 0) {
			return;
		}

		const savePathSetting = savePath;

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

		const excludedPatterns = this.parsePatternList(
			this.plugin.settings.excludedDirectoriesValue
		);
		const includedPatterns = this.parsePatternList(
			this.plugin.settings.includedDirectoriesValue
		);

		if (
			(includedPatterns.length > 0 || excludedPatterns.length > 0) &&
			this.plugin.settings.showConsoleLog
		) {
			if (includedPatterns.length > 0) {
				this.log(`Including patterns: ${includedPatterns.join(", ")}`, "log");
			}
			if (excludedPatterns.length > 0) {
				this.log(`Excluding patterns: ${excludedPatterns.join(", ")}`, "log");
			}
		}

		// If no filters, add the entire folder
		if (excludedPatterns.length === 0 && includedPatterns.length === 0) {
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
					const stats = fs.statSync(fullPath);

					if (this.shouldExcludePath(entryRelativePath, excludedPatterns)) {
						continue;
					}

					if (stats.isDirectory()) {
						// Keep walking the tree so nested included files can still be found.
						addFilesRecursively(fullPath, entryRelativePath);
					} else if (
						this.shouldIncludePath(entryRelativePath, includedPatterns)
					) {
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
		const excludedPatterns = this.parsePatternList(
			this.plugin.settings.excludedDirectoriesValue
		);
		const includedPatterns = this.parsePatternList(
			this.plugin.settings.includedDirectoriesValue
		);
		const includedEntries = this.collectIncludedEntries(
			vaultPath,
			includedPatterns,
			excludedPatterns
		);

		// Prepare exclusion parameters for different archivers
		let exclusionParams = "";
		let inputSources = `"${vaultPath}"`;

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

		if (includedPatterns.length > 0) {
			this.log(`Including patterns for ${archiverType}: ${includedPatterns.join(", ")}`, "log");

			if (includedEntries.length === 0) {
				throw new Error(
					"No files or directories matched the Included directories setting."
				);
			}

			inputSources = includedEntries.map((entry) => `"${entry}"`).join(" ");
		}

		switch (archiverType) {
			case "sevenZip":
				const sevenZipPromise = new Promise<void>((resolve, reject) => {
					const command = `"${archiverPath}" a "${backupFilePath}" ${inputSources} ${exclusionParams} ${customizedArguments}`;
						this.log(`command: ${command}`, "log");

					exec(command, { cwd: includedPatterns.length > 0 ? vaultPath : undefined }, (error, stdout, stderr) => {
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
					const command = `"${archiverPath}" a -ep1 -rh ${exclusionParams} ${customizedArguments} "${backupFilePath}" ${includedPatterns.length > 0 ? inputSources : `"${vaultPath}\\*"`}`;
						this.log(`command: ${command}`, "log");

					exec(command, { cwd: includedPatterns.length > 0 ? vaultPath : undefined }, (error, stdout, stderr) => {
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
					const command = `"${archiverPath}" c ${exclusionParams} ${customizedArguments} "${backupFilePath}" ${inputSources}`;
						this.log(`command: ${command}`, "log");

					exec(command, { cwd: includedPatterns.length > 0 ? vaultPath : undefined }, (error, stdout, stderr) => {
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

	parsePatternList(value: string): string[] {
		return value
			.split(",")
			.map((pattern) => pattern.trim())
			.filter((pattern) => pattern.length > 0);
	}

	collectIncludedEntries(
		vaultPath: string,
		includedPatterns: string[],
		excludedPatterns: string[]
	): string[] {
		if (includedPatterns.length === 0) {
			return [];
		}

		const collectedEntries = new Set<string>();

		const walk = (dirPath: string, relativePath: string = "") => {
			const entries = fs.readdirSync(dirPath);

			for (const entry of entries) {
				const fullPath = path.join(dirPath, entry);
				const entryRelativePath = path.join(relativePath, entry);
				const stats = fs.statSync(fullPath);

				if (this.shouldExcludePath(entryRelativePath, excludedPatterns)) {
					continue;
				}

				if (
					stats.isDirectory() &&
					this.shouldIncludePath(entryRelativePath, includedPatterns)
				) {
					collectedEntries.add(entryRelativePath.replace(/\\/g, "/"));
					continue;
				}

				if (stats.isDirectory()) {
					walk(fullPath, entryRelativePath);
					continue;
				}

				if (this.shouldIncludePath(entryRelativePath, includedPatterns)) {
					collectedEntries.add(entryRelativePath.replace(/\\/g, "/"));
				}
			}
		};

		walk(vaultPath);

		return Array.from(collectedEntries);
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

		return this.matchesPatterns(filePath, excludedPatterns, "Excluding");
	}

	shouldIncludePath(filePath: string, includedPatterns: string[]): boolean {
		if (!includedPatterns || includedPatterns.length === 0) {
			return true;
		}

		return this.matchesPatterns(filePath, includedPatterns, "Including");
	}

	matchesPatterns(
		filePath: string,
		patterns: string[],
		actionLabel: string
	): boolean {
		const normalizedPath = filePath.replace(/\\/g, "/");

		for (const pattern of patterns) {
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
						`${actionLabel} path: ${filePath} (matched pattern: ${pattern})`, "log"
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
 * Parent directory of the vault folder (legacy default backup location).
 */
export function getDefaultPath(app: App): string {
	return path.dirname((app.vault.adapter as any).basePath);
}

/**
 * Default backup file name pattern including vault name.
 */
export function getDefaultName(app: App): string {
	const vaultName = app.vault.getName();
	const defaultDatePlaceholders = getDatePlaceholdersForISO(true);
	return `${vaultName}-Backup-${defaultDatePlaceholders}`;
}

/**
 * Windows: read User / Machine env from registry (System Properties / setx).
 * Electron's renderer often does not mirror these into process.env.
 */
function readWindowsRegistryEnv(key: string): string | undefined {
	const queries = [
		`reg query "HKCU\\Environment" /v ${key}`,
		`reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v ${key}`,
	];
	for (const cmd of queries) {
		try {
			const out = execSync(cmd, {
				encoding: "utf8",
				windowsHide: true,
				maxBuffer: 1024 * 1024,
			});
			for (const line of out.split(/\r?\n/)) {
				if (!line.includes(key) || !line.includes("REG_")) {
					continue;
				}
				const m = line.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+)$/);
				if (m) {
					return m[1].trim();
				}
			}
		} catch {
			/* key not in this hive */
		}
	}
	return undefined;
}

/**
 * Reads {@link BACKUP_OUTPUT_PATH_ENV_KEY} from the current process.
 * On Windows, matches env keys case-insensitively, then falls back to registry
 * (User/Machine) so values set in System Properties work even when the
 * renderer's process.env is incomplete.
 */
function getBackupPathFromEnv(): string | undefined {
	const key = BACKUP_OUTPUT_PATH_ENV_KEY;
	let v = process.env[key]?.trim();
	if (v) return v;
	if (process.platform === "win32") {
		const found = Object.keys(process.env).find(
			(k) => k.toUpperCase() === key.toUpperCase()
		);
		if (found) {
			v = process.env[found]?.trim();
			if (v) return v;
		}
		v = readWindowsRegistryEnv(key)?.trim();
		if (v) return v;
	}
	return undefined;
}

/**
 * Resolves backup output directory: env {@link BACKUP_OUTPUT_PATH_ENV_KEY} wins,
 * then non-empty plugin setting, then parent of vault.
 */
export function resolveBackupOutputPath(
	app: App,
	configuredPath: string
): string {
	const fromEnv = getBackupPathFromEnv();
	if (fromEnv) {
		return fromEnv;
	}
	const fromConfig = configuredPath?.trim();
	if (fromConfig) {
		return fromConfig;
	}
	return getDefaultPath(app);
}
