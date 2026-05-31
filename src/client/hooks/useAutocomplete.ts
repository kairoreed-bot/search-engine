import { useState, useEffect, useRef, useCallback } from "react"

export function useAutocomplete(query: string, onNavigate: (q: string) => void) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const listRef = useRef<HTMLDivElement | null>(null)

  // Fetch suggestions
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      setActiveIndex(-1)
      return
    }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q }),
        })
        if (!r.ok) return
        const d = await r.json()
        const list: string[] = d.suggestions || []
        setSuggestions(list)
        setShowSuggestions(list.length > 0)
        setActiveIndex(-1)
      } catch { /* ignore */ }
    }, 200)

    return () => clearTimeout(debounceRef.current)
  }, [query])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const select = useCallback((s: string) => {
    setShowSuggestions(false)
    setActiveIndex(-1)
    onNavigate(s)
  }, [onNavigate])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Enter") onNavigate(query.trim())
      return
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setActiveIndex((prev) =>
          prev < suggestions.slice(0, 8).length - 1 ? prev + 1 : 0,
        )
        break
      case "ArrowUp":
        e.preventDefault()
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.slice(0, 8).length - 1,
        )
        break
      case "Enter":
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          select(suggestions[activeIndex]!)
        } else {
          onNavigate(query.trim())
        }
        break
      case "Escape":
        setShowSuggestions(false)
        setActiveIndex(-1)
        break
    }
  }, [showSuggestions, suggestions, activeIndex, select, onNavigate, query])

  return {
    suggestions,
    showSuggestions,
    activeIndex,
    listRef,
    setShowSuggestions,
    onKeyDown,
    select,
  }
}
