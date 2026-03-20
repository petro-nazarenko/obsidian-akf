import ObsidianAKFPlugin from "./main";

export class AKFStatusBar {
  private plugin: ObsidianAKFPlugin;
  private statusBarItem: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(plugin: ObsidianAKFPlugin) {
    this.plugin = plugin;
  }

  register() {
    this.statusBarItem = this.plugin.addStatusBarItem();
    this.statusBarItem.setAttribute("id", "akf-status-bar");
    
    this.statusEl = this.statusBarItem.createEl("span", {
      cls: "akf-status-bar-item",
      text: "🤖 AKF",
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

  setRunning(running: boolean) {
    if (this.statusEl) {
      this.statusEl.textContent = running ? "✅ AKF" : "🔴 AKF";
      this.statusEl.title = running 
        ? "AKF Server Running - Click to stop"
        : "AKF Server Stopped - Click to start";
    }
  }

  setStatus(status: string) {
    if (this.statusEl) {
      this.statusEl.textContent = status;
      this.statusEl.title = status;
    }
  }

  private updateDisplay() {
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
}
