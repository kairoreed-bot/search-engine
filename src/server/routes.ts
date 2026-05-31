import { Elysia, t } from "elysia"
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
      detail: {
        summary: "Search the web",
        tags: ["search"],
      },
    }
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
        yield {
          event: "result",
          data: JSON.stringify(r),
        }
      }

      const answerCacheKey = `answer:${query}`
      const cachedAnswer = await getCached(answerCacheKey)
      if (cachedAnswer) {
        yield {
          event: "answer_done",
          data: JSON.stringify({ text: cachedAnswer }),
        }
        yield { event: "done", data: JSON.stringify({}) }
        return
      }

      let fullAnswer = ""
      try {
        for await (const chunk of streamAnswer(query, reranked, signal)) {
          fullAnswer += chunk
          yield {
            event: "answer_chunk",
            data: JSON.stringify({ text: chunk }),
          }
        }

        if (fullAnswer) {
          await setCache(answerCacheKey, fullAnswer, 3600)
        }

        yield { event: "answer_done", data: "{}" }
      } catch (err: any) {
        if (err.name === "AbortError") return
        console.error("[sse] llm error:", err)
        yield {
          event: "answer_error",
          data: JSON.stringify({ error: err.message }),
        }
      }

      yield { event: "done", data: JSON.stringify({}) }
    },
    {
      body: t.Object({
        query: t.String({ minLength: 1 }),
        max_results: t.Optional(t.Number({ default: 10, minimum: 1, maximum: 50 })),
        time_range: t.Optional(t.String()),
      }),
      detail: {
        summary: "Search and stream results + AI answer",
        tags: ["search"],
      },
    }
  )
  .post(
    "/search/stream/answer",
    async function* ({ body, request }) {
      const { query } = body
      const signal = request.signal

      const answerCacheKey = `answer:${query}`
      const cachedAnswer = await getCached(answerCacheKey)
      if (cachedAnswer) {
        yield {
          event: "answer_done",
          data: JSON.stringify({ text: cachedAnswer }),
        }
        yield { event: "done", data: "{}" }
        return
      }

      let fullAnswer = ""
      try {
        for await (const chunk of streamAnswer(query, [], signal)) {
          fullAnswer += chunk
          yield {
            event: "answer_chunk",
            data: JSON.stringify({ text: chunk }),
          }
        }

        if (fullAnswer) {
          await setCache(answerCacheKey, fullAnswer, 3600)
        }

        yield { event: "answer_done", data: "{}" }
      } catch (err: any) {
        if (err.name === "AbortError") return
        console.error("[sse] llm answer error:", err)
        yield {
          event: "answer_error",
          data: JSON.stringify({ error: err.message }),
        }
      }

      yield { event: "done", data: "{}" }
    },
    {
      body: t.Object({
        query: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Stream AI answer only",
        tags: ["search"],
      },
    },
  )
  .get("/health", () => ({ status: "ok" }))
