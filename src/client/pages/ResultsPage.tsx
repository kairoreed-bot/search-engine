import { useEffect, useRef, useReducer } from "react"
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
  error: string | null
  answer: string
  answerDone: boolean
  answerError: boolean
  cancelled: boolean
}

type Action =
  | { type: "SET_RESULTS"; results: SearchResult[] }
  | { type: "APPEND_RESULT"; result: SearchResult }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string }
  | { type: "APPEND_ANSWER"; text: string }
  | { type: "SET_ANSWER_DONE"; text?: string }
  | { type: "SET_ANSWER_ERROR" }
  | { type: "SET_CANCELLED" }
  | { type: "RESET" }

const initialState: State = {
  results: [],
  loading: true,
  error: null,
  answer: "",
  answerDone: false,
  answerError: false,
  cancelled: false,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_RESULTS":
      return { ...state, results: action.results, loading: false }
    case "APPEND_RESULT":
      return { ...state, results: [...state.results, action.result] }
    case "SET_LOADING":
      return { ...state, loading: action.loading }
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false }
    case "APPEND_ANSWER":
      return { ...state, answer: state.answer + action.text }
    case "SET_ANSWER_DONE":
      return {
        ...state,
        answerDone: true,
        answer: action.text ?? state.answer,
      }
    case "SET_ANSWER_ERROR":
      return { ...state, answerError: true, loading: false }
    case "SET_CANCELLED":
      return { ...state, cancelled: true, loading: false }
    case "RESET":
      return { ...initialState }
    default:
      return state
  }
}

function connectAnswerStream(
  query: string,
  signal: AbortSignal,
  dispatch: React.Dispatch<Action>,
  results?: SearchResult[],
) {
  const run = async () => {
    try {
      const body: any = { query }
      if (results && results.length > 0) body.results = results
      const res = await fetch("/api/search/stream/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      })

      if (!res.ok) {
        dispatch({ type: "SET_ANSWER_ERROR" })
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        dispatch({ type: "SET_ANSWER_ERROR" })
        return
      }

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split("\n\n")
        buffer = parts.pop() || ""

        let eventType = ""
        let eventData = ""

        for (const part of parts) {
          const lines = part.split("\n")
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim()
            else if (line.startsWith("data: ")) eventData = line.slice(6)
          }

          if (!eventType || !eventData) continue

          let parsed: any
          try {
            parsed = JSON.parse(eventData)
          } catch {
            continue
          }

          switch (eventType) {
            case "answer_chunk":
              dispatch({ type: "APPEND_ANSWER", text: parsed.text || "" })
              break
            case "answer_done":
              if (parsed.text) {
                dispatch({ type: "SET_ANSWER_DONE", text: parsed.text })
              } else {
                dispatch({ type: "SET_ANSWER_DONE" })
              }
              break
            case "answer_error":
              dispatch({ type: "SET_ANSWER_ERROR" })
              break
            case "done":
              dispatch({ type: "SET_ANSWER_DONE" })
              break
          }

          eventType = ""
          eventData = ""
        }
      }
    } catch (err: any) {
      if (signal.aborted) return
      dispatch({ type: "SET_ANSWER_ERROR" })
    }
  }

  run()
}

function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  dispatch: React.Dispatch<Action>,
) {
  return async () => {
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split("\n\n")
      buffer = parts.pop() || ""

      let eventType = ""
      let eventData = ""

      for (const part of parts) {
        const lines = part.split("\n")
        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim()
          else if (line.startsWith("data: ")) eventData = line.slice(6)
        }

        if (!eventType || !eventData) continue

        let parsed: any
        try {
          parsed = JSON.parse(eventData)
        } catch {
          continue
        }

        switch (eventType) {
          case "result":
            dispatch({ type: "APPEND_RESULT", result: parsed })
            break
          case "answer_chunk":
            dispatch({ type: "APPEND_ANSWER", text: parsed.text || "" })
            break
          case "answer_done":
            if (parsed.text) {
              dispatch({ type: "SET_ANSWER_DONE", text: parsed.text })
            } else {
              dispatch({ type: "SET_ANSWER_DONE" })
            }
            break
          case "answer_error":
            dispatch({ type: "SET_ANSWER_ERROR" })
            break
          case "done":
            dispatch({ type: "SET_LOADING", loading: false })
            break
        }

        eventType = ""
        eventData = ""
      }
    }

    dispatch({ type: "SET_LOADING", loading: false })
  }
}

