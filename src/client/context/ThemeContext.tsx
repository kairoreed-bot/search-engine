import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Sun, Moon, Sparkles, Ghost, CloudMoon, CupSoda, Sunset, Snowflake, TreePine, Waves } from "lucide-react"

const THEMES = [
  { id: "dark", label: "Dark", icon: Moon },
  { id: "light", label: "Light", icon: Sun },
  { id: "synthwave", label: "Synthwave", icon: Sparkles },
  { id: "dracula", label: "Dracula", icon: Ghost },
  { id: "night", label: "Night", icon: CloudMoon },
  { id: "coffee", label: "Coffee", icon: CupSoda },
  { id: "sunset", label: "Sunset", icon: Sunset },
  { id: "winter", label: "Winter", icon: Snowflake },
  { id: "forest", label: "Forest", icon: TreePine },
  { id: "aqua", label: "Aqua", icon: Waves },
] as const

type ThemeInfo = (typeof THEMES)[number]
type Theme = ThemeInfo["id"]

type ThemeCtx = {
  theme: Theme
  themes: typeof THEMES
  current: ThemeInfo
  setTheme: (t: Theme) => void
  cycle: () => void
}

const Ctx = createContext<ThemeCtx | null>(null)
const STORAGE_KEY = "search…heme"

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark"
    return (localStorage.getItem(STORAGE_KEY) as Theme) || "dark"
  })

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0]!

  const setTheme = (t: Theme) => setThemeState(t)

  const cycle = () => {
    const idx = THEMES.findIndex((t) => t.id === theme)
    setThemeState(THEMES[(idx + 1) % THEMES.length]!.id)
  }

  return (
    <Ctx.Provider value={{ theme, themes: THEMES, current, setTheme, cycle }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTheme() {
  const c = useContext(Ctx)
  if (!c) throw new Error("useTheme outside ThemeProvider")
  return c
}
