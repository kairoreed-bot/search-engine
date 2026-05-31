import { useEffect, useRef } from "react"
import { Search } from "lucide-react"

interface Props {
  suggestions: string[]
  activeIndex: number
  visible: boolean
  onSelect: (s: string) => void
  /** Called when the user presses enter on an item */
  onEnter: () => void
  /** Ref for the sentinel element so the parent can scroll to it */
  listRef: React.RefObject<HTMLDivElement | null>
}

export default function AutocompleteDropdown({
  suggestions,
  activeIndex,
  visible,
  onSelect,
  onEnter,
  listRef,
}: Props) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" })
    }
  }, [activeIndex])

  if (!visible || suggestions.length === 0) return null

  return (
    <div
      ref={listRef}
      className="absolute top-full mt-1 left-0 right-0 bg-base-100 rounded-xl shadow-xl border border-base-300/50 overflow-hidden z-50"
    >
      {suggestions.slice(0, 8).map((s, i) => (
        <button
          key={s}
          ref={(el) => { itemRefs.current[i] = el }}
          type="button"
          onClick={() => onSelect(s)}
          onMouseEnter={() => {}} // cursor sets active
          className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-3
            ${i === activeIndex ? "bg-primary/10 text-primary" : "hover:bg-base-200/70"}`}
        >
          <Search className="size-3.5 opacity-40 shrink-0" />
          <span className="truncate">{s}</span>
        </button>
      ))}
    </div>
  )
}
