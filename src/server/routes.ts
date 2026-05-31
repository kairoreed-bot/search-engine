import { Elysia, t, sse } from "elysia"
import { searchWeb } from "./search"
import { rerank, type SearchResult } from "./reranker"
import { streamAnswer } from "./llm"
import { getCached, setCache } from "./cache"

export const searchRouter = new Elysia({ prefix: "/api" })
  .post(
    "/search",
    async ({ body, set }) => {
      const { query, time_range, max_results } = body

      const cacheKey = `search:${query}:${time_range || ""}`
      const cached = await getCached(cacheKey)
      if (cached) {
        return JSON.parse(cached)
      }

      const rawResults = await searchWeb(query, max_results || 10, time_range || undefined)
      const reranked = await rerank(query, rawResults, max_results || 10)

      const response = {
        query,
        results: reranked,
        total: reranked.length,
      }

      await setCache(cacheKey, JSON.stringify(response), 600)
      return response
    },
    {
      body: t.Object({
        query: t.String({ minLength: 1 }),
        max_results: t.Optional(t.Number({ default: 10, minimum: 1, maximum: 50 })),
        time_range: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/search/stream",
    async function* ({ body, request }) {
      const { query, time_range, max_results } = body
      const signal = request.signal

      const rawResults = await searchWeb(query, max_results || 10, time_range || undefined)
      const reranked = await rerank(query, rawResults, max_results || 10)

      for (const r of reranked) {
        if (signal?.aborted) return
        yield sse({
          event: "result",
          data: JSON.stringify(r),
        })
      }

      yield* answerSSE(query, reranked, signal)
    },
    {
      body: t.Object({
        query: t.String({ minLength: 1 }),
        max_results: t.Optional(t.Number({ default: 10, minimum: 1, maximum: 50 })),
        time_range: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/search/stream/answer",
    async function* ({ body, request }) {
      const { query, results } = body
      const signal = request.signal

      if (results && results.length > 0) {
        yield* answerSSE(query, results, signal)
        return
      }

      // No results provided -- fetch and rerank them
      const rawResults = await searchWeb(query, 10)
      const reranked = await rerank(query, rawResults, 10)
      yield* answerSSE(query, reranked, signal)
    },
    {
      body: t.Object({
        query: t.String({ minLength: 1 }),
        results: t.Optional(
          t.Array(
            t.Object({
              title: t.String(),
              url: t.String(),
              content: t.String(),
              score: t.Number(),
              engine: t.Optional(t.String()),
            }),
          ),
        ),
      }),
    },
  )
  .get("/health", () => ({ status: "ok" }))

async function* answerSSE(
  query: string,
  results: SearchResult[],
  signal?: AbortSignal,
): AsyncGenerator<any, void, unknown> {
  const cacheKey = `answer:${query}`
  const cachedAnswer = await getCached(cacheKey)
  if (cachedAnswer) {
    yield sse({
      event: "answer_done",
      data: JSON.stringify({ text: cachedAnswer }),
    })
    yield sse({ event: "done", data: "{}" })
    return
  }

  let fullAnswer = ""
  try {
    for await (const chunk of streamAnswer(query, results, signal)) {
      fullAnswer += chunk
      yield sse({
        event: "answer_chunk",
        data: JSON.stringify({ text: chunk }),
      })
    }

    if (fullAnswer) {
      await setCache(cacheKey, fullAnswer, 3600)
    }

    yield sse({ event: "answer_done", data: "{}" })
  } catch (err: any) {
    if (err.name === "AbortError") return
    console.error("[sse] llm error:", err)
    yield sse({
      event: "answer_error",
      data: JSON.stringify({ error: err.message }),
    })
  }

  yield sse({ event: "done", data: "{}" })
}
