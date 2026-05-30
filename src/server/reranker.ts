// @ts-ignore - @huggingface/transformers types vary by version
import { pipeline } from "@huggingface/transformers"

let rerankPipeline: any = null

export async function initReranker(): Promise<void> {
  try {
    const pipe = await pipeline("sentence-similarity", "Xenova/ms-marco-MiniLM-L-12-v2", {
      quantized: true,
    })
    rerankPipeline = pipe
    console.log("[reranker] loaded ms-marco-MiniLM-L-12-v2")
  } catch (err) {
    console.warn("[reranker] failed to load model, skipping rerank:", err)
  }
}

export interface SearchResult {
  title: string
  url: string
  content: string
  score: number
  engine?: string
}

export async function rerank(
  query: string,
  results: SearchResult[],
  topK = 10
): Promise<SearchResult[]> {
  if (!rerankPipeline || results.length === 0) return results

  try {
    const scores = await rerankPipeline(query, results.map((r) => r.title + ". " + r.content))
    const scored = results.map((r, i) => ({ ...r, score: scores[i] ?? 0 }))
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  } catch (err) {
    console.warn("[reranker] inference failed:", err)
    return results
  }
}
