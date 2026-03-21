import { App, ButtonComponent, Modal, TFile } from "obsidian";
import ObsidianAKFPlugin from "./main";
import { validate, ValidationError } from "./Validator";
import { parseFrontmatter, loadAllowedDomains } from "./utils";

export class ValidateModal extends Modal {
  plugin: ObsidianAKFPlugin;
  path: string;

  constructor(app: App, plugin: ObsidianAKFPlugin, path: string) {
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
      attr: { style: "color: var(--text-muted);" },
    });

    const statusEl = contentEl.createDiv({
      attr: { style: "margin: 20px 0; font-weight: bold;" },
    });

    const resultsEl = contentEl.createDiv({
      attr: { style: "max-height: 400px; overflow-y: auto;" },
    });

    const footerEl = contentEl.createDiv({
      attr: { style: "margin-top: 20px; display: flex; justify-content: flex-end;" },
    });

    new ButtonComponent(footerEl).setButtonText("Close").onClick(() => this.close());

    statusEl.setText("⏳ Validating...");
    this.runValidation(statusEl, resultsEl);
  }

  private async runValidation(statusEl: HTMLElement, resultsEl: HTMLElement) {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.path);
      if (!(file instanceof TFile)) {
        statusEl.setText("❌ File not found");
        statusEl.style.color = "var(--color-red)";
        return;
      }

      const content = await this.app.vault.read(file);
      const parsed = parseFrontmatter(content);

      if (!parsed) {
        statusEl.setText("❌ No YAML frontmatter found");
        statusEl.style.color = "var(--color-red)";
        resultsEl.createEl("p", {
          text: "This file has no YAML frontmatter block (---). AKF files must start with a --- delimited YAML block.",
          attr: { style: "color: var(--text-muted);" },
        });
        return;
      }

      const allowedDomains = await loadAllowedDomains(this.app);
      const result = validate(parsed.frontmatter, parsed.body, allowedDomains);

      if (result.is_valid) {
        statusEl.setText("✅ File is valid!");
        statusEl.style.color = "var(--color-green)";
        resultsEl.createEl("p", {
          text: "No validation errors found. Your file follows the AKF schema.",
          attr: { style: "color: var(--color-green);" },
        });
      } else {
        statusEl.setText(`❌ Found ${result.errors.length} error(s)`);
        statusEl.style.color = "var(--color-red)";

        for (const error of result.errors) {
          const item = resultsEl.createDiv({
            attr: {
              style:
                "padding: 10px 12px; margin: 6px 0; background: var(--background-secondary); border-radius: 6px; font-size: 13px; border-left: 3px solid var(--color-red);",
            },
          });
          item.createEl("strong", { text: error.code + " " });
          item.createEl("span", { text: this.describeError(error) });
        }
      }

      if (result.warnings.length > 0) {
        resultsEl.createEl("h4", {
          text: "Warnings:",
          attr: { style: "margin-top: 16px;" },
        });
        for (const warning of result.warnings) {
          const item = resultsEl.createDiv({
            attr: {
              style:
                "padding: 8px 10px; margin: 4px 0; background: var(--background-secondary); border-radius: 4px; font-size: 12px; color: var(--color-yellow);",
            },
          });
          item.createEl("span", { text: warning });
        }
      }
    } catch (err) {
      statusEl.setText(`❌ Error: ${(err as Error).message}`);
      statusEl.style.color = "var(--color-red)";
    }
  }

  private describeError(error: ValidationError): string {
    const descriptions: Record<string, string> = {
      E001: "Invalid enum value (type, level, or status)",
      E002: "Required field missing",
      E003: "Date not in ISO 8601 format (YYYY-MM-DD)",
      E004: "Type mismatch (tags must be array, title must be string)",
      E005: "General schema violation",
      E006: "Domain not in taxonomy (add to akf.yaml)",
      E007: "created date is after updated date",
      E008: "Invalid relationship type in [[Note|type]] syntax",
    };
    const base = descriptions[error.code] || error.code;
    // Append the specific detail from the message
    if (error.message && error.message !== base) {
      return `${base} — ${error.message}`;
    }
    return base;
  }

  onClose() {
    this.contentEl.empty();
  }
}
