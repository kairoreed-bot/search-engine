import { SearchResult } from "./reranker"

const SEARXNG_URL = process.env.SEARXNG_URL || "http://searxng:8080"

export async function searchWeb(
  query: string,
  maxResults = 10,
  timeRange?: string
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    language: "en",
    categories: "general",
  })
  if (timeRange) {
    params.set("time_range", timeRange)
  }

  const url = `${SEARXNG_URL}/search?${params.toString()}`
  console.log(`[search] fetching ${url}`)

  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) {
    throw new Error(`SearXNG returned ${res.status}`)
  }

  const data = await res.json()
  const rawResults = (data.results || []) as any[]

  return rawResults.slice(0, maxResults * 3).map((item: any) => ({
    title: item.title || "",
    url: item.url || "",
    content: item.content || item.snippet || "",
    score: typeof item.score === "number" ? item.score : 0.5,
    engine: item.engine || "searxng",
  }))
}
