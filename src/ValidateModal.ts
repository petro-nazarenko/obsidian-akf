import { App, Modal } from "obsidian";
import ObsidianAKFPlugin from "./main";

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
    contentEl.createEl("h2", { text: "✅ Validate File" });

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

    statusEl.setText("⏳ Validating...");

    this.runValidation(statusEl, resultsEl);
  }

  async runValidation(statusEl: HTMLElement, resultsEl: HTMLElement) {
    try {
      const result = await this.plugin.httpClient.validate(this.path);

      if (result.is_valid) {
        statusEl.setText("✅ File is valid!");
        statusEl.style.color = "var(--color-green)";
        resultsEl.createEl("p", {
          text: "No validation errors found. Your file follows the AKF schema perfectly!",
          attr: { style: "color: var(--color-green);" },
        });
      } else {
        statusEl.setText(`❌ Found ${result.errors.length} error(s)`);
        statusEl.style.color = "var(--color-red)";

        for (const error of result.errors) {
          const errorItem = resultsEl.createDiv({
            attr: {
              style:
                "padding: 12px; margin: 8px 0; background: var(--background-secondary); border-radius: 6px; font-family: monospace; font-size: 13px; border-left: 3px solid var(--color-red);",
            },
          });
          errorItem.createEl("span", { text: this.formatError(error) });
        }

        if (result.warnings && result.warnings.length > 0) {
          resultsEl.createEl("h4", { text: "⚠️ Warnings:" });
          for (const warning of result.warnings) {
            const warnItem = resultsEl.createDiv({
              attr: {
                style:
                  "padding: 8px; margin: 5px 0; background: var(--background-secondary); border-radius: 4px; font-size: 12px; color: var(--color-yellow);",
              },
            });
            warnItem.createEl("span", { text: warning });
          }
        }
      }
    } catch (err) {
      statusEl.setText(`❌ Error: ${(err as Error).message}`);
      statusEl.style.color = "var(--color-red)";
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
}
