import { useEffect, useRef, useReducer, useCallback, useState } from "react"
import { useSearchParams, Link } from "react-router-dom"
import { Search, ExternalLink } from "lucide-react"
import { useTheme } from "../context/ThemeContext"
import { useAutocomplete } from "../hooks/useAutocomplete"
import AutocompleteDropdown from "../components/AutocompleteDropdown"
import AiAnswer from "../components/AiAnswer"

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
  const { cycle, current: themeInfo } = useTheme()

  // header search autocomplete
  const [headerQuery, setHeaderQuery] = useState(query)
  const onNavigate = useCallback(
    (q: string) => { if (q) window.location.href = `/search?q=${encodeURIComponent(q)}` },
    [],
  )
  const {
    suggestions,
    showSuggestions,
    activeIndex,
    listRef,
    setShowSuggestions,
    onKeyDown,
    select,
  } = useAutocomplete(headerQuery, onNavigate)

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

  const cancel = () => {
    acRef.current?.abort()
    dispatch({ type: "SET_CANCELLED" })
  }

  const ThemeIcon = themeInfo.icon

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
      {/* top bar */}
      <header className="sticky top-0 z-40 bg-base-100/70 backdrop-blur-xl border-b border-base-300/50">
        <div className="flex items-center gap-3 px-4 py-2.5 lg:ml-8 xl:ml-16">
          <Link to="/" className="font-black text-lg tracking-tight shrink-0">
            <span className="text-primary">s</span><span className="text-base-content">e</span>
          </Link>
          <div className="flex-1 relative">
            <input
              type="text"
              value={headerQuery}
              onChange={(e) => setHeaderQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onKeyDown={onKeyDown}
              className="input input-bordered input-sm w-full rounded-xl pl-8 text-sm"
              autoComplete="off"
            />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 opacity-40 pointer-events-none" />

            <AutocompleteDropdown
              suggestions={suggestions}
              activeIndex={activeIndex}
              visible={showSuggestions}
              listRef={listRef as React.RefObject<HTMLDivElement | null>}
              onSelect={(s) => { setHeaderQuery(s); select(s) }}
              onEnter={() => {
                if (activeIndex >= 0) select(suggestions[activeIndex]!)
                else onNavigate(headerQuery.trim())
              }}
            />
          </div>
          <button
            type="button"
            onClick={cycle}
            className="btn btn-ghost btn-xs btn-square"
            aria-label={themeInfo.label}
            title={themeInfo.label}
          >
            <ThemeIcon className="size-4" />
          </button>
        </div>
      </header>

      <main className="px-4 py-6 space-y-6 lg:ml-8 xl:ml-16 lg:max-w-3xl xl:max-w-4xl">
        {/* AI answer */}
        <AiAnswer
          text={state.answer}
          done={state.answerDone}
          error={state.answerError}
          unavailable={state.answerUnavailable}
          cancelled={state.cancelled}
          loading={state.loading}
          expanded={state.answerExpanded}
          resultsRef={resultsRef}
          onToggle={() => dispatch({ type: "TOGGLE_ANSWER" })}
          onCancel={cancel}
        />

        {/* search results */}
        <section>
          {state.loading && state.results.length === 0 ? (
            <div className="space-y-3">
              {/* AI answer skeleton */}
              <div className="rounded-2xl p-5 border border-base-300/40">
                <div className="skeleton h-4 w-20 mb-3 rounded" />
                <div className="space-y-2">
                  <div className="skeleton h-3 w-full rounded" />
                  <div className="skeleton h-3 w-5/6 rounded" />
                  <div className="skeleton h-3 w-4/6 rounded" />
                </div>
              </div>
              {/* result skeletons */}
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
                          className="text-base font-semibold text-primary hover:underline leading-snug inline-flex items-center gap-1"
                        >
                          {r.title}
                          <ExternalLink className="size-3 opacity-40 shrink-0" />
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
