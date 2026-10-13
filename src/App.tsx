import { useEffect, useState } from "react";
import BatchPage from "./pages/BatchPage";
import MainPage from "./pages/MainPage";

type View =
  | { kind: "single" }
  | { kind: "batch" }
  | { kind: "review"; documentId: string; batchId?: string };

const VIEW_STORAGE_KEY = "app_view";
const BATCH_STORAGE_KEY = "app_active_batch_id";

// A real page refresh resets all React state - without this, "Batch
// upload" would come back empty after a refresh even though the batch
// itself is still there on the backend (confirmed directly: this gap
// was found by a real end-to-end browser test, not guessed at).
function loadInitialView(): View {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as View;
  } catch {
    // corrupted or inaccessible storage - fall back to the default view
  }
  return { kind: "single" };
}

function loadInitialBatchId(): string | null {
  try {
    return localStorage.getItem(BATCH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export default function App() {
  const [view, setView] = useState<View>(loadInitialView);
  // Remembered independently of `view` so switching to "review" and back
  // to "batch" (or refreshing the page entirely) reopens the SAME batch
  // rather than losing it.
  const [activeBatchId, setActiveBatchId] = useState<string | null>(loadInitialBatchId);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
    } catch {
      // per-viewer convenience only - never required for correctness
    }
  }, [view]);

  useEffect(() => {
    try {
      if (activeBatchId) localStorage.setItem(BATCH_STORAGE_KEY, activeBatchId);
      else localStorage.removeItem(BATCH_STORAGE_KEY);
    } catch {
      // per-viewer convenience only - never required for correctness
    }
  }, [activeBatchId]);

  const navMode = view.kind === "review" ? "batch" : view.kind;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Medical Insurance - AI Data Entry Automation</h1>
          <div className="subtitle">
            {navMode === "single"
              ? "Upload a document, review the extracted fields, approve."
              : "Upload 1-40 images at once; review and approve each, then submit the batch."}
          </div>
        </div>
        <nav className="app-nav">
          <button
            className={`nav-tab${navMode === "single" ? " active" : ""}`}
            onClick={() => setView({ kind: "single" })}
          >
            Single document
          </button>
          <button
            className={`nav-tab${navMode === "batch" ? " active" : ""}`}
            onClick={() => setView({ kind: "batch" })}
          >
            Batch upload
          </button>
        </nav>
      </header>
      <main className="app-main">
        {view.kind === "single" && <MainPage />}
        {view.kind === "batch" && (
          <BatchPage
            initialBatchId={activeBatchId ?? undefined}
            onBatchCreated={setActiveBatchId}
            onReviewDocument={(documentId, batchId) => setView({ kind: "review", documentId, batchId })}
          />
        )}
        {view.kind === "review" && (
          <MainPage
            initialDocumentId={view.documentId}
            batchId={view.batchId}
            onBack={() => setView({ kind: "batch" })}
            onNavigateToDocument={(documentId) => setView({ kind: "review", documentId, batchId: view.batchId })}
          />
        )}
      </main>
    </div>
  );
}
