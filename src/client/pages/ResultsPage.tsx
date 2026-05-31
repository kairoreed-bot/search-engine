import { useEffect, useRef, useReducer, useCallback } from "react"
import { useSearchParams, Link } from "react-router-dom"

interface SearchResult {
  title: string
  url: string
  content: string
  score: number
  engine?: string
}

declare global {
  interface Window {
    __INITIAL_DATA__?: { query: string; results: SearchResult[] }
  }
}

type State = {
  results: SearchResult[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  total: number
  nextPage: number
  answer: string
  answerDone: boolean
  answerError: boolean
  answerUnavailable: boolean
  cancelled: boolean
  answerExpanded: boolean
}

type Action =
  | { type: "SET_RESULTS"; results: SearchResult[]; total: number }
  | { type: "APPEND_MORE"; results: SearchResult[]; total: number }
  | { type: "APPEND_RESULT"; result: SearchResult }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_LOADING_MORE"; loadingMore: boolean }
  | { type: "SET_ERROR"; error: string }
  | { type: "APPEND_ANSWER"; text: string }
  | { type: "SET_ANSWER_DONE"; text?: string }
  | { type: "SET_ANSWER_ERROR" }
  | { type: "SET_ANSWER_UNAVAILABLE" }
  | { type: "SET_CANCELLED" }
  | { type: "TOGGLE_ANSWER" }
  | { type: "RESET" }

const initialState: State = {
  results: [],
  loading: true,
  loadingMore: false,
  error: null,
  total: 0,
  nextPage: 2,
  answer: "",
  answerDone: false,
  answerError: false,
  answerUnavailable: false,
  cancelled: false,
  answerExpanded: false,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_RESULTS":
      return { ...state, results: action.results, total: action.total, loading: false }
    case "APPEND_RESULT":
      return { ...state, results: [...state.results, action.result] }
    case "APPEND_MORE":
      return {
        ...state,
        results: [...state.results, ...action.results],
        total: action.total,
        loadingMore: false,
        nextPage: state.nextPage + 1,
      }
    case "SET_LOADING":
      return { ...state, loading: action.loading }
    case "SET_LOADING_MORE":
      return { ...state, loadingMore: action.loadingMore }
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false }
    case "APPEND_ANSWER":
      return { ...state, answer: state.answer + action.text }
    case "SET_ANSWER_DONE":
      return { ...state, answerDone: true, answer: action.text ?? state.answer }
    case "SET_ANSWER_ERROR":
      return { ...state, answerError: true }
    case "SET_ANSWER_UNAVAILABLE":
      return { ...state, answerUnavailable: true, loading: false }
    case "SET_CANCELLED":
      return { ...state, cancelled: true, loading: false }
    case "TOGGLE_ANSWER":
      return { ...state, answerExpanded: !state.answerExpanded }
    case "RESET":
      return { ...initialState }
    default:
      return state
  }
}

