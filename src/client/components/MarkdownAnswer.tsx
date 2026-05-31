import { useState, useEffect, useRef, useCallback, type MutableRefObject } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ExternalLink } from "lucide-react"

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

/**
 * Build a citation DOM element and attach it after the text node.
 */
function buildCiteEl(
  idx: number,
  getResult: (i: number) => { title: string; url: string } | undefined,
): HTMLElement {
  const r = getResult(idx)
  const el = document.createElement("sup")
  el.className = "inline-flex items-center gap-px px-1 py-[1px] rounded text-[11px] font-medium leading-none align-baseline no-underline cursor-pointer transition-colors"
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
    img.className = "size-3 rounded-[1px]"
    img.loading = "lazy"
    el.appendChild(img)

    const num = document.createElement("span")
    num.textContent = String(idx + 1)
    el.appendChild(num)

    el.title = r.title
    el.addEventListener("click", () => window.open(r.url, "_blank"))
    el.style.cursor = "pointer"
  } else {
    el.textContent = `[${idx + 1}]`
  }

  return el
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

  // Replace [N] text nodes with citation elements
  useEffect(() => {
    if (!visible || !containerRef.current) return

    const walker = document.createTreeWalker(
      containerRef.current,
      NodeFilter.SHOW_TEXT,
      null,
    )

    const toReplace: { node: Text; idx: number }[] = []

    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      const m = node.textContent?.match(/^\[(\d+)\]$/)
      if (m) {
        toReplace.push({ node, idx: parseInt(m[1]!, 10) - 1 })
      }
    }

    for (const { node, idx } of toReplace) {
      const cite = buildCiteEl(idx, getResult)
      node.parentNode?.replaceChild(cite, node)
    }
  }, [visible, getResult])

  if (!visible) return null

  return (
    <div
      ref={containerRef}
      className="prose prose-sm max-w-none [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ol]:my-1"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {visible}
      </ReactMarkdown>
    </div>
  )
}
