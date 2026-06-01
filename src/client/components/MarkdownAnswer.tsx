import { useState, useEffect, useRef, type MutableRefObject } from "react"
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

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function citeHtml(url: string, title: string, num: number): string {
  let favicon = ""
  try {
    const u = new URL(url)
    favicon = `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`
  } catch { /* use empty */ }
  return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"
    style="background-color:oklch(var(--p)/0.1);color:oklch(var(--p))"
    class="__cite__ inline-flex items-center gap-px px-1 py-[1px] rounded text-[11px] font-medium leading-none align-baseline no-underline cursor-pointer transition-colors"
    title="${esc(title)}"
  ><img src="${esc(favicon)}" alt="" class="size-3 rounded-[1px] bg-base-300" loading="lazy"><span>${num}</span></a>`
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

  if (!visible) return null

  // Replace [N] markers with fully-formed inline HTML anchors
  const processed = visible.replace(
    /\[(\d+)\]/g,
    (_, n) => {
      const idx = parseInt(n, 10) - 1
      const r = resultsRef.current[idx]
      if (!r) return `<sup class="text-primary font-bold text-[10px]">[${idx + 1}]</sup>`
      return citeHtml(r.url, r.title, idx + 1)
    },
  )

  return (
    <div className="prose prose-sm max-w-none [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ol]:my-1">
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
