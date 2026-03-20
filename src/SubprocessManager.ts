import { spawn, ChildProcess } from "child_process";
import ObsidianAKFPlugin from "./main";

export interface GenerateResult {
  success: boolean;
  file_path: string | null;
  attempts: number;
  errors: string[];
}

export interface ValidateResult {
  is_valid: boolean;
  errors: string[];
}

export interface BatchResult {
  total: number;
  ok: number;
  failed: number;
}

export class SubprocessManager {
  private plugin: ObsidianAKFPlugin;
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests: Map<number, { resolve: Function; reject: Function }> = new Map();

  constructor(plugin: ObsidianAKFPlugin) {
    this.plugin = plugin;
  }

  private getVaultPath(): string {
    try {
      const adapter = this.plugin.app.vault.adapter;
      if ("getBasePath" in adapter) {
        return (adapter as any).getBasePath();
      }
    } catch {
    }
    return ".";
  }

  private getEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    
    if (this.plugin.settings.anthropicApiKey) {
      env.ANTHROPIC_API_KEY = this.plugin.settings.anthropicApiKey;
    }
    if (this.plugin.settings.openaiApiKey) {
      env.OPENAI_API_KEY = this.plugin.settings.openaiApiKey;
    }
    if (this.plugin.settings.geminiApiKey) {
      env.GOOGLE_API_KEY = this.plugin.settings.geminiApiKey;
    }
    if (this.plugin.settings.groqApiKey) {
      env.GROQ_API_KEY = this.plugin.settings.groqApiKey;
    }
    
    return env;
  }

  async start(): Promise<boolean> {
    if (this.process) {
      return true;
    }

    const akfPath = this.plugin.settings.akfPath || "akf";
    
    return new Promise((resolve) => {
      try {
        this.process = spawn(akfPath, ["serve", "--mcp"], {
          stdio: ["pipe", "pipe", "pipe"],
          shell: true,
          env: this.getEnv(),
        });

        let buffer = "";

        this.process.stdout?.on("data", (data: Buffer) => {
          buffer += data.toString();
          
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.trim()) {
              this.handleMCPResponse(line);
            }
          }
        });

        this.process.stderr?.on("data", (data: Buffer) => {
          console.error("[AKF] stderr:", data.toString());
        });

        this.process.on("error", (err) => {
          console.error("[AKF] Process error:", err);
          this.process = null;
          resolve(false);
        });

        this.process.on("exit", (code) => {
          console.log("[AKF] Process exited with code:", code);
          this.process = null;
          this.plugin.akfRunning = false;
          this.plugin.statusBar.setRunning(false);
        });

        setTimeout(() => {
          resolve(true);
        }, 1000);

      } catch (err) {
        console.error("[AKF] Failed to start:", err);
        resolve(false);
      }
    });
  }

  private handleMCPResponse(line: string) {
    try {
      const response = JSON.parse(line);
      
      if (response.jsonrpc === "2.0" && response.id !== undefined) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      }
    } catch {
    }
  }

  async sendRequest(method: string, params: object): Promise<any> {
    if (!this.process) {
      const started = await this.start();
      if (!started) {
        throw new Error("Failed to start AKF server");
      }
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const request = {
        jsonrpc: "2.0",
        id,
        method: `tools/call`,
        params: {
          name: `akf_${method}`,
          arguments: params,
        },
      };

      this.process?.stdin?.write(JSON.stringify(request) + "\n");

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 60000);
    });
  }

  async generate(
    prompt: string,
    domain?: string,
    type?: string
  ): Promise<GenerateResult> {
    const vaultPath = this.plugin.settings.vaultPath || this.getVaultPath();
    
    const args: Record<string, any> = {
      prompt,
      output: vaultPath,
      model: this.plugin.settings.model || "auto",
    };

    if (domain || this.plugin.settings.defaultDomain) {
      args.domain = domain || this.plugin.settings.defaultDomain;
    }
    if (type) {
      args.type = type;
    }

    try {
      const result = await this.sendRequest("generate", args);
      return {
        success: result.success ?? false,
        file_path: result.file_path ?? null,
        attempts: result.attempts ?? 0,
        errors: result.errors ?? [],
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
    try {
      const result = await this.sendRequest("validate", { path, strict: true });
      return {
        is_valid: result.is_valid ?? false,
        errors: result.errors ?? [],
      };
    } catch (err) {
      return {
        is_valid: false,
        errors: [(err as Error).message],
      };
    }
  }

  async enrich(
    path: string,
    force: boolean = false
  ): Promise<{ enriched: number; skipped: number; failed: number }> {
    try {
      const result = await this.sendRequest("enrich", { path, force });
      return {
        enriched: result.enriched ?? 0,
        skipped: result.skipped ?? 0,
        failed: result.failed ?? 0,
      };
    } catch (err) {
      return { enriched: 0, skipped: 0, failed: 1 };
    }
  }

  async batch(prompts: string[]): Promise<BatchResult> {
    try {
      const vaultPath = this.plugin.settings.vaultPath || this.getVaultPath();
      const result = await this.sendRequest("batch", {
        plan: prompts.map((p) => ({ prompt: p })),
        output: vaultPath,
        model: this.plugin.settings.model || "auto",
      });
      return {
        total: result.total ?? 0,
        ok: result.ok ?? 0,
        failed: result.failed ?? 0,
      };
    } catch (err) {
      return { total: 0, ok: 0, failed: 0 };
    }
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.plugin.akfRunning = false;
    }
  }
}
