"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ArabicTransliterationPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_view = require("@codemirror/view");
var DEFAULT_SETTINGS = {
  enabled: true,
  convertOnSpace: true,
  applyRulesInOrder: true,
  rules: [
    // --- digraphs (Arabic input habits) ---
    { from: "sh", to: "\u0634" },
    { from: "ch", to: "\u0634" },
    // optional
    { from: "kh", to: "\u062E" },
    { from: "gh", to: "\u063A" },
    { from: "th", to: "\u062B" },
    { from: "dh", to: "\u0630" },
    // --- arabizi digits (optional) ---
    { from: "3", to: "\u0639" },
    { from: "7", to: "\u062D" },
    { from: "9", to: "\u0642" },
    { from: "2", to: "\u0621" },
    { from: "5", to: "\u062E" },
    // --- single letters (simple, “letter alone” mapping) ---
    // Note: This is intentionally naive; Arabic needs vowels/hamza rules to be perfect.
    { from: "a", to: "\u0627" },
    { from: "b", to: "\u0628" },
    { from: "t", to: "\u062A" },
    { from: "j", to: "\u062C" },
    { from: "h", to: "\u0647" },
    { from: "d", to: "\u062F" },
    { from: "r", to: "\u0631" },
    { from: "z", to: "\u0632" },
    { from: "s", to: "\u0633" },
    { from: "f", to: "\u0641" },
    { from: "q", to: "\u0642" },
    { from: "k", to: "\u0643" },
    { from: "l", to: "\u0644" },
    { from: "m", to: "\u0645" },
    { from: "n", to: "\u0646" },
    { from: "w", to: "\u0648" },
    { from: "y", to: "\u064A" },
    { from: "g", to: "\u063A" },
    // if you prefer "g" => "ج", change it in settings
    { from: "p", to: "\u0628" },
    // optional
    { from: "v", to: "\u0641" }
    // optional
  ]
};
var EXT_ORIGIN = "arabic-transliteration";
var IGNORE_ANNOTATION = "ar_translit_ignore";
function transliterateWord(word, settings) {
  if (!word) return word;
  if (!/[a-zA-Z0-9]/.test(word)) return word;
  let out = word;
  const applyOne = (rule) => {
    if (rule.isRegex) {
      const re = new RegExp(rule.from, rule.flags ?? "g");
      out = out.replace(re, rule.to);
    } else {
      const from = rule.from;
      if (!from) return;
      const re = new RegExp(escapeRegExp(from), "gi");
      out = out.replace(re, rule.to);
    }
  };
  if (settings.applyRulesInOrder) {
    for (const rule of settings.rules) applyOne(rule);
  } else {
    const sorted = [...settings.rules].sort((a, b) => (b.from?.length ?? 0) - (a.from?.length ?? 0));
    for (const rule of sorted) applyOne(rule);
  }
  return out;
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function findWordBeforePos(docText, pos) {
  let i = pos - 1;
  while (i >= 0 && /\s/.test(docText[i])) i--;
  if (i < 0) return null;
  const end = i + 1;
  while (i >= 0 && /[A-Za-z0-9'_-]/.test(docText[i])) i--;
  const start = i + 1;
  if (start >= end) return null;
  const word = docText.slice(start, end);
  return { start, end, word };
}
var ArabicTransliterationPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.statusEl = null;
  }
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new ArabicTransliterationSettingTab(this.app, this));
    this.buildStatusBar();
    this.addCommand({
      id: "toggle-arabic-transliteration",
      name: "Toggle Arabic transliteration ON/OFF",
      callback: async () => {
        this.settings.enabled = !this.settings.enabled;
        await this.saveSettings();
        this.updateStatusBar();
        new import_obsidian.Notice(`Arabic transliteration: ${this.settings.enabled ? "ON" : "OFF"}`);
      }
    });
    this.addCommand({
      id: "convert-selection-arabic-transliteration",
      name: "Transliterate selection (Latin \u2192 Arabic)",
      editorCallback: (editor) => {
        const selected = editor.getSelection();
        if (!selected) {
          new import_obsidian.Notice("Select some text first.");
          return;
        }
        const converted = this.transliterateText(selected);
        editor.replaceSelection(converted);
      }
    });
    this.registerEditorExtension([
      import_view.EditorView.updateListener.of((update) => {
        try {
          if (!this.settings.enabled) return;
          if (!this.settings.convertOnSpace) return;
          if (!update.docChanged) return;
          const ann = update.transactions.some((tr) => tr.annotation?.(IGNORE_ANNOTATION));
          if (ann) return;
          let insertedSpace = false;
          let cursorPos = null;
          for (const tr of update.transactions) {
            if (!tr.docChanged) continue;
            tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
              const ins = inserted.toString();
              if (ins.includes(" ") || ins.includes("\n")) insertedSpace = true;
            });
            const sel = tr.newSelection?.main;
            if (sel) cursorPos = sel.head;
          }
          if (!insertedSpace || cursorPos == null) return;
          const docText = update.state.doc.toString();
          const found = findWordBeforePos(docText, cursorPos);
          if (!found) return;
          const converted = transliterateWord(found.word, this.settings);
          if (converted === found.word) return;
          const view = update.view;
          view.dispatch({
            changes: { from: found.start, to: found.end, insert: converted },
            // @ts-expect-error: CM annotations are flexible
            annotations: (tr) => tr.annotation?.(IGNORE_ANNOTATION, true)
          });
        } catch (e) {
          console.error(`[${EXT_ORIGIN}] updateListener error`, e);
        }
      })
    ]);
    this.updateStatusBar();
  }
  onunload() {
    this.statusEl?.remove();
    this.statusEl = null;
  }
  transliterateText(text) {
    return text.replace(/[A-Za-z0-9'_-]+/g, (w) => transliterateWord(w, this.settings));
  }
  buildStatusBar() {
    this.statusEl = this.addStatusBarItem();
    this.statusEl.style.cursor = "pointer";
    this.statusEl.onclick = async () => {
      this.settings.enabled = !this.settings.enabled;
      await this.saveSettings();
      this.updateStatusBar();
      new import_obsidian.Notice(`Arabic transliteration: ${this.settings.enabled ? "ON" : "OFF"}`);
    };
  }
  updateStatusBar() {
    if (!this.statusEl) return;
    this.statusEl.setText(this.settings.enabled ? "AR Transliteration: ON" : "AR Transliteration: OFF");
    this.statusEl.setAttr("aria-label", "Click to toggle Arabic transliteration");
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var ArabicTransliterationSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Arabic Transliteration Settings" });
    new import_obsidian.Setting(containerEl).setName("Enabled").setDesc("Master toggle for the plugin.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
        this.plugin.settings.enabled = value;
        await this.plugin.saveSettings();
        this.plugin.updateStatusBar?.();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Auto-convert on Space").setDesc("When you type a space/newline, transliterate the previous word.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.convertOnSpace).onChange(async (value) => {
        this.plugin.settings.convertOnSpace = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Apply rules in order").setDesc("If ON, rules are applied top-to-bottom exactly. Keep digraphs (sh/kh/gh) above single letters.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.applyRulesInOrder).onChange(async (value) => {
        this.plugin.settings.applyRulesInOrder = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "Rules" });
    containerEl.createEl("p", {
      text: 'Edit your mapping rules as JSON. Each rule is { from, to } (plain text, case-insensitive). For regex rules: { from, to, isRegex: true, flags: "g" }'
    });
    const rulesArea = containerEl.createEl("textarea");
    rulesArea.style.width = "100%";
    rulesArea.style.minHeight = "260px";
    rulesArea.value = JSON.stringify(this.plugin.settings.rules, null, 2);
    const btnRow = containerEl.createDiv({ cls: "setting-item" });
    const saveBtn = btnRow.createEl("button", { text: "Save rules" });
    saveBtn.onclick = async () => {
      try {
        const parsed = JSON.parse(rulesArea.value);
        if (!Array.isArray(parsed)) throw new Error("Rules must be an array.");
        for (const r of parsed) {
          if (typeof r?.from !== "string" || typeof r?.to !== "string") {
            throw new Error("Each rule must have string fields: from, to.");
          }
        }
        this.plugin.settings.rules = parsed;
        await this.plugin.saveSettings();
        new import_obsidian.Notice("Rules saved.");
      } catch (e) {
        new import_obsidian.Notice(`Failed to save rules: ${e?.message ?? e}`);
      }
    };
    const resetBtn = btnRow.createEl("button", { text: "Reset to defaults" });
    resetBtn.style.marginLeft = "8px";
    resetBtn.onclick = async () => {
      this.plugin.settings.rules = DEFAULT_SETTINGS.rules;
      rulesArea.value = JSON.stringify(this.plugin.settings.rules, null, 2);
      await this.plugin.saveSettings();
      new import_obsidian.Notice("Rules reset.");
    };
  }
};
