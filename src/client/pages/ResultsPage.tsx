import { useEffect, useRef, useState } from "react"
import { useSearchParams, Link } from "react-router-dom"

interface SearchResult {
  title: string
  url: string
  content: string
  score: number
  engine?: string
}

export default function ResultsPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get("q") || ""

  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [answer, setAnswer] = useState("")
  const [answerDone, setAnswerDone] = useState(false)
  const [answerError, setAnswerError] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const resultsRef = useRef<SearchResult[]>([])

  useEffect(() => {
    if (!query) return

    const controller = new AbortController()
    abortRef.current = controller
    resultsRef.current = []
    setResults([])
    setLoading(true)
    setError(null)
    setAnswer("")
    setAnswerDone(false)
    setAnswerError(false)
    setCancelled(false)

    const run = async () => {
      try {
        const res = await fetch("/api/search/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, max_results: 10 }),
          signal: controller.signal,
        })

        if (!res.ok) {
          setError(`search failed (${res.status})`)
          setLoading(false)
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          setError("no response body")
          setLoading(false)
          return
        }

        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // SSE: events separated by double newlines
          const parts = buffer.split("\n\n")
          buffer = parts.pop() || ""

          let eventType = ""
          let eventData = ""

          for (const part of parts) {
            const lines = part.split("\n")
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim()
              } else if (line.startsWith("data: ")) {
                eventData = line.slice(6)
              }
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
                resultsRef.current.push(parsed)
                setResults([...resultsRef.current])
                break
              case "answer_chunk":
                setAnswer((prev) => prev + (parsed.text || ""))
                break
              case "answer_done":
                setAnswerDone(true)
                if (parsed.text) setAnswer(parsed.text)
                break
              case "answer_error":
                setAnswerError(true)
                break
              case "done":
                setLoading(false)
                break
            }

            eventType = ""
            eventData = ""
          }
        }

        setLoading(false)
      } catch (err: any) {
        if (controller.signal.aborted) {
          setCancelled(true)
        } else {
          setError(err.message)
        }
        setLoading(false)
      }
    }

    run()

    return () => controller.abort()
  }, [query])

  const handleCancel = () => {
    abortRef.current?.abort()
    setCancelled(true)
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
      {/* header */}
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
            {!answerDone && !answerError && !cancelled && !loading && (
              <button onClick={handleCancel} className="btn btn-ghost btn-xs">
                cancel
              </button>
            )}
          </div>
          <div className="bg-base-100 rounded-box p-5 text-sm leading-relaxed min-h-[60px]">
            {answer ? (
              <p>{answer}</p>
            ) : answerDone ? (
              <p className="text-base-content/40 italic">no answer generated</p>
            ) : answerError ? (
              <p className="text-error italic">failed to generate answer</p>
            ) : cancelled ? (
              <p className="text-base-content/40 italic">cancelled</p>
            ) : (
              <div className="flex items-center gap-2 text-base-content/40">
                <span className="loading loading-dots loading-sm" />
                generating answer...
              </div>
            )}
          </div>
        </div>

        {/* search results */}
        <div>
          {loading && results.length === 0 ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-24 w-full rounded-box" />
              ))}
            </div>
          ) : error ? (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="text-center py-16">
              <p className="text-lg text-base-content/40">no results found</p>
              <p className="text-sm text-base-content/30 mt-1">
                try a different search term
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-base-content/40 mb-4">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-4">
                {results.map((r, i) => (
                  <div key={i} className="bg-base-100 rounded-box p-4">
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
