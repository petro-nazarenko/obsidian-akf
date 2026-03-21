import { AKFSettings } from "./main";
import { LLM_TIMEOUT_MS } from "./constants";

const SYSTEM_PROMPT = `You are a Markdown knowledge file generator.
Output ONLY a raw markdown file. No explanations. No code fences. No preamble.
The file MUST start with --- on the very first line.

REQUIRED fields (ALL mandatory):
- title: string
- type: exactly one of: concept, guide, reference, checklist, project, roadmap, template, audit
- domain: exactly one of: ai-system, api-design, system-design, devops, security, data-engineering, prompt-engineering, backend-engineering, frontend-engineering, machine-learning, knowledge-management, documentation, operations, business-strategy, project-management, consulting, workflow-automation, marketing, sales, finance
- level: exactly one of: beginner, intermediate, advanced
- status: exactly one of: draft, active, completed, archived
- tags: YAML array with 3-10 items like [tag1, tag2, tag3]
- created: today's date YYYY-MM-DD
- updated: same as created

Output ONLY raw markdown starting with --- on line 1. Nothing before it.`;

export class LLMClient {
  static async generate(userMessage: string, settings: AKFSettings): Promise<string> {
    const { model, anthropicApiKey, openaiApiKey, geminiApiKey, groqApiKey } = settings;

    // Provider selection: use settings.model if its key is set, else first available
    if ((model === "claude" || model === "anthropic") && anthropicApiKey) {
      return LLMClient.callAnthropic(userMessage, anthropicApiKey);
    }
    if ((model === "gpt4" || model === "openai") && openaiApiKey) {
      return LLMClient.callOpenAI(userMessage, openaiApiKey);
    }
    if ((model === "gemini") && geminiApiKey) {
      return LLMClient.callGemini(userMessage, geminiApiKey);
    }
    if ((model === "groq") && groqApiKey) {
      return LLMClient.callGroq(userMessage, groqApiKey);
    }

    // Auto-detect: use first available key
    if (anthropicApiKey) return LLMClient.callAnthropic(userMessage, anthropicApiKey);
    if (openaiApiKey) return LLMClient.callOpenAI(userMessage, openaiApiKey);
    if (geminiApiKey) return LLMClient.callGemini(userMessage, geminiApiKey);
    if (groqApiKey) return LLMClient.callGroq(userMessage, groqApiKey);

    throw new Error(
      "No API key configured. Add an API key in Settings → AI Knowledge Filler."
    );
  }

  private static async callAnthropic(prompt: string, apiKey: string): Promise<string> {
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
          system: SYSTEM_PROMPT,
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

  private static async callOpenAI(prompt: string, apiKey: string): Promise<string> {
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
            { role: "system", content: SYSTEM_PROMPT },
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

  private static async callGemini(prompt: string, apiKey: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: SYSTEM_PROMPT + "\n\n" + prompt }] },
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

  private static async callGroq(prompt: string, apiKey: string): Promise<string> {
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
            { role: "system", content: SYSTEM_PROMPT },
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
