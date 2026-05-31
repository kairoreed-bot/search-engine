import { useState, useEffect, useMemo, useRef, type MutableRefObject } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import Citation from "./Citation"

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
 * Split text on citation markers [N] and interleave <Citation /> components inline.
 */
function renderWithCitations(
  text: string,
  getResult: (i: number) => { title: string; url: string } | undefined,
): React.ReactNode[] {
  const parts = text.split(/(?=\[\d+\])|(?<=\[\d+\])/g)
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/)
    if (m) {
      return <Citation key={`c-${i}`} idx={parseInt(m[1], 10) - 1} getResult={getResult} />
    }
    if (!part.trim()) return null
    return (
      <ReactMarkdown
        key={`t-${i}`}
        remarkPlugins={[remarkGfm]}
        components={{ ...mdComponents, p: ({ children }: any) => <>{children}</> }}
      >
        {part}
      </ReactMarkdown>
    )
  })
}

export default function MarkdownAnswer({ text, done, resultsRef }: Props) {
  const [visible, setVisible] = useState("")
  const prevLenRef = useRef(0)

  const getResult = useMemo(
    () => (i: number) => resultsRef.current[i],
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

  if (!visible) return null

  // Split on double-newlines for paragraph grouping
  const blocks = visible.split(/\n\n+/)
  const nodes: React.ReactNode[] = []

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi]!
    nodes.push(
      <p key={`b-${bi}`} className="my-2">
        {renderWithCitations(block, getResult)}
      </p>,
    )
  }

  return (
    <div className="prose prose-sm max-w-none [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
      {nodes}
    </div>
  )
}
