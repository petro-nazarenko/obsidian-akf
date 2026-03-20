import ObsidianAKFPlugin from "./main";
import { DEFAULT_SERVER_PORT } from "./constants";

export interface GenerateResult {
  success: boolean;
  file_path: string | null;
  attempts: number;
  errors: string[];
  content?: string;
}

export interface ValidateResult {
  is_valid: boolean;
  errors: string[];
  warnings?: string[];
}

export class HttpClient {
  private plugin: ObsidianAKFPlugin;

  constructor(plugin: ObsidianAKFPlugin) {
    this.plugin = plugin;
  }

  private get baseUrl(): string {
    return `http://localhost:${this.plugin.settings.serverPort ?? DEFAULT_SERVER_PORT}`;
  }

  private getModel(): string {
    if (this.plugin.settings.useOllama) {
      return `ollama/${this.plugin.settings.ollamaModel}`;
    }
    return this.plugin.settings.model || "auto";
  }

  async generate(
    prompt: string,
    domain?: string,
    type?: string
  ): Promise<GenerateResult> {
    if (!this.plugin.isServerRunning) {
      return {
        success: false,
        file_path: null,
        attempts: 0,
        errors: ["Server is not running. Please start the server first."],
      };
    }

    try {
      const vaultPath = this.plugin.settings.vaultPath || 
        (this.plugin as any).getVaultPath?.() || ".";

      const response = await fetch(`${this.baseUrl}/v1/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          output: vaultPath,
          model: this.getModel(),
          domain: domain || this.plugin.settings.defaultDomain || undefined,
          type: type || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          file_path: null,
          attempts: 0,
          errors: [`HTTP ${response.status}: ${error}`],
        };
      }

      const data = await response.json();
      
      return {
        success: data.success ?? true,
        file_path: data.file_path ?? data.output ?? null,
        attempts: data.attempts ?? 1,
        errors: data.errors ?? [],
        content: data.content,
      };
    } catch (err) {
      return {
        success: false,
        file_path: null,
        attempts: 0,
        errors: [(err as Error).message],
      };
    }
  }

  async validate(path: string): Promise<ValidateResult> {
    if (!this.plugin.isServerRunning) {
      return {
        is_valid: false,
        errors: ["Server is not running"],
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          is_valid: false,
          errors: [`HTTP ${response.status}: ${error}`],
        };
      }

      const data = await response.json();
      
      return {
        is_valid: data.is_valid ?? data.valid ?? true,
        errors: data.errors ?? [],
        warnings: data.warnings,
      };
    } catch (err) {
      return {
        is_valid: false,
        errors: [(err as Error).message],
      };
    }
  }

  async enrich(path: string, force: boolean = false): Promise<any> {
    if (!this.plugin.isServerRunning) {
      return { enriched: 0, skipped: 0, failed: 1, errors: ["Server not running"] };
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/enrich`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path, force }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { enriched: 0, skipped: 0, failed: 1, errors: [`HTTP ${response.status}: ${error}`] };
      }

      return await response.json();
    } catch (err) {
      return { enriched: 0, skipped: 0, failed: 1, errors: [(err as Error).message] };
    }
  }

  async batch(prompts: string[]): Promise<any> {
    if (!this.plugin.isServerRunning) {
      return { total: 0, ok: 0, failed: 0, errors: ["Server not running"] };
    }

    try {
      const vaultPath = this.plugin.settings.vaultPath || ".";

      const response = await fetch(`${this.baseUrl}/v1/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan: prompts.map((p) => ({ prompt: p })),
          output: vaultPath,
          model: this.getModel(),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { total: 0, ok: 0, failed: prompts.length, errors: [`HTTP ${response.status}: ${error}`] };
      }

      return await response.json();
    } catch (err) {
      return { total: 0, ok: 0, failed: prompts.length, errors: [(err as Error).message] };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
