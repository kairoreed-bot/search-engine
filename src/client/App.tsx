import { Routes, Route } from "react-router-dom"
import HomePage from "./pages/HomePage"
import ResultsPage from "./pages/ResultsPage"

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<ResultsPage />} />
      </Routes>
    </div>
  )
}
