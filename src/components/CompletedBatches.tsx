import { useEffect, useState } from "react";
import {
  archiveBatch,
  ApiRequestError,
  type BatchSummary,
  downloadBatchSubmissionXml,
  listBatches,
  unarchiveBatch,
} from "../services/api";

interface Props {
  /** Bump this to force a refetch (e.g. right after archiving the
   * currently-open batch from BatchPage, so it shows up here without a
   * manual page reload). */
  refreshKey?: number;
}

const TABS = [
  { key: "completed", label: "Completed Batches" },
  { key: "archived", label: "Archived Batches" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function reviewStatusLabel(status: string): string {
  switch (status) {
    case "exported":
      return "Exported";
    case "ready_for_export":
      return "Ready to export";
    case "archived":
      return "Archived";
    case "paused":
      return "Paused";
    default:
      return "In progress";
  }
}

/** Phase 7 of the batch-lifecycle spec: a simple, self-contained view of
 * batches that are done or put away, separate from (and never
 * interfering with) the active upload/review workflow above it. Reuses
 * the existing .document-list / .document-list-item / button styling -
 * no new visual language introduced. */
export default function CompletedBatches({ refreshKey }: Props) {
  const [tab, setTab] = useState<TabKey>("completed");
  const [batches, setBatches] = useState<BatchSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    listBatches(tab === "archived")
      .then((all) => {
        if (cancelled) return;
        // "Completed" means genuinely done (exported) - a batch that's
        // merely in progress or ready-but-not-yet-exported belongs in
        // the active workspace above, not here.
        setBatches(tab === "archived" ? all : all.filter((b) => b.review_status === "exported"));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiRequestError ? err.message : "Could not load batches.");
      });
    return () => {
      cancelled = true;
    };
  }, [tab, refreshKey]);

  async function handleToggleArchive(batch: BatchSummary) {
    setBusyId(batch.id);
    setActionError(null);
    try {
      if (batch.archived) {
        await unarchiveBatch(batch.id);
      } else {
        await archiveBatch(batch.id);
      }
      setBatches((prev) => (prev ? prev.filter((b) => b.id !== batch.id) : prev));
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : "Could not update this batch. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="document-list" style={{ marginTop: 28 }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`nav-tab${tab === t.key ? " active" : ""}`}
            style={tab === t.key ? { background: "var(--primary)", color: "white" } : { color: "var(--text)" }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </h2>

      {loadError && <div className="error-banner">{loadError}</div>}
      {actionError && <div className="error-banner">{actionError}</div>}

      {batches && batches.length === 0 && (
        <p className="batch-review-hint">
          {tab === "completed" ? "No exported batches yet." : "No archived batches."}
        </p>
      )}

      {batches?.map((b) => (
        <div className="document-list-item batch-image-row" key={b.id}>
          <div className="batch-image-info">
            <span className="filename">{b.id}</span>
            <span className="meta confidence-high">{reviewStatusLabel(b.review_status)}</span>
            <span className="meta">{b.image_count} image(s)</span>
            <span className="meta">Created {new Date(b.created_at).toLocaleString()}</span>
          </div>
          <div className="batch-image-actions">
            {b.review_status === "exported" && (
              <button
                className="secondary-button"
                style={{ padding: "6px 14px", fontSize: 13 }}
                onClick={() => downloadBatchSubmissionXml(b.id)}
              >
                Download XML again
              </button>
            )}
            <button
              className="secondary-button"
              style={{ padding: "6px 14px", fontSize: 13 }}
              disabled={busyId === b.id}
              onClick={() => handleToggleArchive(b)}
            >
              {busyId === b.id ? "Working…" : b.archived ? "Unarchive" : "Archive"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
