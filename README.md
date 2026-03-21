# AI Knowledge Filler for Obsidian

[![Version](https://img.shields.io/badge/version-0.5.3-yellow)](https://github.com/petro-nazarenko/obsidian-akf/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Generate and validate schema-compliant Markdown knowledge files directly in Obsidian — works on **desktop and mobile**, no Python or server required.

## How it works

```
Your prompt → LLM API → Validation (E001–E008) → Retry if invalid → File written to vault
```

Only schema-valid files reach your vault. If the LLM output fails validation, the plugin automatically retries up to 3 times with error feedback.

## Installation

### Via BRAT (recommended)

1. Install **Obsidian42 - BRAT** from Community Plugins
2. Open BRAT settings → **Add Beta Plugin**
3. Enter: `petro-nazarenko/obsidian-akf`
4. Enable the plugin in Community Plugins

### Manual

1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/petro-nazarenko/obsidian-akf/releases)
2. Copy to `.obsidian/plugins/obsidian-akf/` in your vault
3. Enable the plugin in Obsidian

## Setup

### 1. Get an API key

You need at least one API key. Groq is free and fast — recommended for getting started:

| Provider | Free tier | Get key |
|----------|-----------|---------|
| **Groq** | ✅ Yes | [console.groq.com/keys](https://console.groq.com/keys) |
| **Claude** | No | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| **OpenAI** | No | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Gemini** | ✅ Yes | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |

### 2. Configure the plugin

Open **Settings → AI Knowledge Filler**:

- Select your preferred model
- Paste your API key
- Optionally set a default domain

## Usage

| Command | Hotkey | Description |
|---------|--------|-------------|
| Generate knowledge file | `Ctrl+Shift+G` | Generate a new validated file |
| Validate current file | `Ctrl+Shift+V` | Check active file for schema errors |
| Validate entire vault | — | Check all `.md` files |

## Validation error codes

| Code | Description |
|------|-------------|
| E001 | Invalid enum value (`type`, `level`, `status`) |
| E002 | Required field missing |
| E003 | Date not ISO 8601 format (`YYYY-MM-DD`) |
| E004 | Type mismatch (e.g. `tags` must be array) |
| E005 | General schema violation |
| E006 | Domain not in taxonomy |
| E007 | `created` date is after `updated` |
| E008 | Invalid relationship type in `[[Note\|type]]` syntax |

## Custom taxonomy

Create `akf.yaml` in your vault root to define allowed domains:

```yaml
schema_version: "1.0.0"
enums:
  domain:
    - ai-system
    - api-design
    - devops
    - security
    - your-custom-domain
```

If no `akf.yaml` is present, the plugin uses the default taxonomy.

## Requirements

- Obsidian 1.0.0+
- API key for at least one LLM provider
- No Python, no server, no extra dependencies

## Related

- [ai-knowledge-filler](https://github.com/petro-nazarenko/ai-knowledge-filler) — Python CLI and REST API for the same pipeline

## License

MIT
