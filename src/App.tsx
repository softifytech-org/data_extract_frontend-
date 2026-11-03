import { useState } from "react";
import BatchPage from "./pages/BatchPage";
import MainPage from "./pages/MainPage";
import ResumeBanner from "./components/ResumeBanner";

type View =
  | { kind: "single" }
  | { kind: "batch" }
  | { kind: "review"; documentId: string; batchId?: string };

// Deliberately NOT persisted across a real page reload (no localStorage) -
// an earlier version remembered the last view/batch so a refresh would
// resume it, but that was reported as confusing in practice (a refresh
// kept landing back on old work instead of a clean start, even after
// that work was done). `activeBatchId`/`view` are plain in-memory React
// state now: they still let you bounce between "review" and "batch"
// freely WITHIN the same session (no data lost, same batch reopens), but
// an actual browser refresh always starts clean, no exceptions.
export default function App() {
  const [view, setView] = useState<View>({ kind: "single" });
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  const navMode = view.kind === "review" ? "batch" : view.kind;

  // Resume is always an explicit operator action - this only sets state,
  // it is never called automatically on load (see the comment on `view`
  // above for why an earlier auto-resume-on-refresh was tried and
  // reverted). Landing on the batch screen with no specific document
  // (documentId === null, e.g. the operator hasn't opened one yet) is a
  // perfectly valid resume target, not a missing case.
  function handleResume(batchId: string, documentId: string | null) {
    setActiveBatchId(batchId);
    setView(documentId ? { kind: "review", documentId, batchId } : { kind: "batch" });
  }

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
      <ResumeBanner onResume={handleResume} />
      <main className="app-main">
        {view.kind === "single" && <MainPage />}
        {view.kind === "batch" && (
          <BatchPage
            initialBatchId={activeBatchId ?? undefined}
            onBatchCreated={setActiveBatchId}
            onReviewDocument={(documentId, batchId) => setView({ kind: "review", documentId, batchId })}
            onBatchCleared={() => setActiveBatchId(null)}
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
