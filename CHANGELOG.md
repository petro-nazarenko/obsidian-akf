# Changelog

## [0.2.0] - 2026-03-20

### Added
- Configurable server port in settings (default: 8000, change if port is already in use)
- Server watchdog: auto-restarts the AKF server on crash (max 3 times per 60 seconds)
- HTTP request timeouts: 60s for generate/validate, 10s for enrich/batch — UI no longer hangs indefinitely
- Retry logic for network errors: generate/validate auto-retry up to 3x on server errors (5xx) or connection drops
- Close button in Validate modal footer
- Vault-wide validation now shows a progress notice and result (was silently discarding the result)
- All magic numbers moved to `src/constants.ts`

### Fixed
- Server startup now uses polling (up to 8×1s checks) instead of a fixed 3-second delay
- Ollama start command is now platform-aware: `ollama serve &` on Linux/Mac, `start /B ollama serve` on Windows
- Health checks now use `fetch()` instead of `curl` (cross-platform, no shell dependency)
- File opening after generation fixed: was using broken `instanceof getFiles().constructor`, now uses `TFile` correctly
- `enrich()` and `batch()` now check `response.ok` before parsing JSON (was silently swallowing HTTP errors)
- Generate button is disabled until user enters a prompt
- Generate modal no longer blocks UI for 100ms on open; server starts asynchronously
- Vault path detection logs a warning when falling back to `'.'` instead of failing silently
- Removed dead code: `detectAKFPath()` and `detectPythonPath()` from `utils.ts` (were never called)

## [0.1.0] - 2026-03-01

- Initial release
- Generate knowledge files with AI (Claude, GPT-4, Gemini, Groq, Ollama)
- Validate files against AKF schema (error codes E001–E008)
- Settings UI with API key management
- Setup wizard for environment detection
- Status bar indicator for server state
