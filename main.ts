import {
  App,
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
} from "obsidian";

import {
  EditorView,
  ViewUpdate,
} from "@codemirror/view";

type Rule = { from: string; to: string; isRegex?: boolean; flags?: string };

interface ArabicTransliterationSettings {
  enabled: boolean;
  convertOnSpace: boolean;
  // if true: "sh" before "s" etc.
  applyRulesInOrder: boolean;
  rules: Rule[];
}

const DEFAULT_SETTINGS: ArabicTransliterationSettings = {
  enabled: true,
  convertOnSpace: true,
  applyRulesInOrder: true,
  rules: [
    // --- digraphs (Arabic input habits) ---
    { from: "sh", to: "ش" },
    { from: "ch", to: "ش" }, // optional
    { from: "kh", to: "خ" },
    { from: "gh", to: "غ" },
    { from: "th", to: "ث" },
    { from: "dh", to: "ذ" },

    // --- arabizi digits (optional) ---
    { from: "3", to: "ع" },
    { from: "7", to: "ح" },
    { from: "9", to: "ق" },
    { from: "2", to: "ء" },
    { from: "5", to: "خ" },

    // --- single letters (simple, “letter alone” mapping) ---
    // Note: This is intentionally naive; Arabic needs vowels/hamza rules to be perfect.
    { from: "a", to: "ا" },
    { from: "b", to: "ب" },
    { from: "t", to: "ت" },
    { from: "j", to: "ج" },
    { from: "h", to: "ه" },
    { from: "d", to: "د" },
    { from: "r", to: "ر" },
    { from: "z", to: "ز" },
    { from: "s", to: "س" },
    { from: "f", to: "ف" },
    { from: "q", to: "ق" },
    { from: "k", to: "ك" },
    { from: "l", to: "ل" },
    { from: "m", to: "م" },
    { from: "n", to: "ن" },
    { from: "w", to: "و" },
    { from: "y", to: "ي" },
    { from: "g", to: "غ" }, // if you prefer "g" => "ج", change it in settings
    { from: "p", to: "ب" }, // optional
    { from: "v", to: "ف" }, // optional
  ],
};

const EXT_ORIGIN = "arabic-transliteration";
const IGNORE_ANNOTATION = "ar_translit_ignore";

