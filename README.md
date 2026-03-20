# AI Knowledge Filler for Obsidian

![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-blue)
![Version](https://img.shields.io/badge/version-0.1.0-yellow)
![License](https://img.shields.io/badge/license-MIT-green)

**AI-powered structured knowledge generation with schema validation directly in Obsidian.**

Generate validated Markdown knowledge files using AI (Claude, GPT-4, Gemini, Groq, Ollama) with automatic E001-E008 schema enforcement.

## Features

- **Generate** - Create new knowledge files from AI with guaranteed schema compliance
- **Validate** - Check existing files for frontmatter errors
- **Schema Enforcement** - Automatic validation of YAML frontmatter fields
- **Multi-Provider** - Works with Claude, GPT-4, Gemini, Groq, Ollama
- **External Taxonomy** - Configure domains and types via akf.yaml

## Validation Error Codes

| Code | Description |
|------|-------------|
| E001 | Invalid enum value (type, level, status) |
| E002 | Required field missing |
| E003 | Date not ISO 8601 format |
| E004 | Type mismatch (e.g., tags should be array) |
| E005 | General schema violation |
| E006 | Domain not in taxonomy |
| E007 | created > updated date |
| E008 | Invalid relationship type |

## Installation

### Option 1: BRAT (Recommended for beta)

1. Install **Obsidian42 - BRAT** from Community Plugins
2. Open BRAT settings → Add Beta Plugin
3. Enter: `petro-nazarenko/obsidian-akf`
4. Enable the plugin in Community Plugins settings

### Option 2: Manual

1. Clone this repo
2. Run `npm install`
3. Run `npm run build`
4. Copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/obsidian-akf/`
5. Enable the plugin in Obsidian

## Requirements

- [AI Knowledge Filler](https://github.com/petro-nazarenko/ai-knowledge-filler) installed (`pip install ai-knowledge-filler`)
- Python 3.10+
- API key for at least one LLM provider (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)

## Usage

### Commands

| Command | Hotkey | Description |
|---------|--------|-------------|
| Generate knowledge file | `Ctrl+Shift+G` | Open generation modal |
| Validate current file | `Ctrl+Shift+V` | Validate active file |
| Validate entire vault | - | Validate all .md files |

### Settings

- **AKF executable path** - Path to `akf` command (default: `akf`)
- **Vault path** - Path to your Obsidian vault
- **Default model** - LLM provider to use
- **Default domain** - Default domain for generated files
- **Auto-start** - Start AKF server on Obsidian launch

### Generate a Knowledge File

1. Press `Ctrl+Shift+G` or run "Generate knowledge file" command
2. Enter a prompt describing the file you want to create
3. Optionally specify domain and type
4. Click "Generate"
5. File is created and opened in your vault

### Validate Files

1. Open any Markdown file
2. Press `Ctrl+Shift+V` or run "Validate current file"
3. View validation results with E001-E008 error codes

## How It Works

```
User Prompt → AKF CLI → LLM → Validation Engine → Error Normalizer → Retry Controller → Valid File
                    ↑                                                    |
                    └──────── (if invalid, retry up to 3x) ──────────────┘
```

The AKF pipeline guarantees that only schema-valid files reach your vault.

## Related

- [AI Knowledge Filler](https://github.com/petro-nazarenko/ai-knowledge-filler) - Python CLI and library
- [AKF Documentation](https://github.com/petro-nazarenko/ai-knowledge-filler/wiki) - Full documentation

## License

MIT - see [LICENSE](LICENSE)
