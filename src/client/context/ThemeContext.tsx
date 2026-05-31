import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

const THEMES = [
  "dark",
  "light",
  "synthwave",
  "dracula",
  "night",
  "coffee",
  "sunset",
  "winter",
  "forest",
  "aqua",
] as const

type Theme = (typeof THEMES)[number]

type ThemeCtx = {
  theme: Theme
  themes: typeof THEMES
  setTheme: (t: Theme) => void
  cycle: () => void
}

const Ctx = createContext<ThemeCtx | null>(null)

const STORAGE_KEY = "search-engine-theme"

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark"
    return (localStorage.getItem(STORAGE_KEY) as Theme) || "dark"
  })

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)

  const cycle = () => {
    const idx = THEMES.indexOf(theme)
    setThemeState(THEMES[(idx + 1) % THEMES.length])
  }

  return <Ctx.Provider value={{ theme, themes: THEMES, setTheme, cycle }}>{children}</Ctx.Provider>
}

export function useTheme() {
  const c = useContext(Ctx)
  if (!c) throw new Error("useTheme outside ThemeProvider")
  return c
}
