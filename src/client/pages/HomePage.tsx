import { useState, useEffect, useRef, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"

export default function HomePage() {
  const [query, setQuery] = useState("")
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

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
    <div className="hero min-h-screen bg-base-200">
      <div className="hero-content text-center flex-col gap-8 w-full max-w-2xl px-4">
        <div>
          <h1 className="text-5xl md:text-6xl font-bold mb-4">search engine</h1>
          <p className="text-base-content/60 text-lg">
            private, self-hosted web search
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <label className="input input-bordered input-lg flex items-center gap-3 w-full">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="size-5 opacity-60 shrink-0"
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
              className="grow outline-none"
              aria-label="search query"
            />
          </label>

          <button type="submit" className="btn btn-primary">
            search
          </button>
        </form>

        <div className="flex gap-2 text-sm text-base-content/40">
          <span>powered by SearXNG</span>
          <span>|</span>
          <span>reranked with transformers.js</span>
        </div>
      </div>
    </div>
  )
}
