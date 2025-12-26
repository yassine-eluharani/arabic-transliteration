import esbuild from "esbuild";

esbuild.build({
  entryPoints: ["main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2020",
  platform: "browser",
  outfile: "dist/main.js",
  external: [
    "obsidian",
    "@codemirror/state",
    "@codemirror/view",
    "@codemirror/language",
    "@codemirror/commands",
    "@codemirror/search",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/history",
    "@codemirror/fold",
    "@codemirror/lint",
  ],
}).catch(() => process.exit(1));
