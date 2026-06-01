import { useMemo } from "react"

interface CitationProps {
  /** 0-based index into the results array */
  idx: number
  /** The results dataset — we read title / url from here */
  getResult: (i: number) => { title: string; url: string } | undefined
}

export default function Citation({ idx, getResult }: CitationProps) {
  const r = useMemo(() => getResult(idx), [idx, getResult])

  if (!r) {
    return <sup className="text-primary font-bold text-[10px]">[{idx + 1}]</sup>
  }

  let host = ""
  let favicon = ""
  try {
    const u = new URL(r.url)
    host = u.hostname.replace(/^www\./, "")
    favicon = `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`
  } catch {
    host = r.url
  }

  return (
    <a
      href={r.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 align-baseline
        px-1 py-[1px] rounded
        text-[11px] font-medium leading-none
        bg-primary/10 text-primary
        hover:bg-primary/20 hover:underline
        transition-colors no-underline"
      style={{ textDecoration: "none" }}
      title={r.title}
    >
      {favicon && (
        <img src={favicon} alt="" className="size-3 rounded-[1px] bg-base-300" loading="lazy" />
      )}
      <span>{idx + 1}</span>
    </a>
  )
}
