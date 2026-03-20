import ObsidianAKFPlugin from "./main";
import {
  DEFAULT_SERVER_PORT,
  HTTP_GENERATE_TIMEOUT_MS,
  HTTP_DEFAULT_TIMEOUT_MS,
  HTTP_MAX_RETRIES,
  HTTP_RETRY_DELAY_MS,
} from "./constants";

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

  private async withRetry<T>(
    fn: () => Promise<T>,
    isRetryable: (result: T) => boolean
  ): Promise<T> {
    let lastResult = await fn();
    for (let attempt = 1; attempt < HTTP_MAX_RETRIES && isRetryable(lastResult); attempt++) {
      await new Promise((r) => setTimeout(r, HTTP_RETRY_DELAY_MS * attempt));
      lastResult = await fn();
    }
    return lastResult;
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
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

    const attempt = async (): Promise<GenerateResult> => {
      try {
        const vaultPath = this.plugin.settings.vaultPath ||
          (this.plugin as any).getVaultPath?.() || ".";

        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/v1/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              output: vaultPath,
              model: this.getModel(),
              domain: domain || this.plugin.settings.defaultDomain || undefined,
              type: type || undefined,
            }),
          },
          HTTP_GENERATE_TIMEOUT_MS
        );

        if (!response.ok) {
          const error = await response.text();
          return {
            success: false,
            file_path: null,
            attempts: 0,
            errors: [`HTTP ${response.status}: ${error}`],
            _retryable: response.status >= 500,
          } as GenerateResult & { _retryable: boolean };
        }

        const data = await response.json();
        return {
          success: data.success ?? true,
          file_path: data.file_path ?? data.output ?? null,
          attempts: data.attempts ?? 1,
          errors: data.errors ?? [],
          content: data.content,
          _retryable: false,
        } as GenerateResult & { _retryable: boolean };
      } catch (err) {
        const msg = (err as Error).name === "AbortError"
          ? "Request timed out (server took too long to respond)"
          : (err as Error).message;
        return {
          success: false,
          file_path: null,
          attempts: 0,
          errors: [msg],
          _retryable: (err as Error).name !== "AbortError",
        } as GenerateResult & { _retryable: boolean };
      }
    };

    const result = await this.withRetry(
      attempt,
      (r) => !!(r as any)._retryable
    );
    const { _retryable: _, ...clean } = result as any;
    return clean as GenerateResult;
  }

  async validate(path: string): Promise<ValidateResult> {
    if (!this.plugin.isServerRunning) {
      return {
        is_valid: false,
        errors: ["Server is not running"],
      };
    }

    const attempt = async (): Promise<ValidateResult & { _retryable: boolean }> => {
      try {
        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/v1/validate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
          },
          HTTP_GENERATE_TIMEOUT_MS
        );

        if (!response.ok) {
          const error = await response.text();
          return { is_valid: false, errors: [`HTTP ${response.status}: ${error}`], _retryable: response.status >= 500 };
        }

        const data = await response.json();
        return {
          is_valid: data.is_valid ?? data.valid ?? true,
          errors: data.errors ?? [],
          warnings: data.warnings,
          _retryable: false,
        };
      } catch (err) {
        const msg = (err as Error).name === "AbortError"
          ? "Request timed out (server took too long to respond)"
          : (err as Error).message;
        return { is_valid: false, errors: [msg], _retryable: (err as Error).name !== "AbortError" };
      }
    };

    const result = await this.withRetry(attempt, (r) => r._retryable);
    const { _retryable: _, ...clean } = result;
    return clean as ValidateResult;
  }

  async enrich(path: string, force: boolean = false): Promise<any> {
    if (!this.plugin.isServerRunning) {
      return { enriched: 0, skipped: 0, failed: 1, errors: ["Server not running"] };
    }

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/enrich`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, force }),
        },
        HTTP_DEFAULT_TIMEOUT_MS
      );

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

      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: prompts.map((p) => ({ prompt: p })),
            output: vaultPath,
            model: this.getModel(),
          }),
        },
        HTTP_DEFAULT_TIMEOUT_MS
      );

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
