import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { GenerateModal } from "./GenerateModal";
import { ValidateModal } from "./ValidateModal";

export interface AKFSettings {
  model: string;
  defaultDomain: string;
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  groqApiKey: string;
}

const DEFAULT_SETTINGS: AKFSettings = {
  model: "claude",
  defaultDomain: "",
  anthropicApiKey: "",
  openaiApiKey: "",
  geminiApiKey: "",
  groqApiKey: "",
};

export default class ObsidianAKFPlugin extends Plugin {
  settings!: AKFSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new AKFSettingsTab(this.app, this));

    this.addCommand({
      id: "akf-generate",
      name: "Generate knowledge file",
      hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "G" }],
      callback: () => {
        new GenerateModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "akf-validate-file",
      name: "Validate current file",
      hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "V" }],
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          new ValidateModal(this.app, this, file.path).open();
        } else {
          new Notice("No file is currently open.");
        }
      },
    });

    this.addCommand({
      id: "akf-validate-vault",
      name: "Validate entire vault",
      callback: async () => {
        const { validate } = await import("./Validator");
        const { parseFrontmatter, loadAllowedDomains } = await import("./utils");
        const notice = new Notice("⏳ Validating vault...", 0);
        const allowedDomains = await loadAllowedDomains(this.app);
        const files = this.app.vault.getMarkdownFiles();
        let errorCount = 0;
        for (const file of files) {
          const content = await this.app.vault.read(file);
          const parsed = parseFrontmatter(content);
          if (!parsed) continue;
          const result = validate(parsed.frontmatter, parsed.body, allowedDomains);
          if (!result.is_valid) errorCount += result.errors.length;
        }
        notice.hide();
        if (errorCount === 0) {
          new Notice("✅ Vault is valid!");
        } else {
          new Notice(`❌ Found ${errorCount} error(s) — open a file and use Ctrl+Shift+V for details`);
        }
      },
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class AKFSettingsTab extends PluginSettingTab {
  plugin: ObsidianAKFPlugin;

  constructor(app: App, plugin: ObsidianAKFPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "AI Knowledge Filler" });

    containerEl.createEl("p", {
      text: "AI-powered knowledge generation with schema validation",
      attr: { style: "color: var(--text-muted); margin-bottom: 20px;" },
    });

    // API Key Status
    containerEl.createEl("h3", { text: "API Key Status" });
    const { anthropicApiKey, openaiApiKey, geminiApiKey, groqApiKey } = this.plugin.settings;
    const statusEl = containerEl.createDiv({
      attr: {
        style:
          "padding: 12px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 20px;",
      },
    });
    const statusItems = [
      { label: "Claude (Anthropic)", key: anthropicApiKey },
      { label: "OpenAI (GPT-4)", key: openaiApiKey },
      { label: "Google (Gemini)", key: geminiApiKey },
      { label: "Groq", key: groqApiKey },
    ];
    for (const item of statusItems) {
      const configured = !!item.key;
      statusEl.createEl("p", {
        text: `${configured ? "✅" : "⬜"} ${item.label}`,
        attr: {
          style: `margin: 4px 0; color: ${configured ? "var(--color-green)" : "var(--text-muted)"};`,
        },
      });
    }

    // Model selection
    containerEl.createEl("h3", { text: "Settings" });

    new Setting(containerEl)
      .setName("Default model")
      .setDesc("LLM provider to use for generation")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            claude: "Claude (Anthropic)",
            gpt4: "GPT-4 (OpenAI)",
            gemini: "Gemini (Google)",
            groq: "Groq",
          })
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default domain")
      .setDesc("Domain for generated files (e.g., ai-system, devops, security)")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.defaultDomain)
          .onChange(async (value) => {
            this.plugin.settings.defaultDomain = value;
            await this.plugin.saveSettings();
          })
      );

    // API keys
    containerEl.createEl("h3", { text: "API Keys" });

    containerEl.createEl("p", {
      text: "At least one API key is required for generation.",
      attr: { style: "color: var(--text-muted); font-size: 0.9em; margin-bottom: 12px;" },
    });

    this.addApiKeySetting("Anthropic (Claude)", "sk-ant-...", "anthropicApiKey");
    this.addApiKeySetting("OpenAI (GPT-4)", "sk-...", "openaiApiKey");
    this.addApiKeySetting("Google (Gemini)", "AIza...", "geminiApiKey");
    this.addApiKeySetting("Groq", "gsk_...", "groqApiKey");

    // Quick help
    containerEl.createEl("h3", { text: "Quick Help" });
    containerEl.createEl("p", {
      text: "Ctrl+Shift+G — Generate file\nCtrl+Shift+V — Validate current file",
      attr: { style: "color: var(--text-muted); font-size: 0.85em; white-space: pre-line;" },
    });

    // Error code reference
    containerEl.createEl("h3", { text: "Validation Error Codes" });
    const codes = [
      "E001 — Invalid enum (type, level, status)",
      "E002 — Required field missing",
      "E003 — Date not ISO 8601 format",
      "E004 — Type mismatch (tags must be array, title must be string)",
      "E005 — General schema violation",
      "E006 — Domain not in taxonomy",
      "E007 — created date is after updated date",
      "E008 — Invalid relationship type in [[Note|type]] syntax",
    ];
    for (const code of codes) {
      containerEl.createEl("p", {
        text: code,
        attr: { style: "font-size: 0.85em; margin: 3px 0; color: var(--text-muted);" },
      });
    }
  }

  private addApiKeySetting(
    name: string,
    placeholder: string,
    key: keyof AKFSettings
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .addText((text) =>
        text
          .setPlaceholder(placeholder)
          .setValue((this.plugin.settings[key] as string) || "")
          .onChange(async (value) => {
            (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
            await this.plugin.saveSettings();
            this.display();
          })
          .inputEl.setAttribute("type", "password")
      );
  }
}
