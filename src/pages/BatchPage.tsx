import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiRequestError,
  BatchDetail,
  BatchNotReadyError,
  BatchSubmissionStatus,
  type DocumentLayout,
  downloadBatchDocumentExcel,
  downloadBatchDocumentXml,
  downloadBatchSubmissionXml,
  getBatch,
  getBatchSubmissionStatus,
  submitBatch,
  uploadBatch,
} from "../services/api";

const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"];
const ACCEPTED = ACCEPTED_EXTENSIONS.join(",");
const MIN_IMAGES = 1;
const MAX_IMAGES = 40;
// Must match backend/app/core/config.py's max_upload_size_mb default (15) -
// this is a client-side pre-check for fast feedback, not the enforcement
// boundary; the backend re-validates every file regardless.
const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACTIVE_STATUSES = new Set(["queued", "processing"]);

function statusBadgeClass(status: string): string {
  if (status === "completed" || status === "needs_review") return "confidence-high";
  if (status === "failed") return "confidence-low";
  return "confidence-medium";
}

/** name+size+lastModified identifies the same file picked twice (e.g. the
 * same drag-drop repeated, or re-opening the picker and re-selecting
 * something already added) without rejecting two different files that
 * merely share a filename - content hashing would be the only stronger
 * check, and isn't worth reading every file's bytes just to dedupe. */
function fileIdentity(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

interface SelectionResult {
  files: File[];
  messages: string[];
}

/** Pure function: given the current selection and a freshly-captured
 * array of newly picked/dropped files, returns the next selection plus
 * a human-readable explanation of anything that was NOT added (wrong
 * type, too large, duplicate, or over the batch limit) - nothing is
 * ever silently dropped. */
function mergeSelection(current: File[], incoming: File[]): SelectionResult {
  const existingIds = new Set(current.map(fileIdentity));
  const messages: string[] = [];

  const invalidType: string[] = [];
  const tooLarge: string[] = [];
  const duplicates: string[] = [];
  const accepted: File[] = [];

  for (const file of incoming) {
    const id = fileIdentity(file);
    if (existingIds.has(id)) {
      duplicates.push(file.name);
      continue;
    }
    if (!ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))) {
      invalidType.push(file.name);
      continue;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      tooLarge.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      continue;
    }
    existingIds.add(id); // guards against duplicates WITHIN the same incoming batch too
    accepted.push(file);
  }

  const remainingCapacity = MAX_IMAGES - current.length;
  const overLimit = accepted.slice(remainingCapacity);
  const withinLimit = accepted.slice(0, Math.max(0, remainingCapacity));

  if (invalidType.length > 0) {
    messages.push(`Unsupported file type, skipped: ${invalidType.join(", ")}`);
  }
  if (tooLarge.length > 0) {
    messages.push(`Exceeds the ${MAX_FILE_SIZE_MB}MB limit, skipped: ${tooLarge.join(", ")}`);
  }
  if (duplicates.length > 0) {
    messages.push(`Already selected, skipped: ${duplicates.join(", ")}`);
  }
  if (overLimit.length > 0) {
    messages.push(
      `A batch may contain at most ${MAX_IMAGES} images - ${overLimit.length} file(s) were not added ` +
        `(${current.length + withinLimit.length}/${MAX_IMAGES} selected): ${overLimit.map((f) => f.name).join(", ")}`
    );
  }

  return { files: [...current, ...withinLimit], messages };
}

function statusLabel(status: string): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "OCR in progress…";
    case "needs_review":
      return "OCR completed · Needs review";
    case "completed":
      return "OCR completed";
    case "failed":
      return "Processing failed";
    default:
      return status;
  }
}

interface Props {
  /** Reopens the same batch this screen was showing before the user
   * navigated away to review an image - see App.tsx, which remembers
   * the active batch id across that round trip. */
  initialBatchId?: string;
  /** Called once a new batch is created, so the parent can remember its
   * id and restore this same batch if the user later navigates away and
   * back (e.g. after reviewing an image). */
  onBatchCreated?: (batchId: string) => void;
  /** Opens the single-document review screen for one image in this
   * batch - see App.tsx's "review" view. Passes this batch's own id too,
   * so the review screen can offer Previous/Next-image-in-batch
   * navigation without the reviewer ever coming back to this screen
   * between images. */
  onReviewDocument?: (documentId: string, batchId: string) => void;
}

/**
 * Batch upload screen: no sign-in, no account, no credential of any
 * kind - open the page and use it. Upload 1-40 images at once, watch
 * each image move through the durable queue/worker
 * (app/services/queue/worker.py) until it's reviewable, review/edit/
 * approve each one (reusing the single-document review screen via
 * onReviewDocument), then submit the whole batch for one combined XML
 * export. This application has no authentication anywhere (explicit
 * decision) - anyone who can reach this page can see and act on any
 * batch, not just ones they created.
 */
