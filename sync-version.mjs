/**
 * Single source of truth: manifest.json (version + minAppVersion).
 * Run after editing manifest.json: npm run sync-version
 * Updates package.json "version" and merges versions.json for Obsidian releases.
 */
import { readFileSync, writeFileSync } from "fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { version, minAppVersion } = manifest;

if (!version || typeof minAppVersion !== "string") {
	console.error("manifest.json must include \"version\" and \"minAppVersion\".");
	process.exit(1);
}

const pkgPath = "package.json";
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t") + "\n");

const versionsPath = "versions.json";
const versions = JSON.parse(readFileSync(versionsPath, "utf8"));
versions[version] = minAppVersion;
writeFileSync(versionsPath, JSON.stringify(versions, null, "\t") + "\n");

console.log(
	`Synced from manifest.json → ${version} (minApp: ${minAppVersion}). Updated package.json and versions.json.`
);
console.log("If you use npm lockfile, run: npm install");
