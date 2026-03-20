import { exec, ExecException } from "child_process";

export interface EnvironmentCheck {
  python: boolean;
  akf: boolean;
  ollama: boolean;
  ollamaRunning: boolean;
  ollamaModel: boolean;
  apiKey: boolean;
  serverRunning: boolean;
}

export class EnvironmentChecker {
  private plugin: any;

  constructor(plugin: any) {
    this.plugin = plugin;
  }

  private runCommand(cmd: string): Promise<{ success: boolean; stdout: string }> {
    return new Promise((resolve) => {
      exec(cmd, (error: ExecException | null, stdout: string) => {
        resolve({ success: !error, stdout: stdout || "" });
      });
    });
  }

  async checkPython(): Promise<boolean> {
    const result = await this.runCommand("python --version");
    if (result.success) return true;
    const result2 = await this.runCommand("python3 --version");
    return result2.success;
  }

  async checkAKF(): Promise<boolean> {
    const result = await this.runCommand("akf --version");
    return result.success;
  }

  async checkOllama(): Promise<boolean> {
    const result = await this.runCommand("ollama --version");
    return result.success;
  }

  async isOllamaRunning(): Promise<boolean> {
    const result = await this.runCommand("curl -s http://localhost:11434/api/tags 2>/dev/null || echo 'not_running'");
    return result.stdout.includes("models");
  }

  async hasOllamaModel(): Promise<boolean> {
    const result = await this.runCommand('ollama list 2>/dev/null || echo ""');
    return result.stdout.includes("llama") || result.stdout.includes("mistral") || result.stdout.includes("codellama");
  }

  async checkApiKey(): Promise<boolean> {
    const settings = this.plugin.settings;
    return !!(
      settings.anthropicApiKey ||
      settings.openaiApiKey ||
      settings.geminiApiKey ||
      settings.groqApiKey
    );
  }

  async isServerRunning(): Promise<boolean> {
    const result = await this.runCommand("curl -s http://localhost:8000/health 2>/dev/null || echo 'not_running'");
    return result.stdout.includes("ok") || result.stdout.includes("true");
  }

  async fullCheck(): Promise<EnvironmentCheck> {
    const [python, akf, ollama, ollamaRunning, ollamaModel, apiKey, serverRunning] = await Promise.all([
      this.checkPython(),
      this.checkAKF(),
      this.checkOllama(),
      this.isOllamaRunning(),
      this.hasOllamaModel(),
      this.checkApiKey(),
      this.isServerRunning(),
    ]);

    return {
      python,
      akf,
      ollama,
      ollamaRunning,
      ollamaModel,
      apiKey,
      serverRunning,
    };
  }

  installAKF(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('pip install "ai-knowledge-filler[mcp]"', (error: ExecException | null) => {
        if (error) {
          console.error("[AKF] Install failed:", error);
          resolve(false);
        } else {
          console.log("[AKF] AKF installed successfully");
          resolve(true);
        }
      });
    });
  }

  installOllama(): Promise<boolean> {
    console.log("[AKF] Please install Ollama from: https://ollama.com/download");
    return Promise.resolve(false);
  }

  pullOllamaModel(model: string = "llama3"): Promise<boolean> {
    return new Promise((resolve) => {
      console.log(`[AKF] Pulling Ollama model: ${model}...`);
      exec(`ollama pull ${model}`, (error: ExecException | null) => {
        if (error) {
          console.error("[AKF] Model pull failed:", error);
          resolve(false);
        } else {
          console.log("[AKF] Model pulled successfully");
          resolve(true);
        }
      });
    });
  }

  startOllama(): Promise<boolean> {
    return new Promise((resolve) => {
      exec("start /B ollama serve", (error: ExecException | null) => {
        if (error) {
          console.error("[AKF] Ollama start failed:", error);
          resolve(false);
        } else {
          setTimeout(() => resolve(true), 2000);
        }
      });
    });
  }

  getRecommendations(checks: EnvironmentCheck): string[] {
    const recommendations: string[] = [];

    if (!checks.python) {
      recommendations.push("Install Python 3.10+ from python.org");
    }

    if (!checks.akf) {
      recommendations.push("AKF will be installed automatically on first use");
    }

    if (!checks.ollama && !checks.apiKey) {
      recommendations.push("Install Ollama from ollama.com for free local AI (no API key needed)");
    }

    if (checks.ollama && !checks.ollamaRunning) {
      recommendations.push("Start Ollama: Run 'ollama serve' or restart the app");
    }

    if (checks.ollamaRunning && !checks.ollamaModel) {
      recommendations.push("Pull a model: ollama pull llama3");
    }

    if (!checks.apiKey && !checks.ollama) {
      recommendations.push("Or add an API key in Settings for cloud AI (Claude, GPT-4)");
    }

    return recommendations;
  }
}