function transliterateWord(word: string, settings: ArabicTransliterationSettings): string {
  if (!word) return word;

  // Only transliterate words containing latin letters or arabizi digits.
  // (Prevents messing up Arabic text or punctuation-only tokens)
  if (!/[a-zA-Z0-9]/.test(word)) return word;

  let out = word;

  const applyOne = (rule: Rule) => {
    if (rule.isRegex) {
      const re = new RegExp(rule.from, rule.flags ?? "g");
      out = out.replace(re, rule.to);
    } else {
      // global, case-insensitive for normal mapping
      // we’ll replace in a loop to avoid regex escaping issues
      const from = rule.from;
      if (!from) return;
      const re = new RegExp(escapeRegExp(from), "gi");
      out = out.replace(re, rule.to);
    }
  };

  if (settings.applyRulesInOrder) {
    for (const rule of settings.rules) applyOne(rule);
  } else {
    // If you ever want: auto-sort by length descending so digraphs win
    const sorted = [...settings.rules].sort((a, b) => (b.from?.length ?? 0) - (a.from?.length ?? 0));
    for (const rule of sorted) applyOne(rule);
  }

  return out;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findWordBeforePos(docText: string, pos: number): { start: number; end: number; word: string } | null {
  // pos is where the space was inserted (cursor after space).
  // We want the word immediately before the space: scan left skipping the space itself.
  let i = pos - 1;

  // If the last char is space/newline, move left once to the char before it
  while (i >= 0 && /\s/.test(docText[i])) i--;

  if (i < 0) return null;

  const end = i + 1;

  // word chars: letters, digits, apostrophe
  while (i >= 0 && /[A-Za-z0-9'_-]/.test(docText[i])) i--;

  const start = i + 1;
  if (start >= end) return null;

  const word = docText.slice(start, end);
  return { start, end, word };
}

export default class ArabicTransliterationPlugin extends Plugin {
  settings: ArabicTransliterationSettings;
  private statusEl: HTMLElement | null = null;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.addSettingTab(new ArabicTransliterationSettingTab(this.app, this));
    this.buildStatusBar();

    // Manual toggle command
    this.addCommand({
      id: "toggle-arabic-transliteration",
      name: "Toggle Arabic transliteration ON/OFF",
      callback: async () => {
        this.settings.enabled = !this.settings.enabled;
        await this.saveSettings();
        this.updateStatusBar();
        new Notice(`Arabic transliteration: ${this.settings.enabled ? "ON" : "OFF"}`);
      },
    });

    // Convert selection manually (still useful)
    this.addCommand({
      id: "convert-selection-arabic-transliteration",
      name: "Transliterate selection (Latin → Arabic)",
      editorCallback: (editor: Editor) => {
        const selected = editor.getSelection();
        if (!selected) {
          new Notice("Select some text first.");
          return;
        }
        const converted = this.transliterateText(selected);
        editor.replaceSelection(converted);
      },
    });

    // CodeMirror 6 listener: auto convert on space
    this.registerEditorExtension([
      EditorView.updateListener.of((update: ViewUpdate) => {
        try {
          if (!this.settings.enabled) return;
          if (!this.settings.convertOnSpace) return;
          if (!update.docChanged) return;

          // Ignore changes we made ourselves
          // @ts-expect-error: annotations are loosely typed
          const ann = update.transactions.some((tr) => tr.annotation?.(IGNORE_ANNOTATION));
          if (ann) return;

          // Only trigger if a space/newline was inserted (we’ll detect added text)
          let insertedSpace = false;
          let cursorPos: number | null = null;

          for (const tr of update.transactions) {
            if (!tr.docChanged) continue;

            // Determine if the user inserted a space in any change
            tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
              const ins = inserted.toString();
              if (ins.includes(" ") || ins.includes("\n")) insertedSpace = true;
            });

            // Cursor after the change (best effort)
            const sel = tr.newSelection?.main;
            if (sel) cursorPos = sel.head;
          }

          if (!insertedSpace || cursorPos == null) return;

          const docText = update.state.doc.toString();
          const found = findWordBeforePos(docText, cursorPos);
          if (!found) return;

          const converted = transliterateWord(found.word, this.settings);
          if (converted === found.word) return;

          // Apply replacement transaction with an annotation so we don’t re-trigger
          const view = update.view;
          view.dispatch({
            changes: { from: found.start, to: found.end, insert: converted },
            // @ts-expect-error: CM annotations are flexible
            annotations: (tr: any) => tr.annotation?.(IGNORE_ANNOTATION, true),
          });
        } catch (e) {
          // Avoid crashing the editor on errors
          console.error(`[${EXT_ORIGIN}] updateListener error`, e);
        }
      }),
    ]);

    this.updateStatusBar();
  }

  onunload() {
    this.statusEl?.remove();
    this.statusEl = null;
  }

  private transliterateText(text: string): string {
    // transliterate “word by word”, preserving spaces/punctuation
    return text.replace(/[A-Za-z0-9'_-]+/g, (w) => transliterateWord(w, this.settings));
  }

  private buildStatusBar() {
    this.statusEl = this.addStatusBarItem();
    this.statusEl.style.cursor = "pointer";
    this.statusEl.onclick = async () => {
      this.settings.enabled = !this.settings.enabled;
      await this.saveSettings();
      this.updateStatusBar();
      new Notice(`Arabic transliteration: ${this.settings.enabled ? "ON" : "OFF"}`);
    };
  }

  private updateStatusBar() {
    if (!this.statusEl) return;
    this.statusEl.setText(this.settings.enabled ? "AR Transliteration: ON" : "AR Transliteration: OFF");
    this.statusEl.setAttr("aria-label", "Click to toggle Arabic transliteration");
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class ArabicTransliterationSettingTab extends PluginSettingTab {
  plugin: ArabicTransliterationPlugin;

  constructor(app: App, plugin: ArabicTransliterationPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Arabic Transliteration Settings" });

    new Setting(containerEl)
      .setName("Enabled")
      .setDesc("Master toggle for the plugin.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enabled)
          .onChange(async (value) => {
            this.plugin.settings.enabled = value;
            await this.plugin.saveSettings();
            // @ts-ignore
            this.plugin.updateStatusBar?.();
          })
      );

    new Setting(containerEl)
      .setName("Auto-convert on Space")
      .setDesc("When you type a space/newline, transliterate the previous word.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.convertOnSpace)
          .onChange(async (value) => {
            this.plugin.settings.convertOnSpace = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Apply rules in order")
      .setDesc("If ON, rules are applied top-to-bottom exactly. Keep digraphs (sh/kh/gh) above single letters.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.applyRulesInOrder)
          .onChange(async (value) => {
            this.plugin.settings.applyRulesInOrder = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Rules" });
    containerEl.createEl("p", {
      text:
        "Edit your mapping rules as JSON. Each rule is { from, to } (plain text, case-insensitive). " +
        "For regex rules: { from, to, isRegex: true, flags: \"g\" }",
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
        // basic validation
        for (const r of parsed) {
          if (typeof r?.from !== "string" || typeof r?.to !== "string") {
            throw new Error("Each rule must have string fields: from, to.");
          }
        }
        this.plugin.settings.rules = parsed;
        await this.plugin.saveSettings();
        new Notice("Rules saved.");
      } catch (e: any) {
        new Notice(`Failed to save rules: ${e?.message ?? e}`);
      }
    };

    const resetBtn = btnRow.createEl("button", { text: "Reset to defaults" });
    resetBtn.style.marginLeft = "8px";
    resetBtn.onclick = async () => {
      this.plugin.settings.rules = DEFAULT_SETTINGS.rules;
      rulesArea.value = JSON.stringify(this.plugin.settings.rules, null, 2);
      await this.plugin.saveSettings();
      new Notice("Rules reset.");
    };
  }
}

