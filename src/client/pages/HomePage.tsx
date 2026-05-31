import { useState, useEffect, useRef, useCallback, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Search } from "lucide-react"
import { useTheme } from "../context/ThemeContext"
import { useAutocomplete } from "../hooks/useAutocomplete"
import AutocompleteDropdown from "../components/AutocompleteDropdown"

const QUICK_SEARCHES = [
  "what is the meaning of life",
  "latest ai news 2026",
  "how to learn rust programming",
  "deep learning explained simply",
]

export default function HomePage() {
  const [query, setQuery] = useState("")
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const { cycle, current: themeInfo } = useTheme()

  const onNavigate = useCallback(
    (q: string) => {
      if (!q) return
      navigate(`/search?q=${encodeURIComponent(q)}`)
    },
    [navigate],
  )

  const {
    suggestions,
    showSuggestions,
    activeIndex,
    listRef,
    setShowSuggestions,
    onKeyDown,
    onFocus,
    onBlur,
    select,
  } = useAutocomplete(query, onNavigate)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e: FormEvent | string) => {
    if (typeof e !== "string") e.preventDefault()
    const q = typeof e === "string" ? e : query.trim()
    if (!q) return
    onNavigate(q)
  }

  const ThemeIcon = themeInfo.icon

  return (
    <div className="hero-gradient min-h-screen flex flex-col">
      {/* theme toggle */}
      <div className="fixed top-4 right-4 z-50">
        <button
          type="button"
          onClick={cycle}
          className="btn btn-ghost btn-sm gap-1.5 bg-base-100/60 backdrop-blur"
          aria-label="cycle theme"
          title={themeInfo.label}
        >
          <ThemeIcon className="size-4" />
          <span className="text-xs font-medium hidden sm:inline">{themeInfo.label}</span>
        </button>
      </div>

      {/* center content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-10 lg:items-start lg:ml-12 xl:ml-24">
        {/* brand */}
        <div className="text-center space-y-3 lg:text-left">
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
        <form onSubmit={handleSubmit} className="w-full max-w-xl lg:max-w-2xl flex flex-col gap-4">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 rounded-2xl blur opacity-60 group-focus-within:opacity-100 transition-opacity" />
            <div className="relative">
              <label className="input input-bordered input-lg w-full flex items-center gap-3 rounded-2xl bg-base-100/80 glass-input border-base-300/50 focus-within:border-primary/50 transition-colors shadow-lg shadow-black/5">
                <Search className="size-5 opacity-50 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  onKeyDown={onKeyDown}
                  placeholder="search the web&hellip;"
                  className="grow outline-none bg-transparent"
                  aria-label="search query"
                  autoComplete="off"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setSuggestions([]); setShowSuggestions(false) }}
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

              <AutocompleteDropdown
                suggestions={suggestions}
                activeIndex={activeIndex}
                visible={showSuggestions}
                listRef={listRef as React.RefObject<HTMLDivElement | null>}
                onSelect={select}
                onEnter={() => {
                  if (activeIndex >= 0) select(suggestions[activeIndex]!)
                  else onNavigate(query.trim())
                }}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg rounded-xl self-center px-12 shadow-lg shadow-primary/20 lg:self-start">
            search
          </button>
        </form>

        {/* quick searches */}
        <div className="flex flex-wrap gap-2 max-w-xl lg:max-w-2xl">
          {QUICK_SEARCHES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSubmit(s)}
              className="btn btn-ghost btn-sm rounded-full text-base-content/60 hover:text-base-content hover:bg-base-content/5 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

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
