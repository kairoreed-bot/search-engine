import { useState, useEffect, useRef, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useTheme } from "../context/ThemeContext"

const QUICK_SEARCHES = [
  { q: "what is the meaning of life", icon: "?" },
  { q: "latest ai news 2026", icon: ">" },
  { q: "how to learn rust programming", icon: "}" },
  { q: "deep learning explained simply", icon: "~" },
]

export default function HomePage() {
  const [query, setQuery] = useState("")
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const { cycle, theme } = useTheme()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    navigate(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <div className="hero-gradient min-h-screen flex flex-col">
      {/* theme toggle */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={cycle}
          className="btn btn-ghost btn-sm btn-circle"
          aria-label="cycle theme"
          title={`current: ${theme} — click to cycle`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
            <path d="M12 3a6 6 0 0 0 0 12 6 6 0 0 0 0-12z" />
            <path d="M12 21v-2M12 5V3M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M3 12h2M19 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>

      {/* center content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-10">
        {/* logo / brand */}
        <div className="text-center space-y-3">
          <h1 className="text-6xl md:text-7xl font-black tracking-tight">
            <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              search
            </span>
            <span className="text-base-content"> engine</span>
          </h1>
          <p className="text-base-content/50 text-lg font-medium">
            private, self-hosted web search
          </p>
        </div>

        {/* search form */}
        <form onSubmit={handleSubmit} className="w-full max-w-xl flex flex-col gap-4">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 rounded-2xl blur opacity-60 group-focus-within:opacity-100 transition-opacity" />
            <div className="relative">
              <label className="input input-bordered input-lg w-full flex items-center gap-3 rounded-2xl bg-base-100/80 glass-input border-base-300/50 focus-within:border-primary/50 transition-colors shadow-lg shadow-black/5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="size-5 opacity-50 shrink-0"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="search the web&hellip;"
                  className="grow outline-none bg-transparent"
                  aria-label="search query"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="btn btn-ghost btn-xs btn-circle opacity-60 hover:opacity-100"
                    tabIndex={-1}
                    aria-label="clear"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </label>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg rounded-xl self-center px-12 shadow-lg shadow-primary/20">
            search
          </button>
        </form>

        {/* quick searches */}
        <div className="flex flex-wrap justify-center gap-2 max-w-xl">
          {QUICK_SEARCHES.map((s) => (
            <button
              key={s.q}
              type="button"
              onClick={() => navigate(`/search?q=${encodeURIComponent(s.q)}`)}
              className="btn btn-ghost btn-sm rounded-full text-base-content/60 hover:text-base-content hover:bg-base-content/5 transition-colors"
            >
              {s.q}
            </button>
          ))}
        </div>
      </div>

      {/* footer */}
      <footer className="py-6 text-center text-xs text-base-content/30 space-y-1">
        <p>
          powered by <span className="font-medium">SearXNG</span>
          {" \u00b7 "}
          reranked with <span className="font-medium">transformers.js</span>
        </p>
      </footer>
    </div>
  )
}