export default function ResultsPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get("q") || ""

  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef<AbortController | null>(null)
  const resultsRef = useRef<SearchResult[]>([])

  useEffect(() => {
    if (!query) return

    const controller = new AbortController()
    abortRef.current = controller
    resultsRef.current = []
    dispatch({ type: "RESET" })

    // SSR-injected initial data shortcut
    const initial = window.__INITIAL_DATA__
    if (initial && initial.query === query && initial.results.length > 0) {
      resultsRef.current = initial.results
      dispatch({ type: "SET_RESULTS", results: initial.results })
      delete window.__INITIAL_DATA__

      connectAnswerStream(query, controller.signal, dispatch, initial.results)
      return () => controller.abort()
    }

    // Full SPA fetch
    const run = async () => {
      try {
        const res = await fetch("/api/search/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, max_results: 10 }),
          signal: controller.signal,
        })

        if (!res.ok) {
          dispatch({ type: "SET_ERROR", error: `search failed (${res.status})` })
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          dispatch({ type: "SET_ERROR", error: "no response body" })
          return
        }

        await parseSSEStream(reader, controller.signal, dispatch)()
      } catch (err: any) {
        if (controller.signal.aborted) {
          dispatch({ type: "SET_CANCELLED" })
        } else {
          dispatch({ type: "SET_ERROR", error: err.message })
        }
      }
    }

    run()

    return () => controller.abort()
  }, [query])

  const handleCancel = () => {
    abortRef.current?.abort()
    dispatch({ type: "SET_CANCELLED" })
  }

  if (!query) {
    return (
      <div className="hero min-h-screen bg-base-200">
        <div className="hero-content text-center">
          <div>
            <h2 className="text-2xl font-bold mb-4">no search query</h2>
            <Link to="/" className="btn btn-primary">
              go back
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base-200">
      <header className="sticky top-0 z-40 bg-base-100/80 backdrop-blur border-b border-base-300">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/" className="text-lg font-bold shrink-0">
            search engine
          </Link>
          <div className="flex-1">
            <input
              type="text"
              defaultValue={query}
              className="input input-bordered w-full"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const el = e.target as HTMLInputElement
                  const v = el.value.trim()
                  if (v) window.location.href = `/search?q=${encodeURIComponent(v)}`
                }
              }}
            />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* AI answer */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-base-content/60 uppercase tracking-wider">
              ai answer
            </h3>
            {!state.answerDone && !state.answerError && !state.cancelled && !state.loading && (
              <button
                type="button"
                onClick={handleCancel}
                className="btn btn-ghost btn-xs"
                aria-label="cancel AI answer generation"
              >
                cancel
              </button>
            )}
          </div>
          <div className="bg-base-100 rounded-box p-5 text-sm leading-relaxed min-h-[60px]">
            {state.answer ? (
              <p>{state.answer}</p>
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

        {/* search results */}
        <div>
          {state.loading && state.results.length === 0 ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="skeleton h-24 w-full rounded-box" />
              ))}
            </div>
          ) : state.error ? (
            <div className="alert alert-error">
              <span>{state.error}</span>
            </div>
          ) : state.results.length === 0 && !state.loading ? (
            <div className="text-center py-16">
              <p className="text-lg text-base-content/40">no results found</p>
              <p className="text-sm text-base-content/30 mt-1">
                try a different search term
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-base-content/40 mb-4">
                {state.results.length} result{state.results.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-4">
                {state.results.map((r, i) => (
                  <div key={r.url || i} className="bg-base-100 rounded-box p-4">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lg font-medium text-primary hover:underline"
                    >
                      {r.title}
                    </a>
                    <p className="text-xs text-base-content/40 truncate mt-0.5">
                      {r.url}
                    </p>
                    <p className="text-sm text-base-content/70 mt-2 line-clamp-2">
                      {r.content}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <span className="badge badge-ghost badge-xs">
                        score: {r.score.toFixed(3)}
                      </span>
                      {r.engine && (
                        <span className="badge badge-ghost badge-xs">
                          {r.engine}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
