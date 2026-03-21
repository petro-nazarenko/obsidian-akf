import { App, parseYaml, TFile } from "obsidian";
import { DEFAULT_DOMAINS } from "./constants";

export function parseFrontmatter(
  content: string
): { frontmatter: Record<string, unknown>; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) return null;
  try {
    const parsed = parseYaml(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      frontmatter: parsed as Record<string, unknown>,
      body: match[2],
    };
  } catch {
    return null;
  }
}

export async function writeNoteToVault(
  app: App,
  filePath: string,
  content: string
): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(filePath);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
  } else {
    const parts = filePath.split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join("/");
      try {
        await app.vault.createFolder(dir);
      } catch {
        // folder likely already exists
      }
    }
    await app.vault.create(filePath, content);
  }
}

export async function loadAllowedDomains(app: App): Promise<string[]> {
  try {
    const configFile = app.vault.getAbstractFileByPath("akf.yaml");
    if (configFile instanceof TFile) {
      const content = await app.vault.read(configFile);
      const parsed = parseYaml(content) as { domains?: unknown } | null;
      if (parsed?.domains && Array.isArray(parsed.domains)) {
        return parsed.domains as string[];
      }
    }
  } catch {
    // fall through to defaults
  }
  return DEFAULT_DOMAINS;
}

export function sanitizeFilename(title: string): string {
  return title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