function faviconUrl(url: string): string {
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`
  } catch {
    return ""
  }
}

// --- answer-only SSE ---

function connectAnswerStream(
  query: string,
  signal: AbortSignal,
  dispatch: React.Dispatch<Action>,
) {
  const run = async () => {
    try {
      const res = await fetch("/api/search/stream/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal,
      })
      if (!res.ok) { dispatch({ type: "SET_ANSWER_UNAVAILABLE" }); return }

      const reader = res.body?.getReader()
      if (!reader) { dispatch({ type: "SET_ANSWER_UNAVAILABLE" }); return }

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split("\n\n")
        buffer = parts.pop() || ""
        for (const part of parts) {
          let event = "", data = ""
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7).trim()
            else if (line.startsWith("data: ")) data = line.slice(6)
          }
          if (!event || !data) continue
          let p: any
          try { p = JSON.parse(data) } catch { continue }
          switch (event) {
            case "answer_chunk": dispatch({ type: "APPEND_ANSWER", text: p.text || "" }); break
            case "answer_done": dispatch({ type: "SET_ANSWER_DONE", text: p.text }); break
            case "answer_error": dispatch({ type: "SET_ANSWER_ERROR" }); break
            case "answer_unavailable": dispatch({ type: "SET_ANSWER_UNAVAILABLE" }); break
          }
        }
      }
    } catch (err: any) {
      if (!signal.aborted) dispatch({ type: "SET_ANSWER_UNAVAILABLE" })
    }
  }
  run()
}

export default function ResultsPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get("q") || ""

  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef<AbortController | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // --- initial fetch ---
  useEffect(() => {
    if (!query) return

    const controller = new AbortController()
    abortRef.current = controller
    dispatch({ type: "RESET" })

    // SSR shortcut
    const initial = window.__INITIAL_DATA__
    if (initial && initial.query === query && initial.results.length > 0) {
      dispatch({ type: "SET_RESULTS", results: initial.results, total: initial.results.length })
      delete window.__INITIAL_DATA__
      connectAnswerStream(query, controller.signal, dispatch)
      return () => controller.abort()
    }

    // SPA fetch: single SSE stream with results + answer
    const run = async () => {
      try {
        const res = await fetch("/api/search/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        })
        if (!res.ok) { dispatch({ type: "SET_ERROR", error: `search failed (${res.status})` }); return }

        const reader = res.body?.getReader()
        if (!reader) { dispatch({ type: "SET_ERROR", error: "no response body" }); return }

        const decoder = new TextDecoder()
        let buffer = ""
        let total = 0
        let loadingDone = false

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split("\n\n")
          buffer = parts.pop() || ""

          for (const part of parts) {
            let event = "", data = ""
            for (const line of part.split("\n")) {
              if (line.startsWith("event: ")) event = line.slice(7).trim()
              else if (line.startsWith("data: ")) data = line.slice(6)
            }
            if (!event || !data) continue
            let p: any
            try { p = JSON.parse(data) } catch { continue }

            switch (event) {
              case "result":
                dispatch({ type: "APPEND_RESULT", result: p })
                break
              case "meta":
                if (p.total) total = p.total
                break
              case "answer_chunk":
                dispatch({ type: "APPEND_ANSWER", text: p.text || "" })
                break
              case "answer_done":
                dispatch({ type: "SET_ANSWER_DONE", text: p.text })
                break
              case "answer_error":
                dispatch({ type: "SET_ANSWER_ERROR" })
                break
              case "answer_unavailable":
                dispatch({ type: "SET_ANSWER_UNAVAILABLE" })
                break
              case "done":
                loadingDone = true
                break
            }
          }
        }

        dispatch({ type: "SET_LOADING", loading: false })
      } catch (err: any) {
        if (controller.signal.aborted) dispatch({ type: "SET_CANCELLED" })
        else dispatch({ type: "SET_ERROR", error: err.message })
      }
    }

    run()
    return () => controller.abort()
  }, [query])

  // --- infinite scroll ---
  const loadMore = useCallback(async () => {
    if (state.loadingMore || state.loading) return

    dispatch({ type: "SET_LOADING_MORE", loadingMore: true })
    try {
      const res = await fetch("/api/search/more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, page: state.nextPage }),
      })
      if (!res.ok) { dispatch({ type: "SET_LOADING_MORE", loadingMore: false }); return }
      const data = await res.json()
      if (data.results && data.results.length > 0) {
        dispatch({ type: "APPEND_MORE", results: data.results, total: data.total || state.total })
      } else {
        dispatch({ type: "SET_LOADING_MORE", loadingMore: false })
      }
    } catch {
      dispatch({ type: "SET_LOADING_MORE", loadingMore: false })
    }
  }, [query, state.nextPage, state.loadingMore, state.loading])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || state.loading || state.error !== null) return
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore() },
      { rootMargin: "200px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore, state.loading, state.error])

  // --- render ---

  if (!query) {
    return (
      <div className="hero min-h-screen bg-base-200">
        <div className="hero-content text-center">
          <h2 className="text-2xl font-bold mb-4">no search query</h2>
          <Link to="/" className="btn btn-primary">go back</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base-200">
      {/* header */}
      <header className="sticky top-0 z-40 bg-base-100/80 backdrop-blur border-b border-base-300">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/" className="text-lg font-bold shrink-0">search engine</Link>
          <div className="flex-1">
            <input
              type="text"
              defaultValue={query}
              className="input input-bordered w-full"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim()
                  if (v) window.location.href = `/search?q=${encodeURIComponent(v)}`
                }
              }}
            />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* AI answer */}
        {!state.answerUnavailable && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-base-content/60 uppercase tracking-wider">
                ai answer
              </h3>
              {!state.answerDone && !state.answerError && !state.cancelled && !state.loading && (
                <button
                  type="button"
                  onClick={() => { abortRef.current?.abort(); dispatch({ type: "SET_CANCELLED" }) }}
                  className="btn btn-ghost btn-xs"
                  aria-label="cancel"
                >
                  cancel
                </button>
              )}
            </div>
            <div className="bg-base-100 rounded-box p-5 text-sm leading-relaxed min-h-[60px]">
              {state.answer ? (
                <>
                  <p className={state.answerExpanded ? "" : "line-clamp-2"}>{state.answer}</p>
                  {state.answer.length > 150 && (
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "TOGGLE_ANSWER" })}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      {state.answerExpanded ? "show less" : "show more"}
                    </button>
                  )}
                </>
              ) : state.answerDone ? (
                <p className="text-base-content/40 italic">no answer generated</p>
              ) : state.answerError ? (
                <p className="text-error italic">failed to generate answer</p>
              ) : state.cancelled ? (
                <p className="text-base-content/40 italic">cancelled</p>
              ) : (
                <div className="flex items-center gap-2 text-base-content/40">
                  <span className="loading loading-dots loading-sm" />
                  generating answer&hellip;
                </div>
              )}
            </div>
          </div>
        )}

        {/* search results */}
        <div>
          {state.loading && state.results.length === 0 ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="skeleton h-24 w-full rounded-box" />
              ))}
            </div>
          ) : state.error ? (
            <div className="alert alert-error"><span>{state.error}</span></div>
          ) : state.results.length === 0 && !state.loading ? (
            <div className="text-center py-16">
              <p className="text-lg text-base-content/40">no results found</p>
              <p className="text-sm text-base-content/30 mt-1">try a different search term</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-base-content/40 mb-4">
                {state.results.length}
                {state.total > state.results.length ? ` of ${state.total}` : ""} result
                {state.results.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-4">
                {state.results.map((r, i) => (
                  <div key={r.url || i} className="bg-base-100 rounded-box p-4">
                    <div className="flex items-start gap-3">
                      {faviconUrl(r.url) && (
                        <img
                          src={faviconUrl(r.url)}
                          alt=""
                          className="size-4 mt-1 shrink-0"
                          loading="lazy"
                        />
                      )}
                      <div className="min-w-0">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-lg font-medium text-primary hover:underline"
                        >
                          {r.title}
                        </a>
                        <p className="text-xs text-base-content/40 truncate mt-0.5">{r.url}</p>
                        <p className="text-sm text-base-content/70 mt-2 line-clamp-2">{r.content}</p>
                        <div className="flex gap-2 mt-2">
                          <span className="badge badge-ghost badge-xs">
                            score: {r.score.toFixed(3)}
                          </span>
                          {r.engine && (
                            <span className="badge badge-ghost badge-xs">{r.engine}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* infinite scroll sentinel */}
              {!state.loading && <div ref={sentinelRef} className="h-4" />}
              {state.loadingMore && (
                <div className="flex justify-center py-6">
                  <span className="loading loading-spinner loading-md text-base-content/40" />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
