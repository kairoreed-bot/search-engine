import "dotenv/config"
import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { searchRouter } from "./routes"
import { initReranker, rerank } from "./reranker"
import { fetchPages } from "./search"
import { renderSearchPage } from "./ssr"
import { closeRedis, memGet, memSet } from "./cache"
import { existsSync, readFileSync, statSync } from "fs"
import { join, resolve } from "path"

const PORT = parseInt(process.env.PORT || "3000", 10)
const DIST_DIR = join(process.cwd(), "dist", "client")

function serveStatic(pathname: string): Response | undefined {
  const filePath = join(DIST_DIR, pathname)
  if (!filePath.startsWith(resolve(DIST_DIR))) return undefined
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) return undefined

  const ext = pathname.split(".").pop()?.toLowerCase()
  const mime: Record<string, string> = {
    html: "text/html",
    js: "application/javascript",
    css: "text/css",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    webp: "image/webp",
    woff: "font/woff",
    woff2: "font/woff2",
  }

  return new Response(readFileSync(filePath), {
    headers: { "Content-Type": mime[ext || ""] || "application/octet-stream" },
  })
}

async function main() {
  await initReranker()

  const app = new Elysia()
    .use(cors())
    .use(searchRouter)
    .get("/search", async ({ query }) => {
      if (process.env.NODE_ENV !== "production") {
        const index = serveStatic("index.html")
        if (index) return index
        return new Response("Not found", { status: 404 })
      }

      const q = (query.q || "").toString().trim()
      if (!q) {
        return new Response(null, {
          status: 302,
          headers: { Location: "/" },
        })
      }

      try {
        const memKey = `results:${q}`
        let results = memGet<any[]>(memKey)
        if (!results) {
          const allResults = await fetchPages(q, 3)
          results = await rerank(q, allResults, 30)
          memSet(memKey, results, 300_000)
        }
        const html = renderSearchPage(q, results)
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      } catch (err) {
        console.error("[ssr] search failed:", err)
        const index = serveStatic("index.html")
        if (index) return index
        return new Response("Search failed", { status: 500 })
      }
    })
    .get("/*", ({ path }) => {
      if (path.startsWith("/api")) return new Response("Not found", { status: 404 })
      const response = serveStatic(path)
      if (response) return response

      // SPA fallback
      const index = serveStatic("index.html")
      if (index) return index
      return new Response("Not found", { status: 404 })
    })
    .listen(PORT, () => {
      console.log(`[server] running at http://localhost:${PORT}`)
    })

  // graceful shutdown
  process.on("SIGINT", async () => {
    await closeRedis()
    process.exit(0)
  })
  process.on("SIGTERM", async () => {
    await closeRedis()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error("[server] fatal:", err)
  process.exit(1)
})
