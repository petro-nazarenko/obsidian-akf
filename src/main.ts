import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { HttpClient } from "./HttpClient";
import { GenerateModal } from "./GenerateModal";
import { ValidateModal } from "./ValidateModal";
import { AKFStatusBar } from "./StatusBar";
import { SetupWizardModal } from "./SetupWizard";
import { EnvironmentChecker } from "./EnvironmentChecker";
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
  skipSetup: boolean;
  useOllama: boolean;
  ollamaModel: string;
}

const DEFAULT_SETTINGS: AKFSettings = {
  akfPath: "akf",
  vaultPath: "",
  model: "ollama",
  defaultDomain: "",
  autoStart: true,
  anthropicApiKey: "",
  openaiApiKey: "",
  geminiApiKey: "",
  groqApiKey: "",
  skipSetup: false,
  useOllama: true,
  ollamaModel: "llama3",
};

export default class ObsidianAKFPlugin extends Plugin {
  settings!: AKFSettings;
  httpClient!: HttpClient;
  statusBar!: AKFStatusBar;
  envChecker!: EnvironmentChecker;
  isServerRunning = false;
  private serverProcess: any = null;
  private setupShown = false;

  async onload() {
    await this.loadSettings();
    
    this.envChecker = new EnvironmentChecker(this);
    this.httpClient = new HttpClient(this);
    
    this.addSettingTab(new AKFSettingsTab(this.app, this));

    this.statusBar = new AKFStatusBar(this);
    this.statusBar.register();

    if (this.settings.autoStart) {
      this.initializeServer();
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
        await this.httpClient.validate(vaultPath);
      },
    });

    this.addCommand({
      id: "akf-start-server",
      name: "Start AKF server",
      callback: () => {
        this.initializeServer();
      },
    });

    this.addCommand({
      id: "akf-open-settings",
      name: "Open settings",
      callback: () => {
        (this.app as any).commands.executeCommandById("app:open-settings");
      },
    });

    this.addCommand({
      id: "akf-run-setup",
      name: "Run setup wizard",
      callback: () => {
        new SetupWizardModal(this.app, this).open();
      },
    });
  }

  async initializeServer() {
    if (this.isServerRunning) return;

    const checks = await this.envChecker.fullCheck();

    if (!checks.python) {
      this.statusBar.setStatus("⚠️ No Python");
      new SetupWizardModal(this.app, this).open();
      return;
    }

    if (!checks.akf) {
      this.statusBar.setStatus("⚙️ Installing...");
      const installed = await this.envChecker.installAKF();
      if (!installed) {
        this.statusBar.setStatus("❌ Install failed");
        return;
      }
    }

    if (checks.akf && !checks.serverRunning) {
      this.statusBar.setStatus("🚀 Starting...");
      await this.startServer();
    }

    if (checks.serverRunning) {
      this.isServerRunning = true;
      this.statusBar.setRunning(true);
      this.statusBar.setStatus("✅ Ready");
    }
  }

  private async startServer(): Promise<boolean> {
    try {
      const port = 8000;
      const env = this.getEnvVars();
      
      const { spawn } = await import("child_process");
      
      this.serverProcess = spawn("akf", ["serve", "--port", String(port)], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        env: { ...env, ...(await import("process")).env },
        detached: false,
      });

      let output = "";
      this.serverProcess.stdout?.on("data", (data: Buffer) => {
        output += data.toString();
        console.log("[AKF]", data.toString().trim());
      });

      this.serverProcess.stderr?.on("data", (data: Buffer) => {
        console.error("[AKF Error]", data.toString().trim());
      });

      this.serverProcess.on("error", (err: Error) => {
        console.error("[AKF] Server error:", err);
        this.isServerRunning = false;
        this.statusBar.setRunning(false);
      });

      this.serverProcess.on("exit", (code: number) => {
        console.log("[AKF] Server exited with code:", code);
        this.isServerRunning = false;
        this.statusBar.setRunning(false);
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const serverRunning = await this.envChecker.isServerRunning();
      if (serverRunning) {
        this.isServerRunning = true;
        this.statusBar.setRunning(true);
        return true;
      }

      return false;
    } catch (err) {
      console.error("[AKF] Failed to start server:", err);
      return false;
    }
  }

  private getEnvVars(): Record<string, string> {
    const env: Record<string, string> = {};
    
    if (this.settings.anthropicApiKey) {
      env.ANTHROPIC_API_KEY = this.settings.anthropicApiKey;
    }
    if (this.settings.openaiApiKey) {
      env.OPENAI_API_KEY = this.settings.openaiApiKey;
    }
    if (this.settings.geminiApiKey) {
      env.GOOGLE_API_KEY = this.settings.geminiApiKey;
    }
    if (this.settings.groqApiKey) {
      env.GROQ_API_KEY = this.settings.groqApiKey;
    }
    if (this.settings.useOllama) {
      env.OLLAMA_BASE_URL = "http://localhost:11434";
    }
    
    return env;
  }

  async stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
    this.isServerRunning = false;
    this.statusBar.setRunning(false);
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
    this.stopServer();
  }
}

class AKFSettingsTab extends PluginSettingTab {
  plugin: ObsidianAKFPlugin;

