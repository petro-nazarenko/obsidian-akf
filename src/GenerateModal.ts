import { App, Modal, Setting, TFile } from "obsidian";
import ObsidianAKFPlugin from "./main";
import { MODAL_CLOSE_DELAY_MS } from "./constants";

export class GenerateModal extends Modal {
  plugin: ObsidianAKFPlugin;
  prompt: string = "";
  domain: string = "";
  type: string = "";
  isGenerating: boolean = false;

  constructor(app: App, plugin: ObsidianAKFPlugin) {
    super(app);
    this.plugin = plugin;
    this.domain = plugin.settings.defaultDomain || "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "🤖 Generate Knowledge File" });

    if (!this.plugin.isServerRunning) {
      contentEl.createEl("p", {
        text: "Server is starting...",
        attr: { style: "color: var(--text-muted);" }
      });
      this.plugin.initializeServer();
    }

    this.renderForm(contentEl);
  }

  private renderForm(contentEl: HTMLElement) {
    contentEl.empty();
    contentEl.createEl("h2", { text: "🤖 Generate Knowledge File" });

    let promptInput: HTMLTextAreaElement;

    new Setting(contentEl)
      .setName("What do you want to create?")
      .setDesc("Describe the knowledge file you need")
      .addTextArea((text) => {
        text.setPlaceholder("Write a guide on Docker networking, or explain microservices architecture...");
        text.setValue(this.prompt);
        text.onChange((value) => {
          this.prompt = value;
        });
        text.inputEl.setAttr("rows", 4);
        text.inputEl.setAttr("style", "width: 100%;");
        promptInput = text.inputEl;
      });

    new Setting(contentEl)
      .setName("Domain (optional)")
      .setDesc("e.g., ai-system, api-design, devops, security")
      .addText((text) =>
        text
          .setValue(this.domain)
          .onChange((value) => {
            this.domain = value;
          })
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
          .onChange((value) => {
            this.type = value;
          })
      );

    const buttonContainer = contentEl.createDiv({
      attr: { style: "display: flex; gap: 10px; margin-top: 20px;" },
    });

    const statusEl = contentEl.createDiv({
      attr: { style: "margin-top: 15px; padding: 10px; background: var(--background-secondary); border-radius: 4px;" },
    });

    const generateBtn = buttonContainer.createEl("button", {
      text: "✨ Generate",
      cls: "mod-cta",
    });

    // Disable until user enters a prompt
    generateBtn.setAttribute("disabled", "true");

    const cancelBtn = buttonContainer.createEl("button", {
      text: "Cancel",
    });

    // Enable/disable generate button based on prompt content
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
        statusEl.setText("⚠️ Please enter a prompt");
        return;
      }

      this.isGenerating = true;
      generateBtn.setAttribute("disabled", "true");
      generateBtn.setText("⏳ Generating...");
      statusEl.setText("🚀 Sending request to AI...");

      try {
        const result = await this.plugin.httpClient.generate(
          this.prompt,
          this.domain || undefined,
          this.type || undefined
        );

        if (result.success && result.file_path) {
          statusEl.setText(`✅ Success! Created: ${result.file_path}`);

          setTimeout(async () => {
            try {
              const file = this.plugin.app.vault.getAbstractFileByPath(result.file_path!);
              if (file instanceof TFile) {
                await this.plugin.app.workspace.getLeaf().openFile(file);
              }
            } catch {
              console.log("[AKF] Could not open file:", result.file_path);
            }
            this.close();
          }, MODAL_CLOSE_DELAY_MS);
        } else {
          const errorMsg = result.errors.length > 0
            ? result.errors.slice(0, 3).join("\n")
            : "Generation failed";
          statusEl.setText(`❌ Error:\n${errorMsg}`);
          this.isGenerating = false;
          generateBtn.removeAttribute("disabled");
          generateBtn.setText("🔄 Retry");
        }
      } catch (err) {
        statusEl.setText(`❌ Error: ${(err as Error).message}`);
        this.isGenerating = false;
        generateBtn.removeAttribute("disabled");
        generateBtn.setText("🔄 Retry");
      }
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
