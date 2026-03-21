import { AKFSettings } from "./main";
import { LLM_TIMEOUT_MS } from "./constants";
import { VALID_TYPES, VALID_LEVELS, VALID_STATUSES, VALID_RELATIONSHIP_TYPES } from "./constants";

const SYSTEM_PROMPT = `You are an AI knowledge file generator for the AKF (AI Knowledge Filler) system.
Generate a complete markdown file with YAML frontmatter following this exact schema.

Required frontmatter fields:
- title: string (descriptive, human-readable title)
- type: one of: ${VALID_TYPES.join(", ")}
- domain: domain prefix (e.g., ai-system, devops, api-design, security)
- created: ISO 8601 date (YYYY-MM-DD)
- updated: ISO 8601 date (YYYY-MM-DD, must be >= created)

Optional frontmatter fields:
- level: one of: ${VALID_LEVELS.join(", ")}
- status: one of: ${VALID_STATUSES.join(", ")}
- tags: array of strings
- summary: brief one-sentence description

For relationships in the body, use the syntax: [[NoteTitle|relationship-type]]
Valid relationship types: ${VALID_RELATIONSHIP_TYPES.join(", ")}

Return ONLY the raw markdown file content starting with ---, no code fences, no preamble.`;

export class LLMClient {
  static async generate(userMessage: string, settings: AKFSettings): Promise<string> {
    const systemPrompt = SYSTEM_PROMPT + `

Generate all body content in: ${settings.language || "English"}. YAML frontmatter fields must remain in English.`;
    const { model, anthropicApiKey, openaiApiKey, geminiApiKey, groqApiKey } = settings;

    // Provider selection: use settings.model if its key is set, else first available
    if ((model === "claude" || model === "anthropic") && anthropicApiKey) {
      return LLMClient.callAnthropic(userMessage, anthropicApiKey, systemPrompt);
    }
    if ((model === "gpt4" || model === "openai") && openaiApiKey) {
      return LLMClient.callOpenAI(userMessage, openaiApiKey, systemPrompt);
    }
    if ((model === "gemini") && geminiApiKey) {
      return LLMClient.callGemini(userMessage, geminiApiKey, systemPrompt);
    }
    if ((model === "groq") && groqApiKey) {
      return LLMClient.callGroq(userMessage, groqApiKey, systemPrompt);
    }

    // Auto-detect: use first available key
    if (anthropicApiKey) return LLMClient.callAnthropic(userMessage, anthropicApiKey, systemPrompt);
    if (openaiApiKey) return LLMClient.callOpenAI(userMessage, openaiApiKey, systemPrompt);
    if (geminiApiKey) return LLMClient.callGemini(userMessage, geminiApiKey, systemPrompt);
    if (groqApiKey) return LLMClient.callGroq(userMessage, groqApiKey, systemPrompt);

    throw new Error(
      "No API key configured. Add an API key in Settings → AI Knowledge Filler."
    );
  }

  private static async callAnthropic(prompt: string, apiKey: string, systemPrompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${err}`);
      }
      const data = await response.json() as { content: Array<{ text: string }> };
      return data.content[0].text;
    } finally {
      clearTimeout(timer);
    }
  }

  private static async callOpenAI(prompt: string, apiKey: string, systemPrompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${err}`);
      }
      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      return data.choices[0].message.content;
    } finally {
      clearTimeout(timer);
    }
  }

  private static async callGemini(prompt: string, apiKey: string, systemPrompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: systemPrompt + "\n\n" + prompt }] },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${err}`);
      }
      const data = await response.json() as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      };
      return data.candidates[0].content.parts[0].text;
    } finally {
      clearTimeout(timer);
    }
  }

  private static async callGroq(prompt: string, apiKey: string, systemPrompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq API error ${response.status}: ${err}`);
      }
      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      return data.choices[0].message.content;
    } finally {
      clearTimeout(timer);
    }
  }
}
