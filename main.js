"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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

// src/constants.ts
var VALID_TYPES, VALID_LEVELS, VALID_STATUSES, VALID_RELATIONSHIP_TYPES, REQUIRED_FIELDS, DEFAULT_DOMAINS, MODAL_CLOSE_DELAY_MS, LLM_TIMEOUT_MS, LLM_MAX_RETRIES;
var init_constants = __esm({
  "src/constants.ts"() {
    "use strict";
    VALID_TYPES = [
      "concept",
      "guide",
      "reference",
      "checklist",
      "project",
      "roadmap",
      "template",
      "audit"
    ];
    VALID_LEVELS = ["beginner", "intermediate", "advanced"];
    VALID_STATUSES = ["draft", "review", "published", "archived"];
    VALID_RELATIONSHIP_TYPES = [
      "related",
      "prerequisite",
      "extends",
      "implements",
      "references",
      "part-of",
      "contains",
      "depends-on"
    ];
    REQUIRED_FIELDS = ["title", "type", "domain", "created", "updated"];
    DEFAULT_DOMAINS = [
      "ai-system",
      "api-design",
      "architecture",
      "automation",
      "backend",
      "cloud",
      "data",
      "database",
      "devops",
      "frontend",
      "infrastructure",
      "ml-ops",
      "mobile",
      "monitoring",
      "networking",
      "security",
      "testing",
      "ui-ux",
      "web"
    ];
    MODAL_CLOSE_DELAY_MS = 1500;
    LLM_TIMEOUT_MS = 6e4;
    LLM_MAX_RETRIES = 3;
  }
});

// src/Validator.ts
var Validator_exports = {};
__export(Validator_exports, {
  validate: () => validate
});
function validate(frontmatter, content = "", allowedDomains = DEFAULT_DOMAINS) {
  const errors = [];
  const warnings = [];
  for (const field of REQUIRED_FIELDS) {
    const val = frontmatter[field];
    if (val === void 0 || val === null || val === "") {
      errors.push({ code: "E002", message: `Required field missing: '${field}'` });
    }
  }
  if (frontmatter.title !== void 0 && typeof frontmatter.title !== "string") {
    errors.push({ code: "E004", message: "Field 'title' must be a string" });
  }
  if (frontmatter.tags !== void 0 && !Array.isArray(frontmatter.tags)) {
    errors.push({ code: "E004", message: "Field 'tags' must be an array, not a string" });
  }
  if (frontmatter.summary !== void 0 && typeof frontmatter.summary !== "string") {
    errors.push({ code: "E004", message: "Field 'summary' must be a string" });
  }
  const validTypes = VALID_TYPES;
  const validLevels = VALID_LEVELS;
  const validStatuses = VALID_STATUSES;
  const validRelTypes = VALID_RELATIONSHIP_TYPES;
  if (frontmatter.type && !validTypes.includes(String(frontmatter.type))) {
    errors.push({
      code: "E001",
      message: `Invalid type: '${frontmatter.type}'. Must be one of: ${VALID_TYPES.join(", ")}`
    });
  }
  if (frontmatter.level && !validLevels.includes(String(frontmatter.level))) {
    errors.push({
      code: "E001",
      message: `Invalid level: '${frontmatter.level}'. Must be one of: ${VALID_LEVELS.join(", ")}`
    });
  }
  if (frontmatter.status && !validStatuses.includes(String(frontmatter.status))) {
    errors.push({
      code: "E001",
      message: `Invalid status: '${frontmatter.status}'. Must be one of: ${VALID_STATUSES.join(", ")}`
    });
  }
  if (frontmatter.created && !ISO_DATE_RE.test(String(frontmatter.created))) {
    errors.push({
      code: "E003",
      message: `'created' is not a valid ISO 8601 date: ${frontmatter.created}`
    });
  }
  if (frontmatter.updated && !ISO_DATE_RE.test(String(frontmatter.updated))) {
    errors.push({
      code: "E003",
      message: `'updated' is not a valid ISO 8601 date: ${frontmatter.updated}`
    });
  }
  if (frontmatter.created && frontmatter.updated) {
    const created = new Date(String(frontmatter.created));
    const updated = new Date(String(frontmatter.updated));
    if (!isNaN(created.getTime()) && !isNaN(updated.getTime()) && created > updated) {
      errors.push({
        code: "E007",
        message: `'created' (${frontmatter.created}) is after 'updated' (${frontmatter.updated})`
      });
    }
  }
  if (frontmatter.domain && typeof frontmatter.domain === "string") {
    const domain = frontmatter.domain;
    const isKnown = allowedDomains.some(
      (d) => domain === d || domain.startsWith(d + "/")
    );
    if (!isKnown) {
      errors.push({
        code: "E006",
        message: `Domain '${domain}' not in taxonomy. Known domains: ${allowedDomains.slice(0, 6).join(", ")}...`
      });
    }
  }
  for (const match of content.matchAll(/\[\[[^\]|]+\|([^\]]+)\]\]/g)) {
    const relType = match[1].trim();
    if (!validRelTypes.includes(relType)) {
      errors.push({
        code: "E008",
        message: `Invalid relationship type: '${relType}'. Must be one of: ${VALID_RELATIONSHIP_TYPES.join(", ")}`
      });
    }
  }
  for (const [key, val] of Object.entries(frontmatter)) {
    if (key !== "tags" && val !== null && val !== void 0 && typeof val === "object" && !Array.isArray(val) && !["title", "type", "domain", "level", "status", "created", "updated", "summary"].includes(key)) {
      warnings.push(`E005: Unexpected nested object in field '${key}'`);
    }
  }
  return {
    is_valid: errors.length === 0,
    errors,
    warnings
  };
}
var ISO_DATE_RE;
var init_Validator = __esm({
  "src/Validator.ts"() {
    "use strict";
    init_constants();
    ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;
  }
});

