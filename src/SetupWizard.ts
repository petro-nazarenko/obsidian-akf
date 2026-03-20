import { App, Modal, Setting } from "obsidian";
import ObsidianAKFPlugin from "./main";
import { EnvironmentChecker, EnvironmentCheck } from "./EnvironmentChecker";

export class SetupWizardModal extends Modal {
  plugin: ObsidianAKFPlugin;
  checker: EnvironmentChecker;
  checks: EnvironmentCheck | null = null;
  currentStep = 0;
  isInstalling = false;

  constructor(app: App, plugin: ObsidianAKFPlugin) {
    super(app);
    this.plugin = plugin;
    this.checker = new EnvironmentChecker(plugin);
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "🤖 AI Knowledge Filler - Setup" });

    const statusEl = contentEl.createDiv({
      cls: "akf-setup-status",
      attr: { style: "margin: 20px 0; padding: 15px; background: var(--background-secondary); border-radius: 8px;" }
    });

    this.checks = await this.checker.fullCheck();
    await this.renderStep(contentEl, statusEl);
  }

  async renderStep(contentEl: HTMLElement, statusEl: HTMLElement) {
    statusEl.empty();

    if (!this.checks) {
      statusEl.setText("Checking environment...");
      this.checks = await this.checker.fullCheck();
    }

    const checks = this.checks;

    if (!checks.python) {
      await this.renderPythonStep(statusEl);
      return;
    }

    if (!checks.akf) {
      await this.renderAKFStep(statusEl);
      return;
    }

    if (!checks.ollama && !checks.apiKey) {
      await this.renderProviderStep(statusEl);
      return;
    }

    if (checks.ollama && !checks.ollamaRunning) {
      await this.renderOllamaStartStep(statusEl);
      return;
    }

    if (checks.ollamaRunning && !checks.ollamaModel) {
      await this.renderOllamaModelStep(statusEl);
      return;
    }

    await this.renderCompleteStep(statusEl);
  }

  async renderPythonStep(statusEl: HTMLElement) {
    statusEl.createEl("h3", { text: "❌ Python Not Found" });

    statusEl.createEl("p", {
      text: "Python is required to run AI Knowledge Filler. Please install Python 3.10 or later."
    });

    statusEl.createEl("p", {
      text: "1. Go to python.org/downloads",
      attr: { style: "margin-top: 10px;" }
    });
    statusEl.createEl("p", { text: "2. Download and install Python 3.10+" });
    statusEl.createEl("p", { text: "3. Restart Obsidian and try again" });

    const btnContainer = statusEl.createDiv({
      attr: { style: "margin-top: 20px;" }
    });

    btnContainer.createEl("button", {
      text: "Check Again",
      cls: "mod-cta"
    }).onclick = () => {
      this.checks = null;
      this.renderStep(this.contentEl, statusEl);
    };
  }

  async renderAKFStep(statusEl: HTMLElement) {
    statusEl.createEl("h3", { text: "🔧 Installing AI Knowledge Filler..." });

    if (!this.isInstalling) {
      this.isInstalling = true;
      
      const progressEl = statusEl.createEl("p", {
        text: "Installing via pip..."
      });

      const success = await this.checker.installAKF();

      this.isInstalling = false;
      this.checks = await this.checker.fullCheck();

      if (success && this.checks.akf) {
        await this.renderStep(this.contentEl, statusEl);
      } else {
        progressEl.setText("❌ Installation failed. Please run in terminal:");
        
        statusEl.createEl("code", {
          text: 'pip install "ai-knowledge-filler[mcp]"',
          attr: { style: "display: block; padding: 10px; background: var(--background-primary); margin-top: 10px;" }
        });

        statusEl.createEl("button", {
          text: "Try Again",
          cls: "mod-cta"
        }).onclick = () => {
          this.checks!.akf = false;
          this.renderStep(this.contentEl, statusEl);
        };
      }
    }
  }

  async renderProviderStep(statusEl: HTMLElement) {
    statusEl.createEl("h3", { text: "🔑 Choose AI Provider" });

    statusEl.createEl("p", {
      text: "You need an AI provider to generate knowledge files. Choose one option:"
    });

    const optionsEl = statusEl.createDiv({
      attr: { style: "margin: 20px 0;" }
    });

    const ollamaOption = optionsEl.createDiv({
      attr: {
        style: "padding: 15px; background: var(--background-primary); border-radius: 8px; margin-bottom: 10px; cursor: pointer; border: 2px solid transparent;"
      }
    });

    ollamaOption.createEl("h4", { text: "🦙 Ollama (Recommended - Free & Private)" });
    ollamaOption.createEl("p", {
      text: "Run AI locally on your computer. No API key needed, fully offline.",
      attr: { style: "color: var(--text-muted);" }
    });

    ollamaOption.onclick = async () => {
      ollamaOption.setAttr("style", ollamaOption.getAttr("style")!.replace("transparent", "var(--interactive-accent)"));
      
      const hasOllama = await this.checker.checkOllama();
      
      if (!hasOllama) {
        statusEl.createEl("p", {
          text: "📥 Please install Ollama from ollama.com/download",
          attr: { style: "color: var(--color-yellow); margin-top: 10px;" }
        });
        
        statusEl.createEl("button", {
          text: "I've installed Ollama",
          cls: "mod-cta"
        }).onclick = () => {
          this.checks = null;
          this.renderStep(this.contentEl, statusEl);
        };
        return;
      }

      statusEl.createEl("p", { text: "✅ Ollama detected! Starting..." });
      
      const started = await this.checker.startOllama();
      
      if (started) {
        this.checks!.ollama = true;
        this.checks!.ollamaRunning = true;
        await this.renderStep(this.contentEl, statusEl);
      }
    };

    const apiOption = optionsEl.createDiv({
      attr: {
        style: "padding: 15px; background: var(--background-primary); border-radius: 8px; cursor: pointer; border: 2px solid transparent;"
      }
    });

    apiOption.createEl("h4", { text: "☁️ Cloud API (GPT-4, Claude)" });
    apiOption.createEl("p", {
      text: "Use cloud AI services. Requires API key from OpenAI or Anthropic.",
      attr: { style: "color: var(--text-muted);" }
    });

    apiOption.onclick = () => {
      statusEl.createEl("p", {
        text: "✅ Go to Settings → AI Knowledge Filler to add your API key.",
        attr: { style: "color: var(--color-green); margin-top: 10px;" }
      });

      statusEl.createEl("button", {
        text: "Open Settings",
        cls: "mod-cta"
      }).onclick = () => {
        this.close();
        (this.plugin as any).app.setting.open();
        (this.plugin as any).app.setting.openTabById("ai-knowledge-filler");
      };

      statusEl.createEl("button", {
        text: "Continue without key (Ollama fallback)",
        attr: { style: "margin-left: 10px;" }
      }).onclick = () => {
        this.checks = null;
        this.renderStep(this.contentEl, statusEl);
      };
    };
  }

  async renderOllamaStartStep(statusEl: HTMLElement) {
    statusEl.createEl("h3", { text: "🚀 Starting Ollama..." });

    statusEl.createEl("p", {
      text: "Ollama is installed but not running. Starting it now..."
    });

    const started = await this.checker.startOllama();

    if (started) {
      this.checks!.ollamaRunning = true;
      await this.renderStep(this.contentEl, statusEl);
    } else {
      statusEl.createEl("p", {
        text: "❌ Could not start Ollama automatically. Please run:",
        attr: { style: "color: var(--color-red);" }
      });

      statusEl.createEl("code", {
        text: "ollama serve",
        attr: { style: "display: block; padding: 10px; background: var(--background-primary); margin: 10px 0;" }
      });

      statusEl.createEl("button", {
        text: "Ollama is now running",
        cls: "mod-cta"
      }).onclick = () => {
        this.checks = null;
        this.renderStep(this.contentEl, statusEl);
      };
    }
  }

  async renderOllamaModelStep(statusEl: HTMLElement) {
    statusEl.createEl("h3", { text: "📥 Downloading AI Model..." });

    statusEl.createEl("p", {
      text: "Ollama needs to download an AI model. This may take a few minutes."
    });

    if (!this.isInstalling) {
      this.isInstalling = true;

      const success = await this.checker.pullOllamaModel("llama3");

      this.isInstalling = false;
      this.checks = await this.checker.fullCheck();

      if (success) {
        await this.renderStep(this.contentEl, statusEl);
      } else {
        statusEl.createEl("p", {
          text: "❌ Model download failed. Run manually:",
          attr: { style: "color: var(--color-red);" }
        });

        statusEl.createEl("code", {
          text: "ollama pull llama3",
          attr: { style: "display: block; padding: 10px; background: var(--background-primary); margin: 10px 0;" }
        });
      }
    }
  }

  async renderCompleteStep(statusEl: HTMLElement) {
    statusEl.createEl("h3", { text: "🎉 Setup Complete!" });

    statusEl.createEl("p", {
      text: "AI Knowledge Filler is ready to use!",
      attr: { style: "color: var(--color-green);" }
    });

    const featuresEl = statusEl.createDiv({
      attr: { style: "margin-top: 20px;" }
    });

    featuresEl.createEl("p", { text: "📝 Ctrl+Shift+G - Generate knowledge file" });
    featuresEl.createEl("p", { text: "✅ Ctrl+Shift+V - Validate current file" });

    statusEl.createEl("button", {
      text: "Let's Go!",
      cls: "mod-cta",
      attr: { style: "margin-top: 20px;" }
    }).onclick = () => {
      this.close();
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
