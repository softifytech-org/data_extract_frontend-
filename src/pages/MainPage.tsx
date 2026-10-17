import { useEffect, useMemo, useRef, useState } from "react";
import DocumentViewer from "../components/DocumentViewer";
import LegacyForm from "../components/LegacyForm";
import LegacyToolbar from "../components/LegacyToolbar";
import RecordList from "../components/RecordList";
import { buildBlankFields } from "../constants/blankFields";
import {
  ApiRequestError,
  approveRecord,
  type BatchImageStatus,
  type DocumentLayout,
  excelExportUrl,
  getBatch,
  getDocument,
  processDocument,
  submissionXmlDownloadUrl,
  submitDocument,
  updateFields,
  uploadDocument,
  xmlExportUrl,
} from "../services/api";
import type { DocumentRecord, ExtractedField } from "../types/document";

const ACCEPTED = ".jpg,.jpeg,.png,.pdf";
const BLANK_FIELDS = buildBlankFields();

function confidenceTier(score: number | null): "high" | "medium" | "low" {
  if (score === null) return "low";
  if (score >= 95) return "high";
  if (score >= 80) return "medium";
  return "low";
}

interface Props {
  /** When set, MainPage loads this EXISTING, already-processed document
   * on mount instead of waiting for an upload - this is how a batch
   * image's "Review" button opens it here, reusing every bit of the
   * single-document review/edit/approve logic below unchanged rather
   * than duplicating it. */
  initialDocumentId?: string;
  /** Shown as a distinct "Back to batch" link when provided - only set
   * when MainPage was opened FROM the batch review screen. */
  onBack?: () => void;
  /** The batch this document belongs to, when opened from batch review -
   * enables Previous/Next-image-in-batch navigation and auto-advance on
   * completion, so a reviewer working through a batch never has to
   * bounce back to the batch screen between images. */
  batchId?: string;
  /** Switches the review screen to a DIFFERENT document within the same
   * batch, without leaving this screen - see App.tsx's "review" view. */
  onNavigateToDocument?: (documentId: string) => void;
}

/**
 * One persistent screen, matching the reference legacy app: the toolbar and
 * the full field layout are visible from the start (blank), not behind a
 * separate "upload" landing page. Selecting an image uploads + processes in
 * place and the SAME form fills in once extraction finishes.
 */
