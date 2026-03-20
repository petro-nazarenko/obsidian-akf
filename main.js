"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsidianAKFPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/SubprocessManager.ts
var import_child_process = require("child_process");
var SubprocessManager = class {
  constructor(plugin) {
    this.process = null;
    this.requestId = 0;
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.plugin = plugin;
  }
  getVaultPath() {
    try {
      const adapter = this.plugin.app.vault.adapter;
      if ("getBasePath" in adapter) {
        return adapter.getBasePath();
      }
    } catch {
    }
    return ".";
  }
  getEnv() {
    const env = { ...process.env };
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
  async start() {
    if (this.process) {
      return true;
    }
    const akfPath = this.plugin.settings.akfPath || "akf";
    return new Promise((resolve) => {
      try {
        this.process = (0, import_child_process.spawn)(akfPath, ["serve", "--mcp"], {
          stdio: ["pipe", "pipe", "pipe"],
          shell: true,
          env: this.getEnv()
        });
        let buffer = "";
        this.process.stdout?.on("data", (data) => {
          buffer += data.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.trim()) {
              this.handleMCPResponse(line);
            }
          }
        });
        this.process.stderr?.on("data", (data) => {
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
        }, 1e3);
      } catch (err) {
        console.error("[AKF] Failed to start:", err);
        resolve(false);
      }
    });
  }
  handleMCPResponse(line) {
    try {
      const response = JSON.parse(line);
      if (response.jsonrpc === "2.0" && response.id !== void 0) {
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
  async sendRequest(method, params) {
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
          arguments: params
        }
      };
      this.process?.stdin?.write(JSON.stringify(request) + "\n");
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 6e4);
    });
  }
  async generate(prompt, domain, type) {
    const vaultPath = this.plugin.settings.vaultPath || this.getVaultPath();
    const args = {
      prompt,
      output: vaultPath,
      model: this.plugin.settings.model || "auto"
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
        errors: result.errors ?? []
      };
    } catch (err) {
      return {
        success: false,
        file_path: null,
        attempts: 0,
        errors: [err.message]
      };
    }
  }
  async validate(path) {
    try {
      const result = await this.sendRequest("validate", { path, strict: true });
      return {
        is_valid: result.is_valid ?? false,
        errors: result.errors ?? []
      };
    } catch (err) {
      return {
        is_valid: false,
        errors: [err.message]
      };
    }
  }
  async enrich(path, force = false) {
    try {
      const result = await this.sendRequest("enrich", { path, force });
      return {
        enriched: result.enriched ?? 0,
        skipped: result.skipped ?? 0,
        failed: result.failed ?? 0
      };
    } catch (err) {
      return { enriched: 0, skipped: 0, failed: 1 };
    }
  }
  async batch(prompts) {
    try {
      const vaultPath = this.plugin.settings.vaultPath || this.getVaultPath();
      const result = await this.sendRequest("batch", {
        plan: prompts.map((p) => ({ prompt: p })),
        output: vaultPath,
        model: this.plugin.settings.model || "auto"
      });
      return {
        total: result.total ?? 0,
        ok: result.ok ?? 0,
        failed: result.failed ?? 0
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
    contentEl.createEl("h2", { text: "AI Knowledge Filler - Generate" });
    new import_obsidian.Setting(contentEl).setName("Prompt").setDesc("Describe what knowledge file you want to generate").addTextArea(
      (text) => text.setPlaceholder("Write a guide on Docker networking...").setValue(this.prompt).onChange((value) => {
        this.prompt = value;
      }).inputEl.setAttr("rows", 4)
    );
    new import_obsidian.Setting(contentEl).setName("Domain (optional)").setDesc("Taxonomy domain: ai-system, api-design, devops, security, system-design...").addText(
      (text) => text.setValue(this.domain).onChange((value) => {
        this.domain = value;
      })
    );
    new import_obsidian.Setting(contentEl).setName("Type (optional)").setDesc("File type: concept, guide, reference, checklist, project, roadmap...").addDropdown(
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
      cls: "akf-modal-buttons",
      attr: { style: "display: flex; gap: 10px; margin-top: 20px;" }
    });
    const statusEl = contentEl.createDiv({
      cls: "akf-status",
      attr: { style: "margin-top: 15px; font-style: italic;" }
    });
    const generateBtn = buttonContainer.createEl("button", {
      text: "Generate",
      cls: "mod-cta"
    });
    const cancelBtn = buttonContainer.createEl("button", {
      text: "Cancel"
    });
    cancelBtn.onclick = () => {
      this.close();
    };
    generateBtn.onclick = async () => {
      if (!this.prompt.trim()) {
        statusEl.setText("Please enter a prompt");
        return;
      }
      this.isGenerating = true;
      generateBtn.setAttr("disabled", true);
      generateBtn.setText("Generating...");
      statusEl.setText("Starting AKF server...");
      try {
        await this.plugin.startAKF();
        statusEl.setText("Generating knowledge file...");
        const result = await this.plugin.subprocessManager.generate(
          this.prompt,
          this.domain || void 0,
          this.type || void 0
        );
        if (result.success && result.file_path) {
          statusEl.setText(`\u2705 Success! File: ${result.file_path}`);
          setTimeout(async () => {
            await this.plugin.app.workspace.getLeaf().openFile(
              await this.plugin.app.vault.getAbstractFileByPath(
                result.file_path
              )
            );
            this.close();
          }, 1500);
        } else {
          const errorMsg = result.errors.length > 0 ? result.errors.join(", ") : "Generation failed";
          statusEl.setText(`\u274C Error: ${errorMsg}`);
          this.isGenerating = false;
          generateBtn.removeAttribute("disabled");
          generateBtn.setText("Retry");
        }
      } catch (err) {
        statusEl.setText(`\u274C Error: ${err.message}`);
        this.isGenerating = false;
        generateBtn.removeAttribute("disabled");
        generateBtn.setText("Retry");
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
    this.isValidating = false;
    this.plugin = plugin;
    this.path = path;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "AKF Validation Results" });
    const fileName = this.path.split("/").pop() || this.path;
    contentEl.createEl("p", {
      text: `Validating: ${fileName}`,
      attr: { style: "color: var(--text-muted);" }
    });
    const statusEl = contentEl.createDiv({
      cls: "akf-validation-status",
      attr: { style: "margin: 20px 0; font-weight: bold;" }
    });
    const resultsEl = contentEl.createDiv({
      cls: "akf-validation-results",
      attr: { style: "max-height: 300px; overflow-y: auto;" }
    });
    statusEl.setText("Starting validation...");
    this.runValidation(statusEl, resultsEl);
  }
  async runValidation(statusEl, resultsEl) {
    this.isValidating = true;
    try {
      await this.plugin.startAKF();
      statusEl.setText("Validating...");
      const result = await this.plugin.subprocessManager.validate(this.path);
      if (result.is_valid) {
        statusEl.setText("\u2705 File is valid!");
        statusEl.style.color = "var(--color-green)";
        resultsEl.createEl("p", {
          text: "No validation errors found.",
          attr: { style: "color: var(--text-muted);" }
        });
      } else {
        statusEl.setText(`\u274C Found ${result.errors.length} error(s)`);
        statusEl.style.color = "var(--color-red)";
        for (const error of result.errors) {
          const errorItem = resultsEl.createDiv({
            cls: "akf-validation-error",
            attr: {
              style: "padding: 10px; margin: 5px 0; background: var(--background-secondary); border-radius: 4px; font-family: monospace; font-size: 13px;"
            }
          });
          errorItem.createEl("span", { text: this.formatError(error) });
        }
      }
    } catch (err) {
      statusEl.setText(`\u274C Error: ${err.message}`);
      statusEl.style.color = "var(--color-red)";
    } finally {
      this.isValidating = false;
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
      return "E006: Domain not in taxonomy";
    }
    if (error.includes("E007")) {
      return "E007: created date is after updated date";
    }
    if (error.includes("E008")) {
      return "E008: Relationship type not in allowed types";
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
      text: "\u{1F534} AKF"
    });
    this.statusEl.addEventListener("click", () => {
      if (this.plugin.akfRunning) {
        this.plugin.stopAKF();
      } else {
        this.plugin.startAKF();
      }
    });
    this.statusEl.style.cursor = "pointer";
    this.statusEl.title = "Click to toggle AKF server";
    this.updateDisplay();
  }
  setRunning(running) {
    if (this.statusEl) {
      this.statusEl.textContent = running ? "\u{1F7E2} AKF" : "\u{1F534} AKF";
      this.statusEl.title = running ? "AKF Server Running - Click to stop" : "AKF Server Stopped - Click to start";
    }
  }
  updateDisplay() {
    if (this.statusEl) {
      this.setRunning(this.plugin.akfRunning);
    }
  }
  unregister() {
    if (this.statusBarItem) {
      this.statusBarItem.detach();
      this.statusBarItem = null;
    }
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  akfPath: "akf",
  vaultPath: "",
  model: "auto",
  defaultDomain: "",
  autoStart: true,
  anthropicApiKey: "",
  openaiApiKey: "",
  geminiApiKey: "",
  groqApiKey: ""
};
var ObsidianAKFPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.akfRunning = false;
  }
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
        const vaultPath = this.settings.vaultPath || this.getVaultPath();
        await this.subprocessManager.validate(vaultPath);
      }
    });
    this.addCommand({
      id: "akf-start",
      name: "Start AKF server",
      callback: () => {
        this.startAKF();
      }
    });
    this.addCommand({
      id: "akf-stop",
      name: "Stop AKF server",
      callback: () => {
        this.stopAKF();
      }
    });
  }
  getVaultPath() {
    try {
      const adapter = this.app.vault.adapter;
      if ("getBasePath" in adapter) {
        return adapter.getBasePath();
      }
    } catch {
    }
    return ".";
  }
  async startAKF() {
    if (this.akfRunning)
      return;
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
};
var AKFSettingsTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "AI Knowledge Filler" });
    containerEl.createEl("p", {
      text: "AI-powered knowledge generation with schema validation (E001-E008)",
      attr: { style: "color: var(--text-muted); margin-bottom: 20px;" }
    });
    containerEl.createEl("h3", { text: "\u{1F511} API Keys" });
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
    containerEl.createEl("h3", { text: "\u2699\uFE0F Settings" });
    new import_obsidian3.Setting(containerEl).setName("Default model").setDesc("Select LLM provider for generation").addDropdown(
      (dropdown) => dropdown.addOptions({
        auto: "Auto (default)",
        claude: "Claude",
        gpt4: "GPT-4",
        gemini: "Gemini",
        groq: "Groq",
        ollama: "Ollama (local)"
      }).setValue(this.plugin.settings.model).onChange(async (value) => {
        this.plugin.settings.model = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("AKF executable path").setDesc("Path to the 'akf' command. Usually just 'akf' if installed.").addText(
      (text) => text.setValue(this.plugin.settings.akfPath).onChange(async (value) => {
        this.plugin.settings.akfPath = value || "akf";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Vault path").setDesc("Path to your vault (auto-detected).").addText(
      (text) => text.setValue(this.plugin.settings.vaultPath).onChange(async (value) => {
        this.plugin.settings.vaultPath = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Default domain").setDesc("Default domain for generated files (e.g., ai-system, devops)").addText(
      (text) => text.setValue(this.plugin.settings.defaultDomain).onChange(async (value) => {
        this.plugin.settings.defaultDomain = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Auto-start AKF server").setDesc("Start AKF server when Obsidian loads.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoStart).onChange(async (value) => {
        this.plugin.settings.autoStart = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u{1F680} Server Control" });
    new import_obsidian3.Setting(containerEl).setName("Server status").setDesc(this.plugin.akfRunning ? "\u{1F7E2} Running" : "\u{1F534} Stopped").addButton(
      (button) => button.setButtonText(this.plugin.akfRunning ? "Stop Server" : "Start Server").setCta().onClick(() => {
        if (this.plugin.akfRunning) {
          this.plugin.stopAKF();
        } else {
          this.plugin.startAKF();
        }
        this.display();
      })
    );
    containerEl.createEl("h3", { text: "\u{1F4D6} Quick Start" });
    containerEl.createEl("p", {
      text: "1. Add your API key above\n2. Select a model\n3. Press Ctrl+Shift+G to generate",
      attr: { style: "color: var(--text-muted); font-size: 0.85em; white-space: pre-line;" }
    });
  }
  createApiKeySetting(name, placeholder, key, docsUrl) {
    new import_obsidian3.Setting(this.containerEl).setName(name).setDesc(`Get key at ${docsUrl}`).addText(
      (text) => text.setPlaceholder(placeholder).setValue(this.plugin.settings[key] || "").onChange(async (value) => {
        this.plugin.settings[key] = value;
        await this.plugin.saveSettings();
      }).inputEl.setAttribute("type", "password")
    );
  }
};
//# sourceMappingURL=main.js.map
