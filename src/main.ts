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
}

const DEFAULT_SETTINGS: AKFSettings = {
  akfPath: "akf",
  vaultPath: "",
  model: "auto",
  defaultDomain: "",
  autoStart: true,
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

    containerEl.createEl("h2", { text: "AI Knowledge Filler Settings" });

    new Setting(containerEl)
      .setName("AKF executable path")
      .setDesc("Path to the 'akf' command. Leave as 'akf' if it's in your PATH.")
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
      .setDesc("Path to your Obsidian vault (auto-detected).")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.vaultPath)
          .onChange(async (value) => {
            this.plugin.settings.vaultPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default model")
      .setDesc("LLM provider/model (auto, claude, gpt4, gemini, groq, ollama)")
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
      .setDesc("Automatically start AKF server when Obsidian loads.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoStart)
          .onChange(async (value) => {
            this.plugin.settings.autoStart = value;
            await this.plugin.saveSettings();
          })
      );

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
  }
}
