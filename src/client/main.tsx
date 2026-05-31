import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { ThemeProvider } from "./context/ThemeContext"
import App from "./App"
import "./index.css"

const rootEl = document.getElementById("root")!
const hasSsrData = typeof (window as any).__INITIAL_DATA__ !== "undefined"
const renderFn = hasSsrData ? ReactDOM.hydrateRoot : ReactDOM.createRoot

const tree = (
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)

if (hasSsrData) {
  renderFn(rootEl, tree)
} else {
  renderFn(rootEl).render(tree)
}