  constructor(app: App, plugin: ObsidianAKFPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display() {
    const { containerEl } = this;
    containerEl.empty();

    const checks = await this.plugin.envChecker.fullCheck();

    containerEl.createEl("h2", { text: "🤖 AI Knowledge Filler" });

    containerEl.createEl("div", {
      attr: {
        innerHTML: `
          <p style="color: var(--text-muted); margin-bottom: 20px;">
            AI-powered knowledge generation with schema validation
          </p>
        `
      }
    });

    containerEl.createEl("h3", { text: "📊 Status" });

    const statusEl = containerEl.createDiv({
      attr: {
        style: "padding: 15px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 20px;"
      }
    });

    this.renderStatus(statusEl, checks);

    const refreshBtn = containerEl.createEl("button", {
      text: "🔄 Refresh Status",
      cls: "mod-cta"
    });
    refreshBtn.onclick = () => this.display();

    containerEl.createEl("h3", { text: "🦙 Ollama (Local AI)" });

    new Setting(containerEl)
      .setName("Use Ollama")
      .setDesc("Use local AI (free, no API key needed). Requires Ollama installed.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useOllama)
          .onChange(async (value) => {
            this.plugin.settings.useOllama = value;
            if (value) {
              this.plugin.settings.model = "ollama";
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ollama model")
      .setDesc("Model to use with Ollama")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            llama3: "Llama 3 (recommended)",
            llama2: "Llama 2",
            mistral: "Mistral",
            codellama: "Code Llama",
          })
          .setValue(this.plugin.settings.ollamaModel)
          .onChange(async (value) => {
            this.plugin.settings.ollamaModel = value;
            await this.plugin.saveSettings();
          })
      );

    if (!checks.ollama) {
      containerEl.createEl("p", {
        text: "📥 Install Ollama from ollama.com for free local AI",
        attr: { style: "color: var(--color-yellow);" }
      });
    }

    containerEl.createEl("h3", { text: "🔑 Cloud API Keys" });

    containerEl.createEl("p", {
      text: "Use cloud AI (GPT-4, Claude). Only needed if not using Ollama.",
      attr: { style: "color: var(--text-muted); font-size: 0.9em; margin-bottom: 15px;" }
    });

    this.createApiKeySetting(
      "Anthropic (Claude)",
      "sk-ant-...",
      "anthropicApiKey"
    );

    this.createApiKeySetting(
      "OpenAI (GPT-4)",
      "sk-...",
      "openaiApiKey"
    );

    this.createApiKeySetting(
      "Google (Gemini)",
      "AIza...",
      "geminiApiKey"
    );

    this.createApiKeySetting(
      "Groq",
      "gsk_...",
      "groqApiKey"
    );

    containerEl.createEl("h3", { text: "⚙️ General Settings" });

    new Setting(containerEl)
      .setName("Default model")
      .setDesc("LLM provider to use")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            ollama: "Ollama (local)",
            claude: "Claude",
            gpt4: "GPT-4",
            gemini: "Gemini",
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
      .setDesc("Domain for generated files (e.g., ai-system, devops)")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.defaultDomain)
          .onChange(async (value) => {
            this.plugin.settings.defaultDomain = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-start server")
      .setDesc("Start server when Obsidian opens")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoStart)
          .onChange(async (value) => {
            this.plugin.settings.autoStart = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "🚀 Server" });

    new Setting(containerEl)
      .setName("Server")
      .setDesc(this.plugin.isServerRunning ? "🟢 Running on port 8000" : "🔴 Stopped")
      .addButton((button) =>
        button
          .setButtonText(this.plugin.isServerRunning ? "Stop Server" : "Start Server")
          .setCta()
          .onClick(() => {
            if (this.plugin.isServerRunning) {
              this.plugin.stopServer();
            } else {
              this.plugin.initializeServer();
            }
            this.display();
          })
      );

    containerEl.createEl("h3", { text: "📖 Quick Help" });

    containerEl.createEl("p", {
      text: "• Ctrl+Shift+G — Generate file\n• Ctrl+Shift+V — Validate file",
      attr: { style: "color: var(--text-muted); font-size: 0.85em; white-space: pre-line;" }
    });
  }

  private renderStatus(el: HTMLElement, checks: any) {
    const items = [
      { label: "Python", status: checks.python, ok: "✅", fail: "❌" },
      { label: "AKF", status: checks.akf, ok: "✅", fail: "❌" },
      { label: "Ollama", status: checks.ollama, ok: "✅", fail: "❌" },
      { label: "Ollama running", status: checks.ollamaRunning, ok: "✅", fail: "❌" },
      { label: "Ollama model", status: checks.ollamaModel, ok: "✅", fail: "❌" },
      { label: "AKF Server", status: checks.serverRunning, ok: "✅", fail: "❌" },
      { label: "API Key", status: checks.apiKey, ok: "✅", fail: "⚠️ (Ollama fallback)" },
    ];

    el.empty();
    
    for (const item of items) {
      const icon = item.status ? item.ok : item.fail;
      const color = item.status ? "var(--color-green)" : "var(--color-red)";
      el.createEl("p", {
        text: `${icon} ${item.label}`,
        attr: { style: `color: ${color}; margin: 5px 0;` }
      });
    }
  }

  private createApiKeySetting(
    name: string,
    placeholder: string,
    key: keyof AKFSettings
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc("Optional - only if not using Ollama")
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
