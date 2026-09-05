import { useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import TopNav from "./components/TopNav";
import Footer from "./components/Footer";
import ExamModeModal from "./components/ExamModeModal";
import Home from "./pages/Home";
import Listening from "./pages/Listening";
import Reading from "./pages/Reading";
import Writing from "./pages/Writing";
import Speaking from "./pages/Speaking";
import Report from "./pages/Report";
import ErrorBook from "./pages/ErrorBook";
import { storage } from "./services/storage";
import type { ExamMode } from "./data/types";

export default function App() {
  const [mode, setMode] = useState<ExamMode | null>(() => storage.getMode());
  const [showModal, setShowModal] = useState(false);
  const loc = useLocation();
  const inExam = /^\/(listening|reading|writing)\//.test(loc.pathname);

  useEffect(() => {
    if (!mode) setShowModal(true);
  }, [mode]);

  return (
    <div className="app">
      {!inExam && <TopNav mode={mode} onChangeMode={() => setShowModal(true)} />}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/listening/:id" element={<Listening />} />
          <Route path="/reading/:id" element={<Reading />} />
          <Route path="/writing/:id" element={<Writing />} />
          <Route path="/speaking" element={<Speaking />} />
          <Route path="/report/:id" element={<Report />} />
          <Route path="/errors" element={<ErrorBook />} />
          <Route path="*" element={<div className="empty">页面不存在</div>} />
        </Routes>
      </main>
      {!inExam && <Footer />}
      {showModal && (
        <ExamModeModal
          current={mode}
          onSelect={(m) => {
            storage.setMode(m);
            setMode(m);
            setShowModal(false);
          }}
          onClose={mode ? () => setShowModal(false) : undefined}
        />
      )}
    </div>
  );
}