export default function MainPage({ initialDocumentId, onBack, batchId, onNavigateToDocument }: Props) {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [record, setRecord] = useState<DocumentRecord | null>(null);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(1);
  const [draft, setDraft] = useState<Record<string, ExtractedField>>(BLANK_FIELDS);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(!!initialDocumentId);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showData, setShowData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  // "old" is pre-selected: it's the majority document format (~90% of
  // real volume) - see the layout selector rendered below the toolbar.
  const [layout, setLayout] = useState<DocumentLayout>("old");
  const [batchImages, setBatchImages] = useState<BatchImageStatus[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!batchId) {
      setBatchImages(null);
      return;
    }
    let cancelled = false;
    getBatch(batchId)
      .then((detail) => {
        if (!cancelled) setBatchImages(detail.images);
      })
      .catch(() => {
        // Batch-navigation is a convenience, not a requirement - the
        // single-document review below still works fully without it.
      });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const batchPosition = useMemo(() => {
    if (!batchImages || !documentId) return -1;
    return batchImages.findIndex((img) => img.document_id === documentId);
  }, [batchImages, documentId]);

  const adjacentBatchDocument = (step: 1 | -1): string | null => {
    if (!batchImages || batchPosition === -1) return null;
    const next = batchImages[batchPosition + step];
    return next ? next.document_id : null;
  };

  useEffect(() => {
    if (!initialDocumentId) return;
    let cancelled = false;
    setLoadingExisting(true);
    setError(null);
    getDocument(initialDocumentId)
      .then((full) => {
        if (cancelled) return;
        setDocumentId(full.document_id);
        setRecord(full);
        setDraft(full.records[0]?.fields ?? BLANK_FIELDS);
        setSelectedRecordIndex(full.records[0]?.record_index ?? 1);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiRequestError ? err.message : "Could not load this document.");
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocumentId]);

  const currentEntry = useMemo(
    () => record?.records.find((r) => r.record_index === selectedRecordIndex) ?? null,
    [record, selectedRecordIndex]
  );

  const dirtyFields = useMemo(() => {
    if (!currentEntry) return {} as Record<string, string | null>;
    const changes: Record<string, string | null> = {};
    for (const [name, field] of Object.entries(draft)) {
      const original = currentEntry.fields[name]?.value ?? null;
      if (field.value !== original) changes[name] = field.value;
    }
    return changes;
  }, [draft, currentEntry]);

  const hasUnsavedChanges = Object.keys(dirtyFields).length > 0;

  // Native browser warning on an actual refresh/close/tab-close - the
  // auto-save-on-navigate guards above only cover navigation WITHIN this
  // app; a real page reload bypasses React entirely, so this is the only
  // way to warn before an in-progress edit is lost that way.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  async function handleFileSelected(file: File) {
    setError(null);
    setUploading(true);
    setRecord(null);
    setDraft(BLANK_FIELDS);
    setSelectedField(null);
    try {
      const uploaded = await uploadDocument(file, layout);
      setDocumentId(uploaded.document_id);
      setUploading(false);
      setProcessing(true);
      try {
        const processed = await processDocument(uploaded.document_id);
        // processDocument's response is a status summary; fetch the full
        // record with extracted fields once processing has finished.
        const full = await getDocument(processed.document_id);
        setRecord(full);
        setDraft(full.records[0]?.fields ?? BLANK_FIELDS);
        setSelectedRecordIndex(full.records[0]?.record_index ?? 1);
      } catch (err) {
        setError(
          err instanceof ApiRequestError ? err.message : "Processing failed unexpectedly. Please try again."
        );
      } finally {
        setProcessing(false);
      }
    } catch (err) {
      setUploading(false);
      setError(err instanceof ApiRequestError ? err.message : "Upload failed. Please try again.");
    }
  }

  function handleFieldChange(fieldName: string, value: string) {
    setDraft((prev) => ({
      ...prev,
      [fieldName]: { ...prev[fieldName], value: value.length ? value : null },
    }));
  }

  function handleCancelEdit() {
    if (currentEntry) setDraft(currentEntry.fields);
  }

  async function persistDraft(recordIndex: number, changes: Record<string, string | null>) {
    if (!documentId || Object.keys(changes).length === 0) return record;
    const updated = await updateFields(documentId, recordIndex, changes);
    setRecord(updated);
    return updated;
  }

  async function handleSave() {
    if (!hasUnsavedChanges) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await persistDraft(selectedRecordIndex, dirtyFields);
      const entry = updated?.records.find((r) => r.record_index === selectedRecordIndex);
      if (entry) setDraft(entry.fields);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  /** Used by every navigation action that leaves this document entirely
   * (Back to batch, Prev/Next image) - goToRecord already auto-saves when
   * switching records within the SAME document, but those three actions
   * previously called onBack/onNavigateToDocument directly with no save
   * at all, silently discarding an in-progress edit. Returns false (and
   * leaves the current draft/error state alone) if the save fails, so the
   * caller can refuse to navigate rather than losing the edit. */
  async function saveBeforeLeaving(): Promise<boolean> {
    if (!hasUnsavedChanges) return true;
    try {
      await persistDraft(selectedRecordIndex, dirtyFields);
      return true;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not save changes before navigating away.");
      return false;
    }
  }

  async function goToRecord(recordIndex: number) {
    if (!record || recordIndex === selectedRecordIndex) return;
    if (recordIndex < 1 || recordIndex > record.record_count) return;
    setSelectedField(null);
    if (hasUnsavedChanges) {
      try {
        await persistDraft(selectedRecordIndex, dirtyFields);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Could not save changes before switching records.");
        return;
      }
    }
    setSelectedRecordIndex(recordIndex);
    const entry = record.records.find((r) => r.record_index === recordIndex);
    setDraft(entry?.fields ?? BLANK_FIELDS);
  }

  async function handleApprove() {
    if (!documentId || !currentEntry) return;
    const reviewCount = Object.values(draft).filter((f) => f.status === "needs_review").length;
    const confirmMsg =
      reviewCount > 0
        ? `${reviewCount} field(s) in this record still need review. Please verify all fields before submitting.\n\nApprove and submit anyway?`
        : "Please verify all fields before submitting.\n\nApprove and submit this record?";
    if (!window.confirm(confirmMsg)) return;

    setApproving(true);
    setError(null);
    try {
      if (hasUnsavedChanges) {
        await persistDraft(selectedRecordIndex, dirtyFields);
      }
      const updated = await approveRecord(documentId, selectedRecordIndex);
      setRecord(updated);
      const nextIndex = selectedRecordIndex + 1;
      if (nextIndex <= updated.record_count) {
        setSelectedRecordIndex(nextIndex);
        const nextEntry = updated.records.find((r) => r.record_index === nextIndex);
        setDraft(nextEntry?.fields ?? BLANK_FIELDS);
      } else {
        const entry = updated.records.find((r) => r.record_index === selectedRecordIndex);
        setDraft(entry?.fields ?? BLANK_FIELDS);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not approve this record.");
    } finally {
      setApproving(false);
    }
  }

  async function handleSubmit() {
    if (!documentId) return;
    setSubmitting(true);
    setSubmitMessage(null);
    setError(null);
    try {
      if (hasUnsavedChanges) {
        await persistDraft(selectedRecordIndex, dirtyFields);
      }
      const result = await submitDocument(documentId);
      setSubmitMessage(
        `Submitted ${result.records_submitted} record(s) to XML (local file + database).`
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Submit failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setDocumentId(null);
    setRecord(null);
    setDraft(BLANK_FIELDS);
    setSelectedRecordIndex(1);
    setSelectedField(null);
    setShowData(false);
    setError(null);
    setSubmitMessage(null);
  }

  const tier = confidenceTier(record?.overall_confidence ?? null);
  const highlight = selectedField ? draft[selectedField]?.bounding_box ?? null : null;
  const totalReviewAcrossDoc =
    record?.records.reduce(
      (sum, r) => sum + Object.values(r.fields).filter((f) => f.status === "needs_review").length,
      0
    ) ?? 0;

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFileSelected(file);
          e.target.value = "";
        }}
      />

      <div className="review-header">
        <div className="title-block">
          {onBack && (
            <div className="batch-nav-row">
              <button
                className="secondary-button"
                style={{ padding: "6px 14px", fontSize: 13, fontWeight: 600 }}
                onClick={async () => {
                  if (await saveBeforeLeaving()) onBack();
                }}
              >
                ← Back to batch (generate XML once every image is reviewed)
              </button>
              {batchImages && batchPosition !== -1 && (
                <span className="batch-nav-controls">
                  <button
                    className="secondary-button"
                    style={{ padding: "3px 10px", fontSize: 12 }}
                    disabled={!adjacentBatchDocument(-1)}
                    onClick={async () => {
                      const prev = adjacentBatchDocument(-1);
                      if (prev && (await saveBeforeLeaving())) onNavigateToDocument?.(prev);
                    }}
                  >
                    ◀ Prev image
                  </button>
                  <span className="batch-nav-position">
                    Image {batchPosition + 1} / {batchImages.length}
                  </span>
                  <button
                    className="secondary-button"
                    style={{ padding: "3px 10px", fontSize: 12 }}
                    disabled={!adjacentBatchDocument(1)}
                    onClick={async () => {
                      const next = adjacentBatchDocument(1);
                      if (next && (await saveBeforeLeaving())) onNavigateToDocument?.(next);
                    }}
                  >
                    Next image ▶
                  </button>
                </span>
              )}
            </div>
          )}
          <h2>{record?.source_file.original_filename ?? (loadingExisting ? "Loading…" : "No document loaded")}</h2>
          <div className="doc-meta">
            {documentId ? (
              <>
                {documentId} · {record?.record_count ?? 0} record(s) detected · status:{" "}
                {record?.status ?? (uploading ? "uploading" : processing ? "processing" : "-")}
                {totalReviewAcrossDoc > 0 ? ` · ${totalReviewAcrossDoc} field(s) need review across all records` : ""}
              </>
            ) : loadingExisting ? (
              "Loading this document's extracted records…"
            ) : (
              "Click Select Image to upload a document"
            )}
          </div>
        </div>
        {record?.overall_confidence != null && (
          <div className={`overall-confidence confidence-${tier}`}>
            Overall confidence: {record.overall_confidence.toFixed(1)}%
          </div>
        )}
      </div>

      {!documentId && !loadingExisting && (
        <div className="layout-selector" role="radiogroup" aria-label="Document form type">
          <span className="layout-selector-label">Which form does this document use?</span>
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
        </div>
      )}
      {record && (
        <div
          className="layout-badge"
          title="The form type selected at upload, which determined how fields were extracted from this document"
        >
          Form type used: <strong>{record.layout === "new" ? "Compact Form" : "Standard Form"}</strong>
        </div>
      )}

      {record?.status === "approved" && documentId && (
        <div className="approved-banner">
          <span>
            All {record.record_count} records approved
            {record.audit.approved_by ? ` (last by ${record.audit.approved_by})` : ""} on{" "}
            {record.audit.approved_at ? new Date(record.audit.approved_at).toLocaleString() : ""}
          </span>
          <span>
            <a href={excelExportUrl(documentId)}>Download Excel</a>
            {/* The per-image XML download is deliberately hidden in batch
                mode - the batch's own combined XML (back on the batch
                screen) is the one real deliverable there; this link still
                shows for the single-document (non-batch) flow. */}
            {!batchId && (
              <>
                {"  ·  "}
                <a href={xmlExportUrl(documentId)}>Download XML</a>
              </>
            )}
            {batchId && (
              <>
                {"  ·  "}
                <button
                  className="primary-button"
                  style={{ padding: "4px 12px", fontSize: 12.5 }}
                  onClick={async () => {
                    if (await saveBeforeLeaving()) onBack?.();
                  }}
                >
                  {adjacentBatchDocument(1) ? "Return to batch" : "This was the last image - return to batch to generate XML"}
                </button>
              </>
            )}
            {adjacentBatchDocument(1) && (
              <>
                {"  ·  "}
                <button
                  className="primary-button"
                  style={{ padding: "4px 12px", fontSize: 12.5 }}
                  onClick={async () => {
                    const next = adjacentBatchDocument(1);
                    if (next && (await saveBeforeLeaving())) onNavigateToDocument?.(next);
                  }}
                >
                  Next image ▶
                </button>
              </>
            )}
          </span>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {submitMessage && documentId && (
        <div className="approved-banner">
          <span>{submitMessage}</span>
          <span>
            <a href={submissionXmlDownloadUrl(documentId)}>Download submitted XML</a>
            {adjacentBatchDocument(1) && (
              <>
                {"  ·  "}
                <button
                  className="primary-button"
                  style={{ padding: "4px 12px", fontSize: 12.5 }}
                  onClick={async () => {
                    const next = adjacentBatchDocument(1);
                    if (next && (await saveBeforeLeaving())) onNavigateToDocument?.(next);
                  }}
                >
                  Next image ▶
                </button>
              </>
            )}
          </span>
        </div>
      )}

      {currentEntry && currentEntry.cross_field_warnings.length > 0 && (
        <div className="warnings-banner">
          <strong>Possible inconsistencies detected in this record:</strong>
          <ul>
            {currentEntry.cross_field_warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <LegacyToolbar
        recordIndex={selectedRecordIndex}
        recordCount={record?.record_count ?? 0}
        recordOptions={
          record?.records.map((r) => ({
            record_index: r.record_index,
            record_no: r.fields["record_no"]?.value ?? "",
            approved: r.approved,
          })) ?? []
        }
        canApprove={!!currentEntry && !currentEntry.approved}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        approving={approving}
        approved={!!currentEntry?.approved}
        hasDocument={!!documentId && !!record}
        submitting={submitting}
        isInBatch={!!batchId}
        onSelectImage={() => fileInputRef.current?.click()}
        onSave={handleSave}
        onCancelEdit={handleCancelEdit}
        onShowData={() => setShowData((v) => !v)}
        onExit={handleReset}
        onPrevious={() => goToRecord(selectedRecordIndex - 1)}
        onNext={() => goToRecord(selectedRecordIndex + 1)}
        onJumpToRecord={goToRecord}
        onApprove={handleApprove}
        onSubmit={handleSubmit}
      />

      <div className="review-grid three-col">
        <div className="panel">
          <div className="panel-header">Records ({record?.record_count ?? 0})</div>
          <RecordList records={record?.records ?? []} selectedIndex={selectedRecordIndex} onSelect={goToRecord} />
        </div>

        <div className="panel">
          <div className="panel-header">Document</div>
          {documentId ? (
            <DocumentViewer documentId={documentId} fileType={record?.source_file.file_type ?? "image"} highlight={highlight} />
          ) : (
            <div className="empty-document-panel">
              {uploading
                ? "Uploading…"
                : loadingExisting
                ? "Loading…"
                : "No document selected yet - click Select Image above."}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            {processing
              ? "Processing… extracting fields"
              : `Record #${selectedRecordIndex} ${currentEntry?.approved ? "· ✓ approved" : ""}`}
          </div>
          {showData && currentEntry ? (
            <pre className="raw-data-view">{JSON.stringify(currentEntry, null, 2)}</pre>
          ) : (
            <LegacyForm
              fields={draft}
              selectedField={selectedField}
              hasDocument={!!record}
              onSelectField={setSelectedField}
              onChangeField={handleFieldChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
