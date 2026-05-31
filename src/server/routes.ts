import { Elysia, t, sse } from "elysia"
import { fetchPages, searchPage } from "./search"
import { rerank, type SearchResult } from "./reranker"
import { streamAnswer } from "./llm"
import { getCached, setCache, memGet, memSet } from "./cache"

const INITIAL_PAGES = 3
const PER_PAGE = 10

export const searchRouter = new Elysia({ prefix: "/api" })
  // --- Full search + results + AI answer (SSE) ---
  .post(
    "/search/stream",
    async function* ({ body, request }) {
      const { query, time_range } = body
      const signal = request.signal

      // In-memory cache check
      const memKey = `results:${query}`
      let results = memGet<SearchResult[]>(memKey)

      if (!results) {
        const allResults = await fetchPages(query, INITIAL_PAGES, time_range || undefined)
        results = await rerank(query, allResults, INITIAL_PAGES * PER_PAGE)
        memSet(memKey, results, 300_000) // 5 min
      }

      const batch1 = results.slice(0, PER_PAGE)
      for (const r of batch1) {
        if (signal?.aborted) return
        yield sse({ event: "result", data: JSON.stringify(r) })
      }

      // signal the total available
      yield sse({
        event: "meta",
        data: JSON.stringify({ total: results.length, pageSize: PER_PAGE }),
      })

      yield* answerSSE(query, results, signal)
    },
    {
      body: t.Object({
        query: t.String({ minLength: 1 }),
        time_range: t.Optional(t.String()),
      }),
    },
  )

  // --- Load more results (JSON) ---
  .post(
    "/search/more",
    async ({ body }) => {
      const { query, page, time_range } = body

      const memKey = `results:${query}`
      let results = memGet<SearchResult[]>(memKey)

      // If we have cached results and the page falls within them, serve from cache
      if (results && page * PER_PAGE <= results.length) {
        const batch = results.slice((page - 1) * PER_PAGE, page * PER_PAGE)
        return { results: batch, total: results.length }
      }

      // Fetch the next searxng page fresh
      const raw = await searchPage(query, page, PER_PAGE, time_range || undefined)
      const reranked = await rerank(query, raw, PER_PAGE)
      return { results: reranked, total: 0 }
    },
    {
      body: t.Object({
        query: t.String({ minLength: 1 }),
        page: t.Number({ minimum: 2 }),
        time_range: t.Optional(t.String()),
      }),
    },
  )

  // --- AI answer only (SSE) — uses in-memory cached results ---
  .post(
    "/search/stream/answer",
    async function* ({ body, request }) {
      const { query } = body
      const signal = request.signal

      // Check redis for cached answer first
      const cachedAnswer = await getCached(`answer:${query}`)
      if (cachedAnswer) {
        yield sse({ event: "answer_done", data: JSON.stringify({ text: cachedAnswer }) })
        yield sse({ event: "done", data: "{}" })
        return
      }

      // Check in-memory cache for results
      const memKey = `results:${query}`
      const results = memGet<SearchResult[]>(memKey)
      if (!results) {
        // No cached results — AI answer unavailable
        yield sse({ event: "answer_unavailable", data: "{}" })
        yield sse({ event: "done", data: "{}" })
        return
      }

      yield* answerSSE(query, results, signal)
    },
    {
      body: t.Object({ query: t.String({ minLength: 1 }) }),
    },
  )

  .post("/autocomplete", async ({ body }) => {
      const { q } = body
      if (!q || q.length < 2) return { query: q || "", suggestions: [] }

      try {
        const url = `${process.env.SEARXNG_URL || "http://searxng:8080"}/autocompleter?q=${encodeURIComponent(q)}`
        const res = await fetch(url, {
          signal: AbortSignal.timeout(5000),
          headers: { "X-Forwarded-For": "127.0.0.1" },
        })
        if (!res.ok) return { query: q, suggestions: [] }
        const data = await res.json()
        const suggestions: string[] = Array.isArray(data[1]) ? data[1] : []
        return { query: q, suggestions }
      } catch {
        return { query: q, suggestions: [] }
      }
    },
    {
      body: t.Object({ q: t.String() }),
    },
  )
  .get("/health", () => ({ status: "ok" }))

// --- shared answer stream helper ---

async function* answerSSE(
  query: string,
  results: SearchResult[],
  signal?: AbortSignal,
): AsyncGenerator<any, void, unknown> {
  const cacheKey = `answer:${query}`
  const cachedAnswer = await getCached(cacheKey)
  if (cachedAnswer) {
    yield sse({ event: "answer_done", data: JSON.stringify({ text: cachedAnswer }) })
    yield sse({ event: "done", data: "{}" })
    return
  }

  let fullAnswer = ""
  try {
    for await (const chunk of streamAnswer(query, results, signal)) {
      fullAnswer += chunk
      yield sse({ event: "answer_chunk", data: JSON.stringify({ text: chunk }) })
    }

    if (fullAnswer) await setCache(cacheKey, fullAnswer, 3600)
    yield sse({ event: "answer_done", data: "{}" })
  } catch (err: any) {
    if (err.name === "AbortError") return
    console.error("[sse] llm error:", err)
    yield sse({ event: "answer_error", data: JSON.stringify({ error: err.message }) })
  }

  yield sse({ event: "done", data: "{}" })
}
