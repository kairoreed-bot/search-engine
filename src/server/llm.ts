import { SearchResult } from "./reranker"

const LLM_ENABLED = process.env.LLM_ENABLED !== "false"
const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://localhost:11434/v1"
const LLM_API_KEY = process.env.LLM_API_KEY || "ollama"
const LLM_MODEL = process.env.LLM_MODEL || "qwen3.5:9b"
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || "32768", 10)
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || "0.1")

export async function* streamAnswer(
  query: string,
  results: SearchResult[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  if (!LLM_ENABLED) {
    yield "LLM answer generation is disabled."
    return
  }

  const context = results
    .slice(0, 20)
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 500)}`)
    .join("\n\n")

  const systemPrompt =
    "You are a helpful search assistant. Provide a thorough, detailed answer to the user's question based on the provided search results. Cite sources by number [1], [2], etc. If the results don't contain enough info, say so."

  const body = JSON.stringify({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Search results for: ${query}\n\n${context}\n\nQuestion: ${query}`,
      },
    ],
    max_tokens: LLM_MAX_TOKENS,
    temperature: LLM_TEMPERATURE,
    stream: true,
  })

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body,
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`LLM returned ${res.status}: ${text.slice(0, 200)}`)
  }

  const reader = res.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith("data: ")) continue
      const data = trimmed.slice(6)
      if (data === "[DONE]") return

      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content || ""
        if (content) yield content
      } catch {
        // skip
      }
    }
  }
}