// src/utils.ts
var utils_exports = {};
__export(utils_exports, {
  loadAllowedDomains: () => loadAllowedDomains,
  parseFrontmatter: () => parseFrontmatter,
  sanitizeFilename: () => sanitizeFilename,
  writeNoteToVault: () => writeNoteToVault
});
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match)
    return null;
  try {
    const parsed = (0, import_obsidian.parseYaml)(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    return {
      frontmatter: parsed,
      body: match[2]
    };
  } catch {
    return null;
  }
}
async function writeNoteToVault(app, filePath, content) {
  const existing = app.vault.getAbstractFileByPath(filePath);
  if (existing instanceof import_obsidian.TFile) {
    await app.vault.modify(existing, content);
  } else {
    const parts = filePath.split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join("/");
      try {
        await app.vault.createFolder(dir);
      } catch {
      }
    }
    await app.vault.create(filePath, content);
  }
}
async function loadAllowedDomains(app) {
  try {
    const configFile = app.vault.getAbstractFileByPath("akf.yaml");
    if (configFile instanceof import_obsidian.TFile) {
      const content = await app.vault.read(configFile);
      const parsed = (0, import_obsidian.parseYaml)(content);
      if (parsed?.domains && Array.isArray(parsed.domains)) {
        return parsed.domains;
      }
    }
  } catch {
  }
  return DEFAULT_DOMAINS;
}
function sanitizeFilename(title) {
  return title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
}
var import_obsidian;
var init_utils = __esm({
  "src/utils.ts"() {
    "use strict";
    import_obsidian = require("obsidian");
    init_constants();
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsidianAKFPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/GenerateModal.ts
var import_obsidian2 = require("obsidian");

// src/LLMClient.ts
init_constants();
init_constants();
var SYSTEM_PROMPT = `You are an AI knowledge file generator for the AKF (AI Knowledge Filler) system.
Generate a complete markdown file with YAML frontmatter following this exact schema.

Required frontmatter fields:
- title: string (descriptive, human-readable title)
- type: one of: ${VALID_TYPES.join(", ")}
- domain: domain prefix (e.g., ai-system, devops, api-design, security)
- created: ISO 8601 date (YYYY-MM-DD)
- updated: ISO 8601 date (YYYY-MM-DD, must be >= created)

Optional frontmatter fields:
- level: one of: ${VALID_LEVELS.join(", ")}
- status: one of: ${VALID_STATUSES.join(", ")}
- tags: array of strings
- summary: brief one-sentence description

For relationships in the body, use the syntax: [[NoteTitle|relationship-type]]
Valid relationship types: ${VALID_RELATIONSHIP_TYPES.join(", ")}

Return ONLY the raw markdown file content starting with ---, no code fences, no preamble.`;
var LLMClient = class _LLMClient {
  static async generate(userMessage, settings) {
    const { model, anthropicApiKey, openaiApiKey, geminiApiKey, groqApiKey } = settings;
    if ((model === "claude" || model === "anthropic") && anthropicApiKey) {
      return _LLMClient.callAnthropic(userMessage, anthropicApiKey);
    }
    if ((model === "gpt4" || model === "openai") && openaiApiKey) {
      return _LLMClient.callOpenAI(userMessage, openaiApiKey);
    }
    if (model === "gemini" && geminiApiKey) {
      return _LLMClient.callGemini(userMessage, geminiApiKey);
    }
    if (model === "groq" && groqApiKey) {
      return _LLMClient.callGroq(userMessage, groqApiKey);
    }
    if (anthropicApiKey)
      return _LLMClient.callAnthropic(userMessage, anthropicApiKey);
    if (openaiApiKey)
      return _LLMClient.callOpenAI(userMessage, openaiApiKey);
    if (geminiApiKey)
      return _LLMClient.callGemini(userMessage, geminiApiKey);
    if (groqApiKey)
      return _LLMClient.callGroq(userMessage, groqApiKey);
    throw new Error(
      "No API key configured. Add an API key in Settings \u2192 AI Knowledge Filler."
    );
  }
  static async callAnthropic(prompt, apiKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }]
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${err}`);
      }
      const data = await response.json();
      return data.content[0].text;
    } finally {
      clearTimeout(timer);
    }
  }
  static async callOpenAI(prompt, apiKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 4096,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt }
          ]
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${err}`);
      }
      const data = await response.json();
      return data.choices[0].message.content;
    } finally {
      clearTimeout(timer);
    }
  }
  static async callGemini(prompt, apiKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: SYSTEM_PROMPT + "\n\n" + prompt }] }
          ]
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${err}`);
      }
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } finally {
      clearTimeout(timer);
    }
  }
  static async callGroq(prompt, apiKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 4096,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt }
          ]
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq API error ${response.status}: ${err}`);
      }
      const data = await response.json();
      return data.choices[0].message.content;
    } finally {
      clearTimeout(timer);
    }
  }
};

