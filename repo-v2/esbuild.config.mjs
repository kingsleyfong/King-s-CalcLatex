import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import path from "path";

const prod = process.argv[2] === "production";
const vaultPluginDir = "C:/Users/Kingsley/Documents/Obsidian Vault/.obsidian/plugins/kings-calclatex";

const syncVaultPlugin = {
  name: "sync-vault-plugin",
  setup(build) {
    build.onEnd(() => {
      setTimeout(() => {
        try {
          if (fs.existsSync("main.js")) {
            fs.copyFileSync("main.js", path.join(vaultPluginDir, "main.js"));
          }
          if (fs.existsSync("styles.css")) {
            fs.copyFileSync("styles.css", path.join(vaultPluginDir, "styles.css"));
          }
          if (fs.existsSync("manifest.json")) {
            fs.copyFileSync("manifest.json", path.join(vaultPluginDir, "manifest.json"));
          }
          console.log("[esbuild] Synced build to Obsidian vault plugin directory.");
        } catch (e) {
          console.error("[esbuild] Failed to sync to vault plugin directory:", e);
        }
      }, 50);
    });
  },
};

const aliasSrcPlugin = {
  name: "alias-src-plugin",
  setup(build) {
    build.onResolve({ filter: /^src\// }, (args) => {
      const rel = args.path.substring(4);
      const basePath = path.resolve("src/latex-suite", rel);
      if (fs.existsSync(basePath)) return { path: basePath };
      if (fs.existsSync(basePath + ".ts")) return { path: basePath + ".ts" };
      if (fs.existsSync(basePath + ".js")) return { path: basePath + ".js" };
      if (fs.existsSync(basePath + "/index.ts")) return { path: basePath + "/index.ts" };
      return null;
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: false,
  outfile: "main.js",
  loader: {
    ".glsl": "text",
  },
  plugins: [aliasSrcPlugin, syncVaultPlugin],
  minify: prod,
  define: {
    "process.env.NODE_ENV": prod ? '"production"' : '"development"',
  },
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
