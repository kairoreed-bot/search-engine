import { renderToString } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import App from "../client/App"
import { ThemeProvider } from "../client/context/ThemeContext"
import { type SearchResult } from "./reranker"
import { readFileSync } from "fs"
import { join } from "path"

let htmlTemplate: string | null = null

function getHtmlTemplate(): string {
  if (!htmlTemplate) {
    htmlTemplate = readFileSync(
      join(process.cwd(), "dist", "client", "index.html"),
      "utf-8",
    )
  }
  return htmlTemplate
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function renderSearchPage(query: string, results: SearchResult[]): string {
  const appHtml = renderToString(
    <MemoryRouter initialEntries={[`/search?q=${encodeURIComponent(query)}`]}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </MemoryRouter>,
  )

  const template = getHtmlTemplate()
  const initialState = JSON.stringify({ query, results })

  return template
    .replace(
      '<div id="root"></div>',
      `<div id="root">${appHtml}</div>\n    <script>window.__INITIAL_DATA__ = ${initialState}</script>`,
    )
    .replace(/<title>.*?<\/title>/, `<title>${esc(query)} - search results</title>`)
}
