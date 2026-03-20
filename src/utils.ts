import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function detectAKFPath(): Promise<string> {
  const commands = [
    { cmd: "where akf", shell: "cmd" },
    { cmd: "which akf", shell: "bash" },
    { cmd: "command -v akf", shell: "bash" },
  ];

  for (const { cmd, shell } of commands) {
    try {
      const { stdout } = await execAsync(cmd, { shell });
      const path = stdout.trim().split("\n")[0];
      if (path) {
        return path;
      }
    } catch {
    }
  }

  return "akf";
}

export async function detectPythonPath(): Promise<string> {
  const commands = [
    { cmd: "where python", shell: "cmd" },
    { cmd: "which python3", shell: "bash" },
    { cmd: "which python", shell: "bash" },
  ];

  for (const { cmd, shell } of commands) {
    try {
      const { stdout } = await execAsync(cmd, { shell });
      const path = stdout.trim().split("\n")[0];
      if (path) {
        return path;
      }
    } catch {
    }
  }

  return "python";
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
