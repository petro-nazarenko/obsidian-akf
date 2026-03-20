import { App, Modal, Setting } from "obsidian";
import ObsidianAKFPlugin from "./main";

export class ValidateModal extends Modal {
  plugin: ObsidianAKFPlugin;
  path: string;
  isValidating: boolean = false;

  constructor(app: App, plugin: ObsidianAKFPlugin, path: string) {
    super(app);
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
      attr: { style: "color: var(--text-muted);" },
    });

    const statusEl = contentEl.createDiv({
      cls: "akf-validation-status",
      attr: { style: "margin: 20px 0; font-weight: bold;" },
    });

    const resultsEl = contentEl.createDiv({
      cls: "akf-validation-results",
      attr: { style: "max-height: 300px; overflow-y: auto;" },
    });

    statusEl.setText("Starting validation...");

    this.runValidation(statusEl, resultsEl);
  }

  async runValidation(statusEl: HTMLElement, resultsEl: HTMLElement) {
    this.isValidating = true;

    try {
      await this.plugin.startAKF();
      statusEl.setText("Validating...");

      const result = await this.plugin.subprocessManager.validate(this.path);

      if (result.is_valid) {
        statusEl.setText("✅ File is valid!");
        statusEl.style.color = "var(--color-green)";
        resultsEl.createEl("p", {
          text: "No validation errors found.",
          attr: { style: "color: var(--text-muted);" },
        });
      } else {
        statusEl.setText(`❌ Found ${result.errors.length} error(s)`);
        statusEl.style.color = "var(--color-red)";

        for (const error of result.errors) {
          const errorItem = resultsEl.createDiv({
            cls: "akf-validation-error",
            attr: {
              style:
                "padding: 10px; margin: 5px 0; background: var(--background-secondary); border-radius: 4px; font-family: monospace; font-size: 13px;",
            },
          });
          errorItem.createEl("span", { text: this.formatError(error) });
        }
      }
    } catch (err) {
      statusEl.setText(`❌ Error: ${(err as Error).message}`);
      statusEl.style.color = "var(--color-red)";
    } finally {
      this.isValidating = false;
    }
  }

  formatError(error: string): string {
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
}