export default function BatchPage({ initialBatchId, onBatchCreated, onReviewDocument }: Props) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectionNotices, setSelectionNotices] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [submission, setSubmission] = useState<BatchSubmissionStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitBlockers, setSubmitBlockers] = useState<string[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // One layout applies to the whole batch (see backend: app/api/batches.py's
  // create_batch) - "old" pre-selected as the majority real-world format.
  const [layout, setLayout] = useState<DocumentLayout>("old");
  const [lastUploadedLayout, setLastUploadedLayout] = useState<DocumentLayout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    if (!initialBatchId) return;
    let cancelled = false;
    getBatch(initialBatchId)
      .then((detail) => {
        if (cancelled) return;
        setBatch(detail);
        if (ACTIVE_STATUSES.has(detail.status)) startPolling(initialBatchId);
      })
      .catch(() => {
        // the batch may no longer exist or be reachable - the upload
        // screen is still fully usable on its own, so this fails quietly
        // rather than blocking the page with an error banner.
      });
    getBatchSubmissionStatus(initialBatchId)
      .then((status) => {
        if (!cancelled) setSubmission(status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBatchId]);

  function startPolling(batchId: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const detail = await getBatch(batchId);
        setBatch(detail);
        if (!ACTIVE_STATUSES.has(detail.status)) stopPolling();
      } catch {
        // transient poll failure - next tick retries; the user still sees
        // the last known state rather than an alarming error banner.
      }
    }, 2500);
  }

  // `files` is captured into a plain array by the caller (onChange/onDrop)
  // BEFORE this runs, specifically so nothing here ever reads a live
  // FileList/DataTransfer object whose underlying selection could already
  // have moved on (e.g. the input's own value being reset right after
  // the picker closes) - see the onChange handler below.
  function addFiles(incoming: File[]) {
    setUploadError(null);
    setSelectedFiles((prev) => {
      const result = mergeSelection(prev, incoming);
      setSelectionNotices(result.messages);
      return result.files;
    });
  }

  function removeFile(id: string) {
    setSelectedFiles((prev) => prev.filter((f) => fileIdentity(f) !== id));
  }

  async function handleUpload() {
    if (selectedFiles.length < MIN_IMAGES) {
      setUploadError(`Select at least ${MIN_IMAGES} image.`);
      return;
    }
    if (selectedFiles.length > MAX_IMAGES) {
      setUploadError(`A batch may contain at most ${MAX_IMAGES} images.`);
      return;
    }
    setUploading(true);
    setUploadError(null);
    setSubmission(null);
    setSubmitBlockers(null);
    setSubmitError(null);
    try {
      const result = await uploadBatch(selectedFiles, layout);
      const detail = await getBatch(result.batch_id);
      setBatch(detail);
      setLastUploadedLayout(layout);
      onBatchCreated?.(result.batch_id);
      startPolling(result.batch_id);
      // Cleared only once every step above has actually succeeded - on
      // any failure (the upload call itself, or the follow-up fetch),
      // the selection is left exactly as the user had it so Upload can
      // simply be clicked again without reselecting anything.
      setSelectedFiles([]);
      setSelectionNotices([]);
    } catch (err) {
      setUploadError(err instanceof ApiRequestError ? err.message : "Batch upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmitBatch() {
    if (!batch) return;
    setSubmitting(true);
    setSubmitBlockers(null);
    setSubmitError(null);
    try {
      await submitBatch(batch.id);
      const status = await getBatchSubmissionStatus(batch.id);
      setSubmission(status);
    } catch (err) {
      if (err instanceof BatchNotReadyError) {
        setSubmitBlockers(err.blockers);
      } else {
        setSubmitError(err instanceof ApiRequestError ? err.message : "Could not submit this batch. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          // Captured into a plain array synchronously, right here, before
          // the input's own value is cleared below - see addFiles' own
          // comment for why that ordering matters.
          const incoming = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          if (incoming.length > 0) addFiles(incoming);
        }}
      />

      <div className="layout-selector" role="radiogroup" aria-label="Document form type for this batch">
        <span className="layout-selector-label">Which form do ALL images in this batch use?</span>
        <button
          type="button"
          role="radio"
          aria-checked={layout === "old"}
          className={`layout-option${layout === "old" ? " selected" : ""}`}
          onClick={() => setLayout("old")}
        >
          <span className="layout-option-title">Standard Form ✓ Recommended</span>
          <span className="layout-option-hint">Clean grid layout, fields lined up in rows/columns</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={layout === "new"}
          className={`layout-option${layout === "new" ? " selected" : ""}`}
          onClick={() => setLayout("new")}
        >
          <span className="layout-option-title">Compact Form</span>
          <span className="layout-option-hint">Dense paragraph text, no grid lines</span>
        </button>
        <span className="layout-selector-note">
          Every image in one batch must use the same form - upload a separate batch for a different form type.
        </span>
      </div>

      <div
        className={`dropzone${dragOver ? " dragover" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={`Select or drop up to ${MAX_IMAGES} images or PDFs to upload`}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const incoming = Array.from(e.dataTransfer.files);
          if (incoming.length > 0) addFiles(incoming);
        }}
      >
        Click or drag 1-{MAX_IMAGES} images/PDFs here
      </div>

      {selectionNotices.length > 0 && (
        <div className="error-banner">
          {selectionNotices.map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="document-list" style={{ marginTop: 16 }}>
          <h2>
            {selectedFiles.length} of {MAX_IMAGES} file(s) selected
          </h2>
          {selectedFiles.map((f) => {
            const id = fileIdentity(f);
            return (
              <div className="document-list-item" key={id}>
                <span className="filename">{f.name}</span>
                <span>
                  <span className="meta">{(f.size / 1024).toFixed(0)} KB</span>
                  {"  "}
                  <button
                    className="secondary-button"
                    style={{ padding: "2px 10px", fontSize: 12 }}
                    onClick={() => removeFile(id)}
                  >
                    Remove
                  </button>
                </span>
              </div>
            );
          })}
          <button className="primary-button" disabled={uploading} onClick={handleUpload} style={{ marginTop: 8 }}>
            {uploading ? "Uploading…" : `Upload ${selectedFiles.length} image(s)`}
          </button>
        </div>
      )}

      {uploadError && <div className="error-banner">{uploadError}</div>}

      {batch && (
        <div className="document-list" style={{ marginTop: 24 }}>
          <h2>
            Batch review · {batch.image_count} image(s){ACTIVE_STATUSES.has(batch.status) ? " · refreshing…" : ""}
            {lastUploadedLayout && (
              <span className="layout-badge" style={{ marginLeft: 10 }}>
                Form type: <strong>{lastUploadedLayout === "new" ? "Compact Form" : "Standard Form"}</strong>
              </span>
            )}
          </h2>
          <p className="batch-review-hint">
            Select an image to inspect its extracted records. Review and approve each record before submitting
            the batch.
          </p>
          {batch.images.map((img) => {
            const reviewable = img.status === "completed" || img.status === "needs_review";
            return (
              <div className="document-list-item batch-image-row" key={img.document_id}>
                <div className="batch-image-info">
                  <span className="filename">
                    #{img.position + 1} {img.original_filename}
                  </span>
                  <span className={`meta overall-confidence ${statusBadgeClass(img.status)}`} style={{ padding: "2px 8px" }}>
                    {statusLabel(img.status)}
                  </span>
                  {img.status === "failed" && img.error && (
                    <span className="meta" title={img.error}>
                      (error - hover for details)
                    </span>
                  )}
                </div>
                <div className="batch-image-actions">
                  {reviewable && onReviewDocument && (
                    <button
                      className="primary-button"
                      style={{ padding: "6px 14px", fontSize: 13 }}
                      onClick={() => onReviewDocument(img.document_id, batch.id)}
                      aria-label={`Review image ${img.position + 1}`}
                    >
                      Review
                    </button>
                  )}
                  {reviewable && (
                    <>
                      <button
                        className="secondary-button"
                        style={{ padding: "2px 10px", fontSize: 12 }}
                        onClick={() => downloadBatchDocumentXml(img.document_id)}
                      >
                        XML
                      </button>
                      <button
                        className="secondary-button"
                        style={{ padding: "2px 10px", fontSize: 12 }}
                        onClick={() => downloadBatchDocumentExcel(img.document_id)}
                      >
                        Excel
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            {submission?.submitted ? (
              <div className="approved-banner">
                <span>
                  Batch submitted · {submission.record_count} record(s)
                  {submission.submitted_at ? ` on ${new Date(submission.submitted_at).toLocaleString()}` : ""}
                </span>
                <span>
                  <button className="secondary-button" onClick={() => downloadBatchSubmissionXml(batch.id)}>
                    Download batch XML
                  </button>
                </span>
              </div>
            ) : (
              <button className="primary-button" disabled={submitting} onClick={handleSubmitBatch}>
                {submitting ? "Submitting…" : "Submit batch"}
              </button>
            )}
            {submitBlockers && submitBlockers.length > 0 && (
              <div className="error-banner">
                <strong>Batch is not ready to submit:</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {submitBlockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {submitError && <div className="error-banner">{submitError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