// src/GenerateModal.ts
init_Validator();
init_utils();
init_constants();
var GenerateModal = class extends import_obsidian2.Modal {
  constructor(app, plugin) {
    super(app);
    this.prompt = "";
    this.domain = "";
    this.type = "";
    this.attempt = 0;
    this.plugin = plugin;
    this.domain = plugin.settings.defaultDomain || "";
  }
  onOpen() {
    this.renderForm();
  }
  renderForm() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Generate Knowledge File" });
    let promptInput;
    new import_obsidian2.Setting(contentEl).setName("What do you want to create?").setDesc("Describe the knowledge file you need").addTextArea((text) => {
      text.setPlaceholder(
        "Write a guide on Docker networking, or explain microservices architecture..."
      ).setValue(this.prompt).onChange((v) => this.prompt = v);
      text.inputEl.rows = 4;
      text.inputEl.style.width = "100%";
      promptInput = text.inputEl;
    });
    new import_obsidian2.Setting(contentEl).setName("Domain (optional)").setDesc("e.g., ai-system, api-design, devops, security").addText(
      (text) => text.setValue(this.domain).onChange((v) => this.domain = v)
    );
    new import_obsidian2.Setting(contentEl).setName("Type (optional)").addDropdown(
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
      }).setValue(this.type).onChange((v) => this.type = v)
    );
    const buttonRow = contentEl.createDiv({
      attr: { style: "display: flex; gap: 10px; margin-top: 20px;" }
    });
    const statusEl = contentEl.createDiv({
      attr: {
        style: "margin-top: 12px; padding: 10px; background: var(--background-secondary); border-radius: 4px; font-size: 0.9em; min-height: 32px;"
      }
    });
    const generateBtn = buttonRow.createEl("button", {
      text: "\u2728 Generate",
      cls: "mod-cta"
    });
    generateBtn.disabled = true;
    buttonRow.createEl("button", { text: "Cancel" }).onclick = () => this.close();
    setTimeout(() => {
      promptInput?.addEventListener("input", () => {
        generateBtn.disabled = !promptInput.value.trim();
      });
    }, 0);
    generateBtn.onclick = () => this.runGenerate(generateBtn, statusEl);
  }
  async runGenerate(btn, statusEl) {
    if (!this.prompt.trim()) {
      statusEl.setText("Please enter a prompt.");
      return;
    }
    const allowedDomains = await loadAllowedDomains(this.app);
    let userMessage = this.buildPrompt(this.prompt, this.domain, this.type);
    let lastErrors = [];
    btn.disabled = true;
    for (this.attempt = 1; this.attempt <= LLM_MAX_RETRIES; this.attempt++) {
      statusEl.setText(`\u23F3 Generating... (attempt ${this.attempt}/${LLM_MAX_RETRIES})`);
      let markdown;
      try {
        markdown = await LLMClient.generate(userMessage, this.plugin.settings);
      } catch (err) {
        statusEl.setText(`\u274C ${err.message}`);
        btn.disabled = false;
        btn.setText("\u{1F504} Retry");
        return;
      }
      const parsed = parseFrontmatter(markdown);
      if (!parsed) {
        lastErrors = ["Response did not contain valid YAML frontmatter."];
        userMessage = this.buildRetryPrompt(this.prompt, this.domain, this.type, lastErrors);
        continue;
      }
      const result = validate(parsed.frontmatter, parsed.body, allowedDomains);
      if (result.is_valid) {
        const title = typeof parsed.frontmatter.title === "string" ? parsed.frontmatter.title : "untitled";
        const filename = sanitizeFilename(title) + ".md";
        try {
          await writeNoteToVault(this.app, filename, markdown);
        } catch (err) {
          statusEl.setText(`\u274C Could not write file: ${err.message}`);
          btn.disabled = false;
          btn.setText("\u{1F504} Retry");
          return;
        }
        statusEl.setText(`\u2705 Created: ${filename}`);
        setTimeout(async () => {
          try {
            const file = this.app.vault.getAbstractFileByPath(filename);
            if (file instanceof import_obsidian2.TFile) {
              await this.app.workspace.getLeaf().openFile(file);
            }
          } catch {
          }
          this.close();
        }, MODAL_CLOSE_DELAY_MS);
        return;
      }
      lastErrors = result.errors.map((e) => `${e.code}: ${e.message}`);
      userMessage = this.buildRetryPrompt(this.prompt, this.domain, this.type, lastErrors);
    }
    const errorList = lastErrors.map((e) => `\u2022 ${e}`).join("\n");
    statusEl.setText(`\u274C Validation failed after ${LLM_MAX_RETRIES} attempts:
${errorList}`);
    statusEl.style.whiteSpace = "pre-line";
    btn.disabled = false;
    btn.setText("\u{1F504} Retry");
  }
  buildPrompt(prompt, domain, type) {
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    return [
      `Generate a knowledge file for: ${prompt}`,
      domain ? `Domain: ${domain}` : "",
      type ? `Type: ${type}` : "",
      `Today's date (use for created and updated): ${today}`
    ].filter(Boolean).join("\n");
  }
  buildRetryPrompt(prompt, domain, type, errors) {
    return this.buildPrompt(prompt, domain, type) + "\n\nThe previous attempt had these validation errors \u2014 please fix them:\n" + errors.join("\n");
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/ValidateModal.ts
var import_obsidian3 = require("obsidian");
init_Validator();
init_utils();
var ValidateModal = class extends import_obsidian3.Modal {
  constructor(app, plugin, path) {
    super(app);
    this.plugin = plugin;
    this.path = path;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Validate File" });
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
    const footerEl = contentEl.createDiv({
      attr: { style: "margin-top: 20px; display: flex; justify-content: flex-end;" }
    });
    new import_obsidian3.ButtonComponent(footerEl).setButtonText("Close").onClick(() => this.close());
    statusEl.setText("\u23F3 Validating...");
    this.runValidation(statusEl, resultsEl);
  }
  async runValidation(statusEl, resultsEl) {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.path);
      if (!(file instanceof import_obsidian3.TFile)) {
        statusEl.setText("\u274C File not found");
        statusEl.style.color = "var(--color-red)";
        return;
      }
      const content = await this.app.vault.read(file);
      const parsed = parseFrontmatter(content);
      if (!parsed) {
        statusEl.setText("\u274C No YAML frontmatter found");
        statusEl.style.color = "var(--color-red)";
        resultsEl.createEl("p", {
          text: "This file has no YAML frontmatter block (---). AKF files must start with a --- delimited YAML block.",
          attr: { style: "color: var(--text-muted);" }
        });
        return;
      }
      const allowedDomains = await loadAllowedDomains(this.app);
      const result = validate(parsed.frontmatter, parsed.body, allowedDomains);
      if (result.is_valid) {
        statusEl.setText("\u2705 File is valid!");
        statusEl.style.color = "var(--color-green)";
        resultsEl.createEl("p", {
          text: "No validation errors found. Your file follows the AKF schema.",
          attr: { style: "color: var(--color-green);" }
        });
      } else {
        statusEl.setText(`\u274C Found ${result.errors.length} error(s)`);
        statusEl.style.color = "var(--color-red)";
        for (const error of result.errors) {
          const item = resultsEl.createDiv({
            attr: {
              style: "padding: 10px 12px; margin: 6px 0; background: var(--background-secondary); border-radius: 6px; font-size: 13px; border-left: 3px solid var(--color-red);"
            }
          });
          item.createEl("strong", { text: error.code + " " });
          item.createEl("span", { text: this.describeError(error) });
        }
      }
      if (result.warnings.length > 0) {
        resultsEl.createEl("h4", {
          text: "Warnings:",
          attr: { style: "margin-top: 16px;" }
        });
        for (const warning of result.warnings) {
          const item = resultsEl.createDiv({
            attr: {
              style: "padding: 8px 10px; margin: 4px 0; background: var(--background-secondary); border-radius: 4px; font-size: 12px; color: var(--color-yellow);"
            }
          });
          item.createEl("span", { text: warning });
        }
      }
    } catch (err) {
      statusEl.setText(`\u274C Error: ${err.message}`);
      statusEl.style.color = "var(--color-red)";
    }
  }
  describeError(error) {
    const descriptions = {
      E001: "Invalid enum value (type, level, or status)",
      E002: "Required field missing",
      E003: "Date not in ISO 8601 format (YYYY-MM-DD)",
      E004: "Type mismatch (tags must be array, title must be string)",
      E005: "General schema violation",
      E006: "Domain not in taxonomy (add to akf.yaml)",
      E007: "created date is after updated date",
      E008: "Invalid relationship type in [[Note|type]] syntax"
    };
    const base = descriptions[error.code] || error.code;
    if (error.message && error.message !== base) {
      return `${base} \u2014 ${error.message}`;
    }
    return base;
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  model: "claude",
  defaultDomain: "",
  anthropicApiKey: "",
  openaiApiKey: "",
  geminiApiKey: "",
  groqApiKey: ""
};
var ObsidianAKFPlugin = class extends import_obsidian4.Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new AKFSettingsTab(this.app, this));
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
        } else {
          new import_obsidian4.Notice("No file is currently open.");
        }
      }
    });
    this.addCommand({
      id: "akf-validate-vault",
      name: "Validate entire vault",
      callback: async () => {
        const { validate: validate2 } = await Promise.resolve().then(() => (init_Validator(), Validator_exports));
        const { parseFrontmatter: parseFrontmatter2, loadAllowedDomains: loadAllowedDomains2 } = await Promise.resolve().then(() => (init_utils(), utils_exports));
        const notice = new import_obsidian4.Notice("\u23F3 Validating vault...", 0);
        const allowedDomains = await loadAllowedDomains2(this.app);
        const files = this.app.vault.getMarkdownFiles();
        let errorCount = 0;
        for (const file of files) {
          const content = await this.app.vault.read(file);
          const parsed = parseFrontmatter2(content);
          if (!parsed)
            continue;
          const result = validate2(parsed.frontmatter, parsed.body, allowedDomains);
          if (!result.is_valid)
            errorCount += result.errors.length;
        }
        notice.hide();
        if (errorCount === 0) {
          new import_obsidian4.Notice("\u2705 Vault is valid!");
        } else {
          new import_obsidian4.Notice(`\u274C Found ${errorCount} error(s) \u2014 open a file and use Ctrl+Shift+V for details`);
        }
      }
    });
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var AKFSettingsTab = class extends import_obsidian4.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "AI Knowledge Filler" });
    containerEl.createEl("p", {
      text: "AI-powered knowledge generation with schema validation",
      attr: { style: "color: var(--text-muted); margin-bottom: 20px;" }
    });
    containerEl.createEl("h3", { text: "API Key Status" });
    const { anthropicApiKey, openaiApiKey, geminiApiKey, groqApiKey } = this.plugin.settings;
    const statusEl = containerEl.createDiv({
      attr: {
        style: "padding: 12px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 20px;"
      }
    });
    const statusItems = [
      { label: "Claude (Anthropic)", key: anthropicApiKey },
      { label: "OpenAI (GPT-4)", key: openaiApiKey },
      { label: "Google (Gemini)", key: geminiApiKey },
      { label: "Groq", key: groqApiKey }
    ];
    for (const item of statusItems) {
      const configured = !!item.key;
      statusEl.createEl("p", {
        text: `${configured ? "\u2705" : "\u2B1C"} ${item.label}`,
        attr: {
          style: `margin: 4px 0; color: ${configured ? "var(--color-green)" : "var(--text-muted)"};`
        }
      });
    }
    containerEl.createEl("h3", { text: "Settings" });
    new import_obsidian4.Setting(containerEl).setName("Default model").setDesc("LLM provider to use for generation").addDropdown(
      (dropdown) => dropdown.addOptions({
        claude: "Claude (Anthropic)",
        gpt4: "GPT-4 (OpenAI)",
        gemini: "Gemini (Google)",
        groq: "Groq"
      }).setValue(this.plugin.settings.model).onChange(async (value) => {
        this.plugin.settings.model = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Default domain").setDesc("Domain for generated files (e.g., ai-system, devops, security)").addText(
      (text) => text.setValue(this.plugin.settings.defaultDomain).onChange(async (value) => {
        this.plugin.settings.defaultDomain = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "API Keys" });
    containerEl.createEl("p", {
      text: "At least one API key is required for generation.",
      attr: { style: "color: var(--text-muted); font-size: 0.9em; margin-bottom: 12px;" }
    });
    this.addApiKeySetting("Anthropic (Claude)", "sk-ant-...", "anthropicApiKey", "console.anthropic.com", "https://console.anthropic.com/settings/keys");
    this.addApiKeySetting("OpenAI (GPT-4)", "sk-...", "openaiApiKey", "platform.openai.com", "https://platform.openai.com/api-keys");
    this.addApiKeySetting("Google (Gemini)", "AIza...", "geminiApiKey", "aistudio.google.com", "https://aistudio.google.com/app/apikey");
    this.addApiKeySetting("Groq", "gsk_...", "groqApiKey", "console.groq.com", "https://console.groq.com/keys");
    containerEl.createEl("h3", { text: "Quick Help" });
    containerEl.createEl("p", {
      text: "Ctrl+Shift+G \u2014 Generate file\nCtrl+Shift+V \u2014 Validate current file",
      attr: { style: "color: var(--text-muted); font-size: 0.85em; white-space: pre-line;" }
    });
    containerEl.createEl("h3", { text: "Validation Error Codes" });
    const codes = [
      "E001 \u2014 Invalid enum (type, level, status)",
      "E002 \u2014 Required field missing",
      "E003 \u2014 Date not ISO 8601 format",
      "E004 \u2014 Type mismatch (tags must be array, title must be string)",
      "E005 \u2014 General schema violation",
      "E006 \u2014 Domain not in taxonomy",
      "E007 \u2014 created date is after updated date",
      "E008 \u2014 Invalid relationship type in [[Note|type]] syntax"
    ];
    for (const code of codes) {
      containerEl.createEl("p", {
        text: code,
        attr: { style: "font-size: 0.85em; margin: 3px 0; color: var(--text-muted);" }
      });
    }
  }
  addApiKeySetting(name, placeholder, key, linkText, linkHref) {
    const setting = new import_obsidian4.Setting(this.containerEl).setName(name);
    if (linkText && linkHref) {
      setting.setDesc(createFragment((f) => {
        f.appendText("Get key at ");
        f.createEl("a", { text: linkText, href: linkHref });
      }));
    }
    setting.addText(
      (text) => text.setPlaceholder(placeholder).setValue(this.plugin.settings[key] || "").onChange(async (value) => {
        this.plugin.settings[key] = value;
        await this.plugin.saveSettings();
        this.display();
      }).inputEl.setAttribute("type", "password")
    );
  }
};
//# sourceMappingURL=main.js.map
