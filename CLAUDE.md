# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Build with source maps (development)
npm run build    # Type-check + production build
npm run lint     # TypeScript type-check only (no output)
```

There are no automated tests. `npm run lint` (alias: `tsc --noEmit`) is the primary correctness check.

## Architecture

This is an **Obsidian plugin** (TypeScript) that acts as a frontend for the Python-based `ai-knowledge-filler` (AKF) CLI/server. The plugin spawns the AKF server as a child process on port 8000, then communicates with it via HTTP REST.

### Data flow

```
User (Modal UI) → HttpClient → AKF server (:8000) → LLM provider → Validated .md file
```

### Key modules

- **`src/main.ts`** — Plugin entry point: registers commands (`Ctrl+Shift+G` generate, `Ctrl+Shift+V` validate), manages settings (API keys, model choice, paths), spawns/manages the AKF server subprocess, passes env vars to it.
- **`src/HttpClient.ts`** — REST client for the AKF server. Endpoints: `/v1/generate`, `/v1/validate`, `/v1/enrich`, `/v1/batch`, `/health`. Handles multi-provider model selection.
- **`src/EnvironmentChecker.ts`** — Detects Python, AKF CLI, and Ollama availability; can auto-install AKF via pip.
- **`src/SetupWizard.ts`** — Multi-step modal guiding users through missing dependencies.
- **`src/GenerateModal.ts`** / **`src/ValidateModal.ts`** — UI modals for the two primary user actions.
- **`src/StatusBar.ts`** — Clickable status bar indicator (🟢/🔴) for server state.

### Build

esbuild bundles to CommonJS targeting Node.js/Electron (Obsidian's runtime). External: `obsidian` and all Node builtins. Output is `main.js` + `main.css` at the repo root (required by Obsidian plugin spec).

### Settings

`AKFSettings` (defined in `main.ts`) stores: AKF CLI path, vault path, default LLM model (`ollama` | `claude` | `gpt4` | `gemini` | `groq`), API keys for each provider, Ollama model name, and auto-start flag. Persisted via Obsidian's `loadData`/`saveData`.

### Validation error codes

The AKF server enforces a schema with error codes E001–E008 (invalid enum, missing required field, bad date format, type mismatch, schema violation, unknown domain, created > updated date, invalid relationship type).
