import { pipeline } from "@huggingface/transformers"

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

function meanPool(data: number[][][]): number[][] {
  return data.map((tokens) => {
    const dim = tokens[0].length
    const sum = new Array(dim).fill(0)
    for (let i = 0; i < tokens.length; i++) {
      for (let j = 0; j < dim; j++) sum[j] += tokens[i][j]
    }
    const len = tokens.length
    const pooled = sum.map((v) => v / len)

    let norm = 0
    for (let j = 0; j < dim; j++) norm += pooled[j] * pooled[j]
    norm = Math.sqrt(norm)
    if (norm > 0) {
      for (let j = 0; j < dim; j++) pooled[j] /= norm
    }
    return pooled
  })
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

export async function rerank(
  query: string,
  results: SearchResult[],
  topK = 10,
): Promise<SearchResult[]> {
  if (!extractor || results.length === 0) return results

  try {
    const docTexts = results.map((r) => `${r.title}. ${r.content}`)
    const allTexts = [query, ...docTexts]

    const output = await extractor(allTexts, { pooling: "none" })
    const raw: number[][][] = output.tolist()

    const pooled = meanPool(raw)
    const queryVec = pooled[0]
    const docVecs = pooled.slice(1)

    const scored = results.map((r, i) => ({
      ...r,
      score: dotProduct(queryVec, docVecs[i]),
    }))

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  } catch (err) {
    console.warn("[reranker] inference failed:", err)
    return results
  }
}
