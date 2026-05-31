import { type MutableRefObject } from "react"
import MarkdownAnswer from "./MarkdownAnswer"

interface SearchResult {
  title: string
  url: string
  content: string
  score: number
  engine?: string
}

interface Props {
  text: string
  done: boolean
  error: boolean
  unavailable: boolean
  cancelled: boolean
  loading: boolean
  expanded: boolean
  resultsRef: MutableRefObject<SearchResult[]>
  onToggle: () => void
  onCancel: () => void
}

export default function AiAnswer({
  text, done, error, unavailable, cancelled, loading,
  expanded, resultsRef, onToggle, onCancel,
}: Props) {
  if (unavailable) return null

  return (
    <section className="answer-enter">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-base-content/40">
          ai answer
        </h3>
        <span className="flex-1 h-px bg-base-300/50" />
        {!done && !error && !cancelled && !loading && (
          <button type="button" onClick={onCancel}
            className="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content"
            aria-label="cancel"
          >
            cancel
          </button>
        )}
      </div>

      <div className="relative bg-base-100 rounded-2xl p-5 shadow-sm border border-base-300/40 min-h-[60px]">
        <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-gradient-to-b from-primary/60 to-secondary/60 rounded-full" />

        {text ? (
          <>
            <div className={expanded ? "" : "line-clamp-2"}>
              <MarkdownAnswer text={text} done={done} resultsRef={resultsRef} />
            </div>
            {text.length > 150 && (
              <button type="button" onClick={onToggle}
                className="text-xs text-primary/60 hover:text-primary mt-1.5 transition-colors"
              >
                {expanded ? "collapse" : "read more"}
              </button>
            )}
          </>
        ) : done ? (
          <p className="text-base-content/40 italic text-sm">no answer generated</p>
        ) : error ? (
          <p className="text-error italic text-sm">failed to generate answer</p>
        ) : cancelled ? (
          <p className="text-base-content/40 italic text-sm">cancelled</p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-base-content/40">
            <span className="loading loading-dots loading-sm" />
            generating answer&hellip;
          </div>
        )}
      </div>
    </section>
  )
}
