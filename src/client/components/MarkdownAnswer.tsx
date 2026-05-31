import { useState, useEffect, useMemo, useRef, useCallback, type MutableRefObject } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"

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
  resultsRef: MutableRefObject<SearchResult[]>
}

const mdComponents = {
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link link-primary">
      {children}
    </a>
  ),
  code: ({ className, children }: any) =>
    className ? (
      <pre className="bg-base-300 p-3 rounded-box overflow-x-auto text-sm my-2">
        <code>{children}</code>
      </pre>
    ) : (
      <code className="bg-base-300 px-1 rounded text-sm">{children}</code>
    ),
  ul: ({ children }: any) => <ul className="list-disc list-inside my-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside my-1">{children}</ol>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-primary/30 pl-3 italic my-2">{children}</blockquote>
  ),
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="border border-base-300 px-3 py-1.5 bg-base-200/50 font-semibold text-left">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="border border-base-300 px-3 py-1.5">{children}</td>
  ),
}

export default function MarkdownAnswer({ text, done, resultsRef }: Props) {
  const [visible, setVisible] = useState("")
  const prevLenRef = useRef(0)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const getResult = useCallback(
    (i: number) => resultsRef.current[i],
    [resultsRef],
  )

  // 100ms flush buffer
  useEffect(() => {
    if (done) {
      setVisible(text)
      prevLenRef.current = text.length
      return
    }
    if (text.length <= prevLenRef.current) return
    const timer = setTimeout(() => {
      setVisible(text)
      prevLenRef.current = text.length
    }, 100)
    return () => clearTimeout(timer)
  }, [text, done])

  // Hydrate <cite> elements with favicon + number + click handler
  useEffect(() => {
    if (!visible || !containerRef.current) return
    const cites = containerRef.current.querySelectorAll("cite.__cite__")
    for (const el of cites) {
      const idx = parseInt(el.getAttribute("data-idx") || "0", 10)
      const r = getResult(idx)
      el.className =
        "inline-flex items-center gap-px px-1 py-[1px] rounded text-[11px] font-medium leading-none align-baseline no-underline cursor-pointer transition-colors"
      el.style.backgroundColor = "oklch(var(--p) / 0.1)"
      el.style.color = "oklch(var(--p))"

      if (r) {
        let host = ""
        let favicon = ""
        try {
          const u = new URL(r.url)
          host = u.hostname.replace(/^www\./, "")
          favicon = `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`
        } catch { host = r.url }

        const img = document.createElement("img")
        img.src = favicon
        img.alt = ""
        img.className = "size-3 rounded-[1px] bg-base-300"
        img.loading = "lazy"
        el.appendChild(img)

        const span = document.createElement("span")
        span.textContent = String(idx + 1)
        el.appendChild(span)

        el.title = r.title
        el.addEventListener("click", (e) => {
          e.stopPropagation()
          window.open(r.url, "_blank")
        })
      } else {
        el.textContent = `[${idx + 1}]`
      }
    }
  }, [visible, getResult])

  if (!visible) return null

  // Pre-process: replace [N] with <cite> tags so markdown preserves structure
  const processed = visible.replace(
    /\[(\d+)\]/g,
    (_, n) => `<cite class="__cite__" data-idx="${parseInt(n, 10) - 1}"></cite>`,
  )

  return (
    <div
      ref={containerRef}
      className="prose prose-sm max-w-none [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ol]:my-1"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={mdComponents}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}
