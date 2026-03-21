import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const targetVersion = process.env.npm_package_version;

// Update manifest.json (local)
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// Update versions.json (local)
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

// Also update root-level copies (for Obsidian community plugin registry)
const rootManifest = resolve("..", "manifest.json");
const rootVersions = resolve("..", "versions.json");
if (existsSync(rootManifest)) {
  writeFileSync(rootManifest, JSON.stringify(manifest, null, "\t"));
}
if (existsSync(rootVersions)) {
  writeFileSync(rootVersions, JSON.stringify(versions, null, "\t"));
}
