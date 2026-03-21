"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsidianAKFPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/constants.ts
var DEFAULT_SERVER_PORT = 8e3;
var OLLAMA_PORT = 11434;
var SERVER_STARTUP_POLL_INTERVAL_MS = 1e3;
var SERVER_STARTUP_MAX_ATTEMPTS = 8;
var SERVER_MAX_RESTARTS = 3;
var SERVER_RESTART_WINDOW_MS = 6e4;
var SERVER_RESTART_DELAY_MS = 2e3;
var HEALTH_TIMEOUT_MS = 5e3;
var OLLAMA_START_DELAY_MS = 2e3;
var HTTP_GENERATE_TIMEOUT_MS = 6e4;
var HTTP_DEFAULT_TIMEOUT_MS = 1e4;
var MODAL_CLOSE_DELAY_MS = 1500;
var HTTP_MAX_RETRIES = 3;
var HTTP_RETRY_DELAY_MS = 1e3;

// src/HttpClient.ts
var HttpClient = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  get baseUrl() {
    return `http://localhost:${this.plugin.settings.serverPort ?? DEFAULT_SERVER_PORT}`;
  }
  getModel() {
    if (this.plugin.settings.useOllama) {
      return `ollama/${this.plugin.settings.ollamaModel}`;
    }
    return this.plugin.settings.model || "auto";
  }
  async withRetry(fn, isRetryable) {
    let lastResult = await fn();
    for (let attempt = 1; attempt < HTTP_MAX_RETRIES && isRetryable(lastResult); attempt++) {
      await new Promise((r) => setTimeout(r, HTTP_RETRY_DELAY_MS * attempt));
      lastResult = await fn();
    }
    return lastResult;
  }
  async fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  async generate(prompt, domain, type) {
    if (!this.plugin.isServerRunning) {
      return {
        success: false,
        file_path: null,
        attempts: 0,
        errors: ["Server is not running. Please start the server first."]
      };
    }
    const attempt = async () => {
      try {
        const vaultPath = this.plugin.settings.vaultPath || this.plugin.getVaultPath?.() || ".";
        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/v1/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              output: vaultPath,
              model: this.getModel(),
              domain: domain || this.plugin.settings.defaultDomain || void 0,
              type: type || void 0
            })
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
            _retryable: response.status >= 500
          };
        }
        const data = await response.json();
        return {
          success: data.success ?? true,
          file_path: data.file_path ?? data.output ?? null,
          attempts: data.attempts ?? 1,
          errors: data.errors ?? [],
          content: data.content,
          _retryable: false
        };
      } catch (err) {
        const msg = err.name === "AbortError" ? "Request timed out (server took too long to respond)" : err.message;
        return {
          success: false,
          file_path: null,
          attempts: 0,
          errors: [msg],
          _retryable: err.name !== "AbortError"
        };
      }
    };
    const result = await this.withRetry(
      attempt,
      (r) => !!r._retryable
    );
    const { _retryable: _, ...clean } = result;
    return clean;
  }
  async validate(path) {
    if (!this.plugin.isServerRunning) {
      return {
        is_valid: false,
        errors: ["Server is not running"]
      };
    }
    const attempt = async () => {
      try {
        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/v1/validate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path })
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
          _retryable: false
        };
      } catch (err) {
        const msg = err.name === "AbortError" ? "Request timed out (server took too long to respond)" : err.message;
        return { is_valid: false, errors: [msg], _retryable: err.name !== "AbortError" };
      }
    };
    const result = await this.withRetry(attempt, (r) => r._retryable);
    const { _retryable: _, ...clean } = result;
    return clean;
  }
  async enrich(path, force = false) {
    if (!this.plugin.isServerRunning) {
      return { enriched: 0, skipped: 0, failed: 1, errors: ["Server not running"] };
    }
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/enrich`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, force })
        },
        HTTP_DEFAULT_TIMEOUT_MS
      );
      if (!response.ok) {
        const error = await response.text();
        return { enriched: 0, skipped: 0, failed: 1, errors: [`HTTP ${response.status}: ${error}`] };
      }
      return await response.json();
    } catch (err) {
      return { enriched: 0, skipped: 0, failed: 1, errors: [err.message] };
    }
  }
  async batch(prompts) {
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
            model: this.getModel()
          })
        },
        HTTP_DEFAULT_TIMEOUT_MS
      );
      if (!response.ok) {
        const error = await response.text();
        return { total: 0, ok: 0, failed: prompts.length, errors: [`HTTP ${response.status}: ${error}`] };
      }
      return await response.json();
    } catch (err) {
      return { total: 0, ok: 0, failed: prompts.length, errors: [err.message] };
    }
  }
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
};

// src/GenerateModal.ts
var import_obsidian = require("obsidian");
var GenerateModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.prompt = "";
    this.domain = "";
    this.type = "";
    this.isGenerating = false;
    this.plugin = plugin;
    this.domain = plugin.settings.defaultDomain || "";
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "\u{1F916} Generate Knowledge File" });
    if (!this.plugin.isServerRunning) {
      contentEl.createEl("p", {
        text: "Server is starting...",
        attr: { style: "color: var(--text-muted);" }
      });
      this.plugin.initializeServer();
    }
    this.renderForm(contentEl);
  }
  renderForm(contentEl) {
    contentEl.empty();
    contentEl.createEl("h2", { text: "\u{1F916} Generate Knowledge File" });
    let promptInput;
    new import_obsidian.Setting(contentEl).setName("What do you want to create?").setDesc("Describe the knowledge file you need").addTextArea((text) => {
      text.setPlaceholder("Write a guide on Docker networking, or explain microservices architecture...");
      text.setValue(this.prompt);
      text.onChange((value) => {
        this.prompt = value;
      });
      text.inputEl.setAttr("rows", 4);
      text.inputEl.setAttr("style", "width: 100%;");
      promptInput = text.inputEl;
    });
    new import_obsidian.Setting(contentEl).setName("Domain (optional)").setDesc("e.g., ai-system, api-design, devops, security").addText(
      (text) => text.setValue(this.domain).onChange((value) => {
        this.domain = value;
      })
    );
    new import_obsidian.Setting(contentEl).setName("Type (optional)").addDropdown(
      (dropdown) => dropdown.addOptions({
        "": "Auto-detect",
        concept: "Concept",
        guide: "Guide",
        reference: "Reference",
        checklist: "Checklist",
        project: "Project",
        roadmap: "Roadmap",
        template: "Template",
        audit: "Audit"
      }).setValue(this.type).onChange((value) => {
        this.type = value;
      })
    );
    const buttonContainer = contentEl.createDiv({
      attr: { style: "display: flex; gap: 10px; margin-top: 20px;" }
    });
    const statusEl = contentEl.createDiv({
      attr: { style: "margin-top: 15px; padding: 10px; background: var(--background-secondary); border-radius: 4px;" }
    });
    const generateBtn = buttonContainer.createEl("button", {
      text: "\u2728 Generate",
      cls: "mod-cta"
    });
    generateBtn.setAttribute("disabled", "true");
    const cancelBtn = buttonContainer.createEl("button", {
      text: "Cancel"
    });
    setTimeout(() => {
      if (promptInput) {
        promptInput.addEventListener("input", () => {
          if (promptInput.value.trim()) {
            generateBtn.removeAttribute("disabled");
          } else {
            generateBtn.setAttribute("disabled", "true");
          }
        });
      }
    }, 0);
    cancelBtn.onclick = () => {
      this.close();
    };
    generateBtn.onclick = async () => {
      if (!this.prompt.trim()) {
        statusEl.setText("\u26A0\uFE0F Please enter a prompt");
        return;
      }
      this.isGenerating = true;
      generateBtn.setAttribute("disabled", "true");
      generateBtn.setText("\u23F3 Generating...");
      statusEl.setText("\u{1F680} Sending request to AI...");
      try {
        const result = await this.plugin.httpClient.generate(
          this.prompt,
          this.domain || void 0,
          this.type || void 0
        );
        if (result.success && result.file_path) {
          statusEl.setText(`\u2705 Success! Created: ${result.file_path}`);
          setTimeout(async () => {
            try {
              const file = this.plugin.app.vault.getAbstractFileByPath(result.file_path);
              if (file instanceof import_obsidian.TFile) {
                await this.plugin.app.workspace.getLeaf().openFile(file);
              }
            } catch {
              console.log("[AKF] Could not open file:", result.file_path);
            }
            this.close();
          }, MODAL_CLOSE_DELAY_MS);
        } else {
          const errorMsg = result.errors.length > 0 ? result.errors.slice(0, 3).join("\n") : "Generation failed";
          statusEl.setText(`\u274C Error:
${errorMsg}`);
          this.isGenerating = false;
          generateBtn.removeAttribute("disabled");
          generateBtn.setText("\u{1F504} Retry");
        }
      } catch (err) {
        statusEl.setText(`\u274C Error: ${err.message}`);
        this.isGenerating = false;
        generateBtn.removeAttribute("disabled");
        generateBtn.setText("\u{1F504} Retry");
      }
    };
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};

// src/ValidateModal.ts
var import_obsidian2 = require("obsidian");
var ValidateModal = class extends import_obsidian2.Modal {
  constructor(app, plugin, path) {
    super(app);
    this.plugin = plugin;
    this.path = path;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "\u2705 Validate File" });
    const fileName = this.path.split("/").pop() || this.path;
    contentEl.createEl("p", {
      text: `Validating: ${fileName}`,
      attr: { style: "color: var(--text-muted);" }
    });
    const statusEl = contentEl.createDiv({
      attr: { style: "margin: 20px 0; font-weight: bold;" }
    });
    const resultsEl = contentEl.createDiv({
      attr: { style: "max-height: 400px; overflow-y: auto;" }
    });
    statusEl.setText("\u23F3 Validating...");
    const footerEl = contentEl.createDiv({
      attr: { style: "margin-top: 20px; display: flex; justify-content: flex-end;" }
    });
    new import_obsidian2.ButtonComponent(footerEl).setButtonText("Close").onClick(() => this.close());
    this.runValidation(statusEl, resultsEl);
  }
  async runValidation(statusEl, resultsEl) {
    try {
      const result = await this.plugin.httpClient.validate(this.path);
      if (result.is_valid) {
        statusEl.setText("\u2705 File is valid!");
        statusEl.style.color = "var(--color-green)";
        resultsEl.createEl("p", {
          text: "No validation errors found. Your file follows the AKF schema perfectly!",
          attr: { style: "color: var(--color-green);" }
        });
      } else {
        statusEl.setText(`\u274C Found ${result.errors.length} error(s)`);
        statusEl.style.color = "var(--color-red)";
        for (const error of result.errors) {
          const errorItem = resultsEl.createDiv({
            attr: {
              style: "padding: 12px; margin: 8px 0; background: var(--background-secondary); border-radius: 6px; font-family: monospace; font-size: 13px; border-left: 3px solid var(--color-red);"
            }
          });
          errorItem.createEl("span", { text: this.formatError(error) });
        }
        if (result.warnings && result.warnings.length > 0) {
          resultsEl.createEl("h4", { text: "\u26A0\uFE0F Warnings:" });
          for (const warning of result.warnings) {
            const warnItem = resultsEl.createDiv({
              attr: {
                style: "padding: 8px; margin: 5px 0; background: var(--background-secondary); border-radius: 4px; font-size: 12px; color: var(--color-yellow);"
              }
            });
            warnItem.createEl("span", { text: warning });
          }
        }
      }
    } catch (err) {
      statusEl.setText(`\u274C Error: ${err.message}`);
      statusEl.style.color = "var(--color-red)";
    }
  }
  formatError(error) {
    if (error.includes("E001")) {
      return "E001: Invalid enum value (type, level, or status)";
    }
    if (error.includes("E002")) {
      return "E002: Required field missing";
    }
    if (error.includes("E003")) {
      return "E003: Date not ISO 8601 format";
    }
    if (error.includes("E004")) {
      return "E004: Type mismatch (e.g., tags should be array, not string)";
    }
    if (error.includes("E005")) {
      return "E005: General schema violation";
    }
    if (error.includes("E006")) {
      return "E006: Domain not in taxonomy (add to akf.yaml)";
    }
    if (error.includes("E007")) {
      return "E007: created date is after updated date";
    }
    if (error.includes("E008")) {
      return "E008: Invalid relationship type";
    }
    return error;
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};

// src/StatusBar.ts
var AKFStatusBar = class {
  constructor(plugin) {
    this.statusBarItem = null;
    this.statusEl = null;
    this.plugin = plugin;
  }
  register() {
    this.statusBarItem = this.plugin.addStatusBarItem();
    this.statusBarItem.setAttribute("id", "akf-status-bar");
    this.statusEl = this.statusBarItem.createEl("span", {
      cls: "akf-status-bar-item",
      text: "\u{1F916} AKF"
    });
    this.statusEl.addEventListener("click", () => {
      if (this.plugin.isServerRunning) {
        this.plugin.stopServer();
      } else {
        this.plugin.initializeServer();
      }
    });
    this.statusEl.style.cursor = "pointer";
    this.statusEl.title = "AI Knowledge Filler - Click for options";
    this.updateDisplay();
  }
  setRunning(running) {
    if (this.statusEl) {
      this.statusEl.textContent = running ? "\u2705 AKF" : "\u{1F534} AKF";
      this.statusEl.title = running ? "AKF Server Running - Click to stop" : "AKF Server Stopped - Click to start";
    }
  }
  setStatus(status) {
    if (this.statusEl) {
      this.statusEl.textContent = status;
      this.statusEl.title = status;
    }
  }
  updateDisplay() {
    if (this.statusEl) {
      this.setRunning(this.plugin.isServerRunning);
    }
  }
  unregister() {
    if (this.statusBarItem) {
      this.statusBarItem.detach();
      this.statusBarItem = null;
    }
  }
};

// src/SetupWizard.ts
var import_obsidian3 = require("obsidian");

// src/EnvironmentChecker.ts
var import_child_process = require("child_process");
var EnvironmentChecker = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  runCommand(cmd) {
    return new Promise((resolve) => {
      (0, import_child_process.exec)(cmd, (error, stdout) => {
        resolve({ success: !error, stdout: stdout || "" });
      });
    });
  }
  async fetchWithTimeout(url) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return response.ok;
    } catch {
      return false;
    }
  }
  async checkPython() {
    const result = await this.runCommand("python --version");
    if (result.success)
      return true;
    const result2 = await this.runCommand("python3 --version");
    return result2.success;
  }
  async checkAKF() {
    const result = await this.runCommand("akf --version");
    return result.success;
  }
  async checkOllama() {
    const result = await this.runCommand("ollama --version");
    return result.success;
  }
  async isOllamaRunning() {
    return this.fetchWithTimeout(`http://localhost:${OLLAMA_PORT}/api/tags`);
  }
  async hasOllamaModel() {
    const result = await this.runCommand("ollama list");
    return result.stdout.includes("llama") || result.stdout.includes("mistral") || result.stdout.includes("codellama");
  }
  async checkApiKey() {
    const settings = this.plugin.settings;
    return !!(settings.anthropicApiKey || settings.openaiApiKey || settings.geminiApiKey || settings.groqApiKey);
  }
  async isServerRunning() {
    const port = this.plugin.settings?.serverPort ?? DEFAULT_SERVER_PORT;
    return this.fetchWithTimeout(`http://localhost:${port}/health`);
  }
  async fullCheck() {
    const [python, akf, ollama, ollamaRunning, ollamaModel, apiKey, serverRunning] = await Promise.all([
      this.checkPython(),
      this.checkAKF(),
      this.checkOllama(),
      this.isOllamaRunning(),
      this.hasOllamaModel(),
      this.checkApiKey(),
      this.isServerRunning()
    ]);
    return {
      python,
      akf,
      ollama,
      ollamaRunning,
      ollamaModel,
      apiKey,
      serverRunning
    };
  }
  installAKF() {
    return new Promise((resolve) => {
      (0, import_child_process.exec)('pip install "ai-knowledge-filler[mcp]"', (error) => {
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
  installOllama() {
    console.log("[AKF] Please install Ollama from: https://ollama.com/download");
    return Promise.resolve(false);
  }
  pullOllamaModel(model = "llama3") {
    return new Promise((resolve) => {
      console.log(`[AKF] Pulling Ollama model: ${model}...`);
      (0, import_child_process.exec)(`ollama pull ${model}`, (error) => {
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
  startOllama() {
    return new Promise((resolve) => {
      const cmd = process.platform === "win32" ? "start /B ollama serve" : "ollama serve &";
      (0, import_child_process.exec)(cmd, (error) => {
        if (error) {
          console.error("[AKF] Ollama start failed:", error);
          resolve(false);
        } else {
          setTimeout(() => resolve(true), OLLAMA_START_DELAY_MS);
        }
      });
    });
  }
  getRecommendations(checks) {
    const recommendations = [];
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
};

// src/SetupWizard.ts
var SetupWizardModal = class extends import_obsidian3.Modal {
  constructor(app, plugin) {
    super(app);
    this.checks = null;
    this.currentStep = 0;
    this.isInstalling = false;
    this.plugin = plugin;
    this.checker = new EnvironmentChecker(plugin);
  }
  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "\u{1F916} AI Knowledge Filler - Setup" });
    const statusEl = contentEl.createDiv({
      cls: "akf-setup-status",
      attr: { style: "margin: 20px 0; padding: 15px; background: var(--background-secondary); border-radius: 8px;" }
    });
    this.checks = await this.checker.fullCheck();
    await this.renderStep(contentEl, statusEl);
  }
  async renderStep(contentEl, statusEl) {
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
  async renderPythonStep(statusEl) {
    statusEl.createEl("h3", { text: "\u274C Python Not Found" });
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
  async renderAKFStep(statusEl) {
    statusEl.createEl("h3", { text: "\u{1F527} Installing AI Knowledge Filler..." });
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
        progressEl.setText("\u274C Installation failed. Please run in terminal:");
        statusEl.createEl("code", {
          text: 'pip install "ai-knowledge-filler[mcp]"',
          attr: { style: "display: block; padding: 10px; background: var(--background-primary); margin-top: 10px;" }
        });
        statusEl.createEl("button", {
          text: "Try Again",
          cls: "mod-cta"
        }).onclick = () => {
          this.checks.akf = false;
          this.renderStep(this.contentEl, statusEl);
        };
      }
    }
  }
  async renderProviderStep(statusEl) {
    statusEl.createEl("h3", { text: "\u{1F511} Choose AI Provider" });
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
    ollamaOption.createEl("h4", { text: "\u{1F999} Ollama (Recommended - Free & Private)" });
    ollamaOption.createEl("p", {
      text: "Run AI locally on your computer. No API key needed, fully offline.",
      attr: { style: "color: var(--text-muted);" }
    });
    ollamaOption.onclick = async () => {
      ollamaOption.setAttr("style", ollamaOption.getAttr("style").replace("transparent", "var(--interactive-accent)"));
      const hasOllama = await this.checker.checkOllama();
      if (!hasOllama) {
        statusEl.createEl("p", {
          text: "\u{1F4E5} Please install Ollama from ollama.com/download",
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
      statusEl.createEl("p", { text: "\u2705 Ollama detected! Starting..." });
      const started = await this.checker.startOllama();
      if (started) {
        this.checks.ollama = true;
        this.checks.ollamaRunning = true;
        await this.renderStep(this.contentEl, statusEl);
      }
    };
    const apiOption = optionsEl.createDiv({
      attr: {
        style: "padding: 15px; background: var(--background-primary); border-radius: 8px; cursor: pointer; border: 2px solid transparent;"
      }
    });
    apiOption.createEl("h4", { text: "\u2601\uFE0F Cloud API (GPT-4, Claude)" });
    apiOption.createEl("p", {
      text: "Use cloud AI services. Requires API key from OpenAI or Anthropic.",
      attr: { style: "color: var(--text-muted);" }
    });
    apiOption.onclick = () => {
      statusEl.createEl("p", {
        text: "\u2705 Go to Settings \u2192 AI Knowledge Filler to add your API key.",
        attr: { style: "color: var(--color-green); margin-top: 10px;" }
      });
      statusEl.createEl("button", {
        text: "Open Settings",
        cls: "mod-cta"
      }).onclick = () => {
        this.close();
        this.plugin.app.setting.open();
        this.plugin.app.setting.openTabById("ai-knowledge-filler");
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
  async renderOllamaStartStep(statusEl) {
    statusEl.createEl("h3", { text: "\u{1F680} Starting Ollama..." });
    statusEl.createEl("p", {
      text: "Ollama is installed but not running. Starting it now..."
    });
    const started = await this.checker.startOllama();
    if (started) {
      this.checks.ollamaRunning = true;
      await this.renderStep(this.contentEl, statusEl);
    } else {
      statusEl.createEl("p", {
        text: "\u274C Could not start Ollama automatically. Please run:",
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
  async renderOllamaModelStep(statusEl) {
    statusEl.createEl("h3", { text: "\u{1F4E5} Downloading AI Model..." });
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
          text: "\u274C Model download failed. Run manually:",
          attr: { style: "color: var(--color-red);" }
        });
        statusEl.createEl("code", {
          text: "ollama pull llama3",
          attr: { style: "display: block; padding: 10px; background: var(--background-primary); margin: 10px 0;" }
        });
      }
    }
  }
  async renderCompleteStep(statusEl) {
    statusEl.createEl("h3", { text: "\u{1F389} Setup Complete!" });
    statusEl.createEl("p", {
      text: "AI Knowledge Filler is ready to use!",
      attr: { style: "color: var(--color-green);" }
    });
    const featuresEl = statusEl.createDiv({
      attr: { style: "margin-top: 20px;" }
    });
    featuresEl.createEl("p", { text: "\u{1F4DD} Ctrl+Shift+G - Generate knowledge file" });
    featuresEl.createEl("p", { text: "\u2705 Ctrl+Shift+V - Validate current file" });
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
};

// src/main.ts
var DEFAULT_SETTINGS = {
  akfPath: "akf",
  vaultPath: "",
  serverPort: DEFAULT_SERVER_PORT,
  model: "ollama",
  defaultDomain: "",
  autoStart: true,
  anthropicApiKey: "",
  openaiApiKey: "",
  geminiApiKey: "",
  groqApiKey: "",
  skipSetup: false,
  useOllama: true,
  ollamaModel: "llama3"
};
var ObsidianAKFPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.isServerRunning = false;
    this.serverProcess = null;
    this.setupShown = false;
    this.intentionalStop = false;
    this.restartCount = 0;
    this.firstRestartTime = 0;
  }
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
      }
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
      }
    });
    this.addCommand({
      id: "akf-validate-vault",
      name: "Validate entire vault",
      callback: async () => {
        const notice = new import_obsidian4.Notice("\u23F3 Validating vault...", 0);
        const vaultPath = this.settings.vaultPath || this.getVaultPath();
        try {
          const result = await this.httpClient.validate(vaultPath);
          notice.hide();
          if (result.is_valid) {
            new import_obsidian4.Notice("\u2705 Vault is valid!");
          } else {
            new import_obsidian4.Notice(`\u274C Found ${result.errors.length} error(s) \u2014 open a file and use Ctrl+Shift+V for details`);
          }
        } catch (err) {
          notice.hide();
          new import_obsidian4.Notice(`\u274C Validation failed: ${err.message}`);
        }
      }
    });
    this.addCommand({
      id: "akf-start-server",
      name: "Start AKF server",
      callback: () => {
        this.initializeServer();
      }
    });
    this.addCommand({
      id: "akf-open-settings",
      name: "Open settings",
      callback: () => {
        this.app.commands.executeCommandById("app:open-settings");
      }
    });
    this.addCommand({
      id: "akf-run-setup",
      name: "Run setup wizard",
      callback: () => {
        new SetupWizardModal(this.app, this).open();
      }
    });
  }
  async initializeServer() {
    if (this.isServerRunning)
      return;
    if (import_obsidian4.Platform.isMobile) {
      new import_obsidian4.Notice("AKF: running on mobile \u2014 start the server manually on your desktop and set the server URL in settings.");
      return;
    }
    const checks = await this.envChecker.fullCheck();
    if (!checks.python) {
      this.statusBar.setStatus("\u26A0\uFE0F No Python");
      new SetupWizardModal(this.app, this).open();
      return;
    }
    if (!checks.akf) {
      this.statusBar.setStatus("\u2699\uFE0F Installing...");
      const installed = await this.envChecker.installAKF();
      if (!installed) {
        this.statusBar.setStatus("\u274C Install failed");
        return;
      }
    }
    if (checks.akf && !checks.serverRunning) {
      this.statusBar.setStatus("\u{1F680} Starting...");
      await this.startServer();
    }
    if (checks.serverRunning) {
      this.isServerRunning = true;
      this.statusBar.setRunning(true);
      this.statusBar.setStatus("\u2705 Ready");
    }
  }
  async startServer() {
    try {
      const port = this.settings.serverPort;
      const env = this.getEnvVars();
      const { spawn } = await import("child_process");
      this.intentionalStop = false;
      this.serverProcess = spawn("akf", ["serve", "--port", String(port)], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        env: { ...env, ...(await import("process")).env },
        detached: false
      });
      this.serverProcess.stdout?.on("data", (data) => {
        console.log("[AKF]", data.toString().trim());
      });
      this.serverProcess.stderr?.on("data", (data) => {
        console.error("[AKF Error]", data.toString().trim());
      });
      this.serverProcess.on("error", (err) => {
        console.error("[AKF] Server error:", err);
        this.isServerRunning = false;
        this.statusBar.setRunning(false);
      });
      this.serverProcess.on("exit", (code) => {
        console.log("[AKF] Server exited with code:", code);
        this.isServerRunning = false;
        this.statusBar.setRunning(false);
        this.maybeRestartServer();
      });
      for (let i = 0; i < SERVER_STARTUP_MAX_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, SERVER_STARTUP_POLL_INTERVAL_MS));
        if (await this.envChecker.isServerRunning()) {
          this.isServerRunning = true;
          this.statusBar.setRunning(true);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error("[AKF] Failed to start server:", err);
      return false;
    }
  }
  maybeRestartServer() {
    if (this.intentionalStop)
      return;
    const now = Date.now();
    if (now - this.firstRestartTime > SERVER_RESTART_WINDOW_MS) {
      this.restartCount = 0;
      this.firstRestartTime = now;
    }
    if (this.restartCount < SERVER_MAX_RESTARTS) {
      this.restartCount++;
      console.log(`[AKF] Restarting server (attempt ${this.restartCount}/${SERVER_MAX_RESTARTS})...`);
      this.statusBar.setStatus("\u{1F504} Restarting...");
      setTimeout(() => this.startServer(), SERVER_RESTART_DELAY_MS);
    } else {
      console.error("[AKF] Server crashed too many times, giving up.");
      this.statusBar.setStatus("\u274C Server crashed");
    }
  }
  getEnvVars() {
    const env = {};
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
    this.intentionalStop = true;
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
    this.isServerRunning = false;
    this.statusBar.setRunning(false);
  }
  getVaultPath() {
    try {
      const adapter = this.app.vault.adapter;
      if ("getBasePath" in adapter) {
        return adapter.getBasePath();
      }
    } catch (e) {
      console.warn("[AKF] Could not determine vault path, falling back to '.':", e);
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
};
var AKFSettingsTab = class extends import_obsidian4.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  async display() {
    const { containerEl } = this;
    containerEl.empty();
    const checks = await this.plugin.envChecker.fullCheck();
    containerEl.createEl("h2", { text: "\u{1F916} AI Knowledge Filler" });
    containerEl.createEl("div", {
      attr: {
        innerHTML: `
          <p style="color: var(--text-muted); margin-bottom: 20px;">
            AI-powered knowledge generation with schema validation
          </p>
        `
      }
    });
    containerEl.createEl("h3", { text: "\u{1F4CA} Status" });
    const statusEl = containerEl.createDiv({
      attr: {
        style: "padding: 15px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 20px;"
      }
    });
    this.renderStatus(statusEl, checks);
    const refreshBtn = containerEl.createEl("button", {
      text: "\u{1F504} Refresh Status",
      cls: "mod-cta"
    });
    refreshBtn.onclick = () => this.display();
    containerEl.createEl("h3", { text: "\u{1F999} Ollama (Local AI)" });
    new import_obsidian4.Setting(containerEl).setName("Use Ollama").setDesc("Use local AI (free, no API key needed). Requires Ollama installed.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.useOllama).onChange(async (value) => {
        this.plugin.settings.useOllama = value;
        if (value) {
          this.plugin.settings.model = "ollama";
        }
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Ollama model").setDesc("Model to use with Ollama").addDropdown(
      (dropdown) => dropdown.addOptions({
        llama3: "Llama 3 (recommended)",
        llama2: "Llama 2",
        mistral: "Mistral",
        codellama: "Code Llama"
      }).setValue(this.plugin.settings.ollamaModel).onChange(async (value) => {
        this.plugin.settings.ollamaModel = value;
        await this.plugin.saveSettings();
      })
    );
    if (!checks.ollama) {
      containerEl.createEl("p", {
        text: "\u{1F4E5} Install Ollama from ollama.com for free local AI",
        attr: { style: "color: var(--color-yellow);" }
      });
    }
    containerEl.createEl("h3", { text: "\u{1F511} Cloud API Keys" });
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
    containerEl.createEl("h3", { text: "\u2699\uFE0F General Settings" });
    new import_obsidian4.Setting(containerEl).setName("Default model").setDesc("LLM provider to use").addDropdown(
      (dropdown) => dropdown.addOptions({
        ollama: "Ollama (local)",
        claude: "Claude",
        gpt4: "GPT-4",
        gemini: "Gemini",
        groq: "Groq"
      }).setValue(this.plugin.settings.model).onChange(async (value) => {
        this.plugin.settings.model = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Default domain").setDesc("Domain for generated files (e.g., ai-system, devops)").addText(
      (text) => text.setValue(this.plugin.settings.defaultDomain).onChange(async (value) => {
        this.plugin.settings.defaultDomain = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Auto-start server").setDesc("Start server when Obsidian opens").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoStart).onChange(async (value) => {
        this.plugin.settings.autoStart = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Server port").setDesc("Port for the AKF server (default: 8000). Change if port is already in use.").addText(
      (text) => text.setValue(String(this.plugin.settings.serverPort)).onChange(async (value) => {
        const port = parseInt(value, 10);
        if (!isNaN(port) && port > 0 && port < 65536) {
          this.plugin.settings.serverPort = port;
          await this.plugin.saveSettings();
        }
      })
    );
    containerEl.createEl("h3", { text: "\u{1F680} Server" });
    new import_obsidian4.Setting(containerEl).setName("Server").setDesc(this.plugin.isServerRunning ? `\u{1F7E2} Running on port ${this.plugin.settings.serverPort}` : "\u{1F534} Stopped").addButton(
      (button) => button.setButtonText(this.plugin.isServerRunning ? "Stop Server" : "Start Server").setCta().onClick(() => {
        if (this.plugin.isServerRunning) {
          this.plugin.stopServer();
        } else {
          this.plugin.initializeServer();
        }
        this.display();
      })
    );
    containerEl.createEl("h3", { text: "\u{1F4D6} Quick Help" });
    containerEl.createEl("p", {
      text: "\u2022 Ctrl+Shift+G \u2014 Generate file\n\u2022 Ctrl+Shift+V \u2014 Validate file",
      attr: { style: "color: var(--text-muted); font-size: 0.85em; white-space: pre-line;" }
    });
  }
  renderStatus(el, checks) {
    const items = [
      { label: "Python", status: checks.python, ok: "\u2705", fail: "\u274C" },
      { label: "AKF", status: checks.akf, ok: "\u2705", fail: "\u274C" },
      { label: "Ollama", status: checks.ollama, ok: "\u2705", fail: "\u274C" },
      { label: "Ollama running", status: checks.ollamaRunning, ok: "\u2705", fail: "\u274C" },
      { label: "Ollama model", status: checks.ollamaModel, ok: "\u2705", fail: "\u274C" },
      { label: "AKF Server", status: checks.serverRunning, ok: "\u2705", fail: "\u274C" },
      { label: "API Key", status: checks.apiKey, ok: "\u2705", fail: "\u26A0\uFE0F (Ollama fallback)" }
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
  createApiKeySetting(name, placeholder, key) {
    new import_obsidian4.Setting(this.containerEl).setName(name).setDesc("Optional - only if not using Ollama").addText(
      (text) => text.setPlaceholder(placeholder).setValue(this.plugin.settings[key] || "").onChange(async (value) => {
        this.plugin.settings[key] = value;
        await this.plugin.saveSettings();
      }).inputEl.setAttribute("type", "password")
    );
  }
};
//# sourceMappingURL=main.js.map
