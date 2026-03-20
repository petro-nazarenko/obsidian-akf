import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { SubprocessManager } from "./SubprocessManager";
import { GenerateModal } from "./GenerateModal";
import { ValidateModal } from "./ValidateModal";
import { AKFStatusBar } from "./StatusBar";
import "../styles.css";

export interface AKFSettings {
  akfPath: string;
  vaultPath: string;
  model: string;
  defaultDomain: string;
  autoStart: boolean;
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  groqApiKey: string;
}

const DEFAULT_SETTINGS: AKFSettings = {
  akfPath: "akf",
  vaultPath: "",
  model: "auto",
  defaultDomain: "",
  autoStart: true,
  anthropicApiKey: "",
  openaiApiKey: "",
  geminiApiKey: "",
  groqApiKey: "",
};

export default class ObsidianAKFPlugin extends Plugin {
  settings!: AKFSettings;
  subprocessManager!: SubprocessManager;
  statusBar!: AKFStatusBar;
  akfRunning = false;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new AKFSettingsTab(this.app, this));

    this.statusBar = new AKFStatusBar(this);
    this.statusBar.register();

    this.subprocessManager = new SubprocessManager(this);

    if (this.settings.autoStart) {
      this.startAKF();
    }

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
        }
      },
    });

    this.addCommand({
      id: "akf-validate-vault",
      name: "Validate entire vault",
      callback: async () => {
        const vaultPath = this.settings.vaultPath || this.getVaultPath();
        await this.subprocessManager.validate(vaultPath);
      },
    });

    this.addCommand({
      id: "akf-start",
      name: "Start AKF server",
      callback: () => {
        this.startAKF();
      },
    });

    this.addCommand({
      id: "akf-stop",
      name: "Stop AKF server",
      callback: () => {
        this.stopAKF();
      },
    });
  }

  private getVaultPath(): string {
    try {
      const adapter = this.app.vault.adapter;
      if ("getBasePath" in adapter) {
        return (adapter as any).getBasePath();
      }
    } catch {
    }
    return ".";
  }

  async startAKF() {
    if (this.akfRunning) return;
    
    const success = await this.subprocessManager.start();
    if (success) {
      this.akfRunning = true;
      this.statusBar.setRunning(true);
    }
  }

  stopAKF() {
    this.subprocessManager.stop();
    this.akfRunning = false;
    this.statusBar.setRunning(false);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    
    if (!this.settings.vaultPath) {
      this.settings.vaultPath = this.getVaultPath();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    this.stopAKF();
  }
}

class AKFSettingsTab extends PluginSettingTab {
  plugin: ObsidianAKFPlugin;

  constructor(app: App, plugin: ObsidianAKFPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "AI Knowledge Filler" });

    containerEl.createEl("p", {
      text: "AI-powered knowledge generation with schema validation (E001-E008)",
      attr: { style: "color: var(--text-muted); margin-bottom: 20px;" }
    });

    containerEl.createEl("h3", { text: "🔑 API Keys" });

    containerEl.createEl("p", {
      text: "Enter your API keys below. Keys are only used locally and sent to the selected LLM provider.",
      attr: { style: "color: var(--text-muted); font-size: 0.9em; margin-bottom: 15px;" }
    });

    this.createApiKeySetting(
      "Anthropic API Key",
      "sk-ant-...",
      "anthropicApiKey",
      "console.anthropic.com"
    );

    this.createApiKeySetting(
      "OpenAI API Key",
      "sk-...",
      "openaiApiKey",
      "platform.openai.com"
    );

    this.createApiKeySetting(
      "Google Gemini API Key",
      "AIza...",
      "geminiApiKey",
      "aistudio.google.com"
    );

    this.createApiKeySetting(
      "Groq API Key",
      "gsk_...",
      "groqApiKey",
      "console.groq.com"
    );

    containerEl.createEl("h3", { text: "⚙️ Settings" });

    new Setting(containerEl)
      .setName("Default model")
      .setDesc("Select LLM provider for generation")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            auto: "Auto (default)",
            claude: "Claude",
            gpt4: "GPT-4",
            gemini: "Gemini",
            groq: "Groq",
            ollama: "Ollama (local)",
          })
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("AKF executable path")
      .setDesc("Path to the 'akf' command. Usually just 'akf' if installed.")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.akfPath)
          .onChange(async (value) => {
            this.plugin.settings.akfPath = value || "akf";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Vault path")
      .setDesc("Path to your vault (auto-detected).")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.vaultPath)
          .onChange(async (value) => {
            this.plugin.settings.vaultPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default domain")
      .setDesc("Default domain for generated files (e.g., ai-system, devops)")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.defaultDomain)
          .onChange(async (value) => {
            this.plugin.settings.defaultDomain = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-start AKF server")
      .setDesc("Start AKF server when Obsidian loads.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoStart)
          .onChange(async (value) => {
            this.plugin.settings.autoStart = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "🚀 Server Control" });

    new Setting(containerEl)
      .setName("Server status")
      .setDesc(this.plugin.akfRunning ? "🟢 Running" : "🔴 Stopped")
      .addButton((button) =>
        button
          .setButtonText(this.plugin.akfRunning ? "Stop Server" : "Start Server")
          .setCta()
          .onClick(() => {
            if (this.plugin.akfRunning) {
              this.plugin.stopAKF();
            } else {
              this.plugin.startAKF();
            }
            this.display();
          })
      );

    containerEl.createEl("h3", { text: "📖 Quick Start" });

    containerEl.createEl("p", {
      text: "1. Add your API key above\n2. Select a model\n3. Press Ctrl+Shift+G to generate",
      attr: { style: "color: var(--text-muted); font-size: 0.85em; white-space: pre-line;" }
    });
  }

  private createApiKeySetting(
    name: string,
    placeholder: string,
    key: keyof AKFSettings,
    docsUrl: string
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(`Get key at ${docsUrl}`)
      .addText((text) =>
        text
          .setPlaceholder(placeholder)
          .setValue((this.plugin.settings as any)[key] as string || "")
          .onChange(async (value) => {
            (this.plugin.settings as any)[key] = value;
            await this.plugin.saveSettings();
          })
          .inputEl.setAttribute("type", "password")
      );
  }
}
