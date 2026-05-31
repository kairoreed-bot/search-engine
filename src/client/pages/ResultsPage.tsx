import { useEffect, useRef, useReducer, useCallback } from "react"
import { useSearchParams, Link } from "react-router-dom"
import { useTheme } from "../context/ThemeContext"
import MarkdownAnswer from "../components/MarkdownAnswer"

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
  | { type: "APPEND_RESULT"; result: SearchResult }
  | { type: "APPEND_MORE"; results: SearchResult[]; total: number }
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

const S0: State = {
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

function red(s: State, a: Action): State {
  switch (a.type) {
    case "SET_RESULTS": return { ...s, results: a.results, total: a.total, loading: false }
    case "APPEND_RESULT": return { ...s, results: [...s.results, a.result] }
    case "APPEND_MORE": return {
      ...s, results: [...s.results, ...a.results], total: a.total,
      loadingMore: false, nextPage: s.nextPage + 1,
    }
    case "SET_LOADING": return { ...s, loading: a.loading }
    case "SET_LOADING_MORE": return { ...s, loadingMore: a.loadingMore }
    case "SET_ERROR": return { ...s, error: a.error, loading: false }
    case "APPEND_ANSWER": return { ...s, answer: s.answer + a.text }
    case "SET_ANSWER_DONE": return { ...s, answerDone: true, answer: a.text ?? s.answer }
    case "SET_ANSWER_ERROR": return { ...s, answerError: true }
    case "SET_ANSWER_UNAVAILABLE": return { ...s, answerUnavailable: true, loading: false }
    case "SET_CANCELLED": return { ...s, cancelled: true, loading: false }
    case "TOGGLE_ANSWER": return { ...s, answerExpanded: !s.answerExpanded }
    case "RESET": return { ...S0 }
    default: return s
  }
}

function faviconUrl(url: string): string {
  try { return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico` }
  catch { return "" }
}

function connectAnswerStream(q: string, sig: AbortSignal, d: React.Dispatch<Action>) {
  const run = async () => {
    try {
      const r = await fetch("/api/search/stream/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
        signal: sig,
      })
      if (!r.ok) { d({ type: "SET_ANSWER_UNAVAILABLE" }); return }

      const reader = r.body?.getReader()
      if (!reader) { d({ type: "SET_ANSWER_UNAVAILABLE" }); return }

      const dec = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split("\n\n")
        buf = parts.pop() || ""
        for (const part of parts) {
          let ev = "", dt = ""
          for (const ln of part.split("\n")) {
            if (ln.startsWith("event: ")) ev = ln.slice(7).trim()
            else if (ln.startsWith("data: ")) dt = ln.slice(6)
          }
          if (!ev || !dt) continue
          let p: any
          try { p = JSON.parse(dt) } catch { continue }
          switch (ev) {
            case "answer_chunk": d({ type: "APPEND_ANSWER", text: p.text || "" }); break
            case "answer_done": d({ type: "SET_ANSWER_DONE", text: p.text }); break
            case "answer_error": d({ type: "SET_ANSWER_ERROR" }); break
            case "answer_unavailable": d({ type: "SET_ANSWER_UNAVAILABLE" }); break
          }
        }
      }
    } catch (e: any) {
      if (!sig.aborted) d({ type: "SET_ANSWER_UNAVAILABLE" })
    }
  }
  run()
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return String(n)
}

// ---- component ----

export default function ResultsPage() {
  const [sp] = useSearchParams()
  const query = sp.get("q") || ""

  const [state, dispatch] = useReducer(red, S0)
  const acRef = useRef<AbortController | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const resultsRef = useRef<SearchResult[]>([])
  const { cycle, theme } = useTheme()

  // --- initial fetch ---
  useEffect(() => {
    if (!query) return

    const ctrl = new AbortController()
    acRef.current = ctrl
    resultsRef.current = []
    dispatch({ type: "RESET" })

    // SSR shortcut
    const init = window.__INITIAL_DATA__
    if (init && init.query === query && init.results.length > 0) {
      resultsRef.current = init.results
      dispatch({ type: "SET_RESULTS", results: init.results, total: init.results.length })
      delete window.__INITIAL_DATA__
      connectAnswerStream(query, ctrl.signal, dispatch)
      return () => ctrl.abort()
    }

    // SPA fetch
    const run = async () => {
      try {
        const r = await fetch("/api/search/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
          signal: ctrl.signal,
        })
        if (!r.ok) { dispatch({ type: "SET_ERROR", error: `search failed (${r.status})` }); return }
        const reader = r.body?.getReader()
        if (!reader) { dispatch({ type: "SET_ERROR", error: "no response body" }); return }

        const dec = new TextDecoder()
        let buf = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const parts = buf.split("\n\n")
          buf = parts.pop() || ""
          for (const part of parts) {
            let ev = "", dt = ""
            for (const ln of part.split("\n")) {
              if (ln.startsWith("event: ")) ev = ln.slice(7).trim()
              else if (ln.startsWith("data: ")) dt = ln.slice(6)
            }
            if (!ev || !dt) continue
            let p: any
            try { p = JSON.parse(dt) } catch { continue }
            switch (ev) {
              case "result":
                resultsRef.current.push(p)
                dispatch({ type: "APPEND_RESULT", result: p })
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
            }
          }
        }
        dispatch({ type: "SET_LOADING", loading: false })
      } catch (e: any) {
        if (ctrl.signal.aborted) dispatch({ type: "SET_CANCELLED" })
        else dispatch({ type: "SET_ERROR", error: e.message })
      }
    }

    run()
    return () => ctrl.abort()
  }, [query])

  // --- infinite scroll ---
  const loadMore = useCallback(async () => {
    if (state.loadingMore || state.loading) return
    dispatch({ type: "SET_LOADING_MORE", loadingMore: true })
    try {
      const r = await fetch("/api/search/more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, page: state.nextPage }),
      })
      if (!r.ok) { dispatch({ type: "SET_LOADING_MORE", loadingMore: false }); return }
      const d = await r.json()
      if (d.results?.length) {
        resultsRef.current = [...resultsRef.current, ...d.results]
        dispatch({ type: "APPEND_MORE", results: d.results, total: d.total || state.total })
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

  // --- render helpers ---

  const cancel = () => {
    acRef.current?.abort()
    dispatch({ type: "SET_CANCELLED" })
  }

  // ---- render ----

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
      {/* --- top bar --- */}
      <header className="sticky top-0 z-40 bg-base-100/70 backdrop-blur-xl border-b border-base-300/50">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <Link to="/" className="font-black text-lg tracking-tight shrink-0">
            <span className="text-primary">s</span>
            <span className="text-base-content">e</span>
          </Link>
          <div className="flex-1 relative">
            <input
              type="text"
              defaultValue={query}
              className="input input-bordered input-sm w-full rounded-xl pl-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim()
                  if (v) window.location.href = `/search?q=${encodeURIComponent(v)}`
                }
              }}
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 opacity-40 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
          <button
            type="button"
            onClick={cycle}
            className="btn btn-ghost btn-xs btn-square"
            aria-label="cycle theme"
            title={`current: ${theme}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
              <path d="M12 3a6 6 0 0 0 0 12 6 6 0 0 0 0-12z" />
              <path d="M12 21v-2M12 5V3M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M3 12h2M19 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* --- AI answer --- */}
        {!state.answerUnavailable && (
          <section className="answer-enter">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-base-content/40">
                ai answer
              </h3>
              <span className="flex-1 h-px bg-base-300/50" />
              {!state.answerDone && !state.answerError && !state.cancelled && !state.loading && (
                <button type="button" onClick={cancel} className="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content" aria-label="cancel">
                  cancel
                </button>
              )}
            </div>

            <div className="relative bg-base-100 rounded-2xl p-5 shadow-sm border border-base-300/40 min-h-[60px]">
              {/* colored left accent */}
              <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-gradient-to-b from-primary/60 to-secondary/60 rounded-full" />

              {state.answer ? (
                <div className={state.answerExpanded ? "" : "line-clamp-2"}>
                  <MarkdownAnswer
                    text={state.answer}
                    done={state.answerDone}
                    resultsRef={resultsRef}
                  />
                </div>
              ) : state.answerDone ? (
                <p className="text-base-content/40 italic text-sm">no answer generated</p>
              ) : state.answerError ? (
                <p className="text-error italic text-sm">failed to generate answer</p>
              ) : state.cancelled ? (
                <p className="text-base-content/40 italic text-sm">cancelled</p>
              ) : (
                <div className="flex items-center gap-2 text-sm text-base-content/40">
                  <span className="loading loading-dots loading-sm" />
                  generating answer&hellip;
                </div>
              )}

              {state.answer && state.answer.length > 150 && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: "TOGGLE_ANSWER" })}
                  className="text-xs text-primary/60 hover:text-primary mt-1.5 transition-colors"
                >
                  {state.answerExpanded ? "collapse" : "read more"}
                </button>
              )}
            </div>
          </section>
        )}

        {/* --- search results --- */}
        <section>
          {state.loading && state.results.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`sk-${i}`} className="skeleton h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : state.error ? (
            <div className="alert alert-error shadow-sm"><span>{state.error}</span></div>
          ) : state.results.length === 0 && !state.loading ? (
            <div className="text-center py-20">
              <p className="text-lg text-base-content/40">no results found</p>
              <p className="text-sm text-base-content/30 mt-1">try a different search term</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4 text-xs text-base-content/40">
                <span>
                  {formatCount(state.results.length)}
                  {state.total > state.results.length ? ` of ${formatCount(state.total)}` : ""} result
                  {state.results.length !== 1 ? "s" : ""}
                </span>
                <span className="w-px h-3 bg-base-300" />
                <span>about {query}</span>
              </div>

              <div className="space-y-3">
                {state.results.map((r, i) => (
                  <article
                    key={r.url || i}
                    data-index={i}
                    className="result-card bg-base-100 rounded-2xl p-4 border border-base-300/40 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      {/* favicon */}
                      {faviconUrl(r.url) && (
                        <img
                          src={faviconUrl(r.url)}
                          alt=""
                          className="size-5 mt-0.5 shrink-0 rounded"
                          loading="lazy"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-base font-semibold text-primary hover:underline leading-snug"
                        >
                          {r.title}
                        </a>
                        <p className="text-xs text-base-content/35 truncate mt-0.5">{r.url}</p>
                        <p className="text-sm text-base-content/65 mt-1.5 line-clamp-2 leading-relaxed">{r.content}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className="badge badge-ghost badge-xs text-[10px] tracking-wide">
                            {r.score.toFixed(3)}
                          </span>
                          {r.engine && (
                            <span className="badge badge-ghost badge-xs text-[10px]">{r.engine}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {/* sentinel */}
              {!state.loading && <div ref={sentinelRef} className="h-4" />}

              {state.loadingMore && (
                <div className="flex justify-center py-8">
                  <span className="loading loading-spinner loading-sm text-base-content/30" />
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
