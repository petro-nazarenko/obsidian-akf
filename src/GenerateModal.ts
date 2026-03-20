import { App, Modal, Setting } from "obsidian";
import ObsidianAKFPlugin from "./main";

export interface GenerateResponse {
  success: boolean;
  file_path: string | null;
  attempts: number;
  errors: string[];
}

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
    contentEl.createEl("h2", { text: "AI Knowledge Filler - Generate" });

    new Setting(contentEl)
      .setName("Prompt")
      .setDesc("Describe what knowledge file you want to generate")
      .addTextArea((text) =>
        text
          .setPlaceholder("Write a guide on Docker networking...")
          .setValue(this.prompt)
          .onChange((value) => {
            this.prompt = value;
          })
          .inputEl.setAttr("rows", 4)
      );

    new Setting(contentEl)
      .setName("Domain (optional)")
      .setDesc("Taxonomy domain: ai-system, api-design, devops, security, system-design...")
      .addText((text) =>
        text
          .setValue(this.domain)
          .onChange((value) => {
            this.domain = value;
          })
      );

    new Setting(contentEl)
      .setName("Type (optional)")
      .setDesc("File type: concept, guide, reference, checklist, project, roadmap...")
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
      cls: "akf-modal-buttons",
      attr: { style: "display: flex; gap: 10px; margin-top: 20px;" },
    });

    const statusEl = contentEl.createDiv({
      cls: "akf-status",
      attr: { style: "margin-top: 15px; font-style: italic;" },
    });

    const generateBtn = buttonContainer.createEl("button", {
      text: "Generate",
      cls: "mod-cta",
    });

    const cancelBtn = buttonContainer.createEl("button", {
      text: "Cancel",
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
          this.domain || undefined,
          this.type || undefined
        );

        if (result.success && result.file_path) {
          statusEl.setText(`✅ Success! File: ${result.file_path}`);
          
          setTimeout(async () => {
            await this.plugin.app.workspace.getLeaf().openFile(
              await this.plugin.app.vault.getAbstractFileByPath(
                result.file_path!
              ) as any
            );
            this.close();
          }, 1500);
        } else {
          const errorMsg = result.errors.length > 0
            ? result.errors.join(", ")
            : "Generation failed";
          statusEl.setText(`❌ Error: ${errorMsg}`);
          this.isGenerating = false;
          generateBtn.removeAttribute("disabled");
          generateBtn.setText("Retry");
        }
      } catch (err) {
        statusEl.setText(`❌ Error: ${(err as Error).message}`);
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
}
