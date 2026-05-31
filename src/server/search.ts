import { SearchResult } from "./reranker"

const SEARXNG_URL = process.env.SEARXNG_URL || "http://searxng:8080"
const PER_PAGE = 10

export async function searchWeb(
  query: string,
  maxResults = 10,
  timeRange?: string,
): Promise<SearchResult[]> {
  return searchPage(query, 1, maxResults, timeRange)
}

export async function searchPage(
  query: string,
  pageno: number,
  perPage = PER_PAGE,
  timeRange?: string,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    language: "en",
    categories: "general",
    pageno: String(pageno),
  })
  if (timeRange) params.set("time_range", timeRange)

  const url = `${SEARXNG_URL}/search?${params.toString()}`
  console.log(`[search] fetching ${url}`)

  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "X-Forwarded-For": "127.0.0.1" },
  })

  if (!res.ok) throw new Error(`SearXNG returned ${res.status}`)

  const data = await res.json()
  const rawResults = (data.results || []) as any[]

  return rawResults.slice(0, perPage).map((item: any) => ({
    title: item.title || "",
    url: item.url || "",
    content: item.content || item.snippet || "",
    score: typeof item.score === "number" ? item.score : 0.5,
    engine: item.engine || "searxng",
  }))
}

/** Fetch results from the first N searxng pages and flatten them. */
export async function fetchPages(
  query: string,
  pageCount: number,
  timeRange?: string,
): Promise<SearchResult[]> {
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      searchPage(query, i + 1, PER_PAGE, timeRange),
    ),
  )
  return pages.flat()
}
