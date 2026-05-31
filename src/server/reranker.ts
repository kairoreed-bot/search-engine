import { pipeline, cos_sim } from "@huggingface/transformers"

let extractor: any = null

export async function initReranker(): Promise<void> {
  try {
    const pipe = await pipeline("feature-extraction", "Xenova/ms-marco-MiniLM-L-12-v2", {
      quantized: true,
    })
    extractor = pipe
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
  topK = 10,
): Promise<SearchResult[]> {
  if (!extractor || results.length === 0) return results

  try {
    const queryEmb = await extractor(query, { pooling: "mean", normalize: true })
    const docTexts = results.map((r) => `${r.title}. ${r.content}`)
    const docEmbs = await extractor(docTexts, { pooling: "mean", normalize: true })

    const scores: number[] = docEmbs.tolist().map((vec: number[]) =>
      cos_sim(queryEmb.tolist()[0], vec),
    )

    const scored = results.map((r, i) => ({ ...r, score: scores[i] ?? 0 }))
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  } catch (err) {
    console.warn("[reranker] inference failed:", err)
    return results
  }
}
