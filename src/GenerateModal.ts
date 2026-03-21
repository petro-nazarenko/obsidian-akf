import { App, Modal, Setting, TFile } from "obsidian";
import ObsidianAKFPlugin from "./main";
import { LLMClient } from "./LLMClient";
import { validate } from "./Validator";
import { parseFrontmatter, writeNoteToVault, loadAllowedDomains, sanitizeFilename } from "./utils";
import { MODAL_CLOSE_DELAY_MS, LLM_MAX_RETRIES } from "./constants";

export class GenerateModal extends Modal {
  plugin: ObsidianAKFPlugin;
  private prompt = "";
  private domain = "";
  private type = "";
  private attempt = 0;

  constructor(app: App, plugin: ObsidianAKFPlugin) {
    super(app);
    this.plugin = plugin;
    this.domain = plugin.settings.defaultDomain || "";
  }

  onOpen() {
    this.renderForm();
  }

  private renderForm() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Generate Knowledge File" });

    let promptInput: HTMLTextAreaElement;

    new Setting(contentEl)
      .setName("What do you want to create?")
      .setDesc("Describe the knowledge file you need")
      .addTextArea((text) => {
        text
          .setPlaceholder(
            "Write a guide on Docker networking, or explain microservices architecture..."
          )
          .setValue(this.prompt)
          .onChange((v) => (this.prompt = v));
        text.inputEl.rows = 4;
        text.inputEl.style.width = "100%";
        promptInput = text.inputEl;
      });

    new Setting(contentEl)
      .setName("Domain (optional)")
      .setDesc("e.g., ai-system, api-design, devops, security")
      .addText((text) =>
        text.setValue(this.domain).onChange((v) => (this.domain = v))
      );

    new Setting(contentEl)
      .setName("Type (optional)")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "": "Auto-detect",
            concept: "Concept",
            guide: "Guide",
            reference: "Reference",
            checklist: "Checklist",
            project: "Project",
            roadmap: "Roadmap",
            template: "Template",
            audit: "Audit",
          })
          .setValue(this.type)
          .onChange((v) => (this.type = v))
      );

    const buttonRow = contentEl.createDiv({
      attr: { style: "display: flex; gap: 10px; margin-top: 20px;" },
    });

    const statusEl = contentEl.createDiv({
      attr: {
        style:
          "margin-top: 12px; padding: 10px; background: var(--background-secondary); border-radius: 4px; font-size: 0.9em; min-height: 32px;",
      },
    });

    const generateBtn = buttonRow.createEl("button", {
      text: "✨ Generate",
      cls: "mod-cta",
    });
    generateBtn.disabled = true;

    buttonRow.createEl("button", { text: "Cancel" }).onclick = () => this.close();

    // Enable button once prompt is non-empty
    setTimeout(() => {
      promptInput?.addEventListener("input", () => {
        generateBtn.disabled = !promptInput.value.trim();
      });
    }, 0);

    generateBtn.onclick = () => this.runGenerate(generateBtn, statusEl);
  }

  private async runGenerate(btn: HTMLButtonElement, statusEl: HTMLElement) {
    if (!this.prompt.trim()) {
      statusEl.setText("Please enter a prompt.");
      return;
    }

    const allowedDomains = await loadAllowedDomains(this.app);

    let userMessage = this.buildPrompt(this.prompt, this.domain, this.type);
    let lastErrors: string[] = [];

    btn.disabled = true;

    for (this.attempt = 1; this.attempt <= LLM_MAX_RETRIES; this.attempt++) {
      statusEl.setText(`⏳ Generating... (attempt ${this.attempt}/${LLM_MAX_RETRIES})`);

      let markdown: string;
      try {
        markdown = await LLMClient.generate(userMessage, this.plugin.settings);
      } catch (err) {
        statusEl.setText(`❌ ${(err as Error).message}`);
        btn.disabled = false;
        btn.setText("🔄 Retry");
        return;
      }

      const parsed = parseFrontmatter(markdown);
      if (!parsed) {
        lastErrors = ["Response did not contain valid YAML frontmatter."];
        userMessage = this.buildRetryPrompt(this.prompt, this.domain, this.type, lastErrors);
        continue;
      }

      const result = validate(parsed.frontmatter, parsed.body, allowedDomains);

      const title =
        typeof parsed.frontmatter.title === "string"
          ? parsed.frontmatter.title
          : "untitled";
      const filename = sanitizeFilename(title) + ".md";

      if (!this.plugin.settings.enableValidation || result.is_valid) {
        try {
          await writeNoteToVault(this.app, filename, markdown);
        } catch (err) {
          statusEl.setText(`❌ Could not write file: ${(err as Error).message}`);
          btn.disabled = false;
          btn.setText("🔄 Retry");
          return;
        }
        statusEl.setText(`✅ Created: ${filename}`);
        setTimeout(async () => {
          try {
            const file = this.app.vault.getAbstractFileByPath(filename);
            if (file instanceof TFile) {
              await this.app.workspace.getLeaf().openFile(file);
            }
          } catch {
            // best-effort open
          }
          this.close();
        }, MODAL_CLOSE_DELAY_MS);
        return;
      }

      // Validation on and failed — feed errors back to LLM for next attempt
      lastErrors = result.errors.map((e) => `${e.code}: ${e.message}`);
      userMessage = this.buildRetryPrompt(this.prompt, this.domain, this.type, lastErrors);
    }

    // All attempts exhausted
    const errorList = lastErrors.map((e) => `• ${e}`).join("\n");
    statusEl.setText(`❌ Validation failed after ${LLM_MAX_RETRIES} attempts:\n${errorList}`);
    statusEl.style.whiteSpace = "pre-line";
    btn.disabled = false;
    btn.setText("🔄 Retry");
  }

  private buildPrompt(prompt: string, domain: string, type: string): string {
    const today = new Date().toISOString().slice(0, 10);
    return [
      `Generate a knowledge file for: ${prompt}`,
      domain ? `Domain: ${domain}` : "",
      type ? `Type: ${type}` : "",
      `Today's date (use for created and updated): ${today}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private buildRetryPrompt(
    prompt: string,
    domain: string,
    type: string,
    errors: string[]
  ): string {
    return (
      this.buildPrompt(prompt, domain, type) +
      "\n\nThe previous attempt had these validation errors — please fix them:\n" +
      errors.join("\n")
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
