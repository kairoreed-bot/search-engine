import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App"
import "./index.css"

const rootEl = document.getElementById("root")!
const hasSsrData = typeof (window as any).__INITIAL_DATA__ !== "undefined"

if (hasSsrData) {
  ReactDOM.hydrateRoot(
    rootEl,
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
}
