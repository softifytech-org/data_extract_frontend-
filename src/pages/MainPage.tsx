import { useMemo, useRef, useState } from "react";
import DocumentViewer from "../components/DocumentViewer";
import LegacyForm from "../components/LegacyForm";
import LegacyToolbar from "../components/LegacyToolbar";
import RecordList from "../components/RecordList";
import { buildBlankFields } from "../constants/blankFields";
import {
  ApiRequestError,
  approveRecord,
  excelExportUrl,
  getDocument,
  processDocument,
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

/**
 * One persistent screen, matching the reference legacy app: the toolbar and
 * the full field layout are visible from the start (blank), not behind a
 * separate "upload" landing page. Selecting an image uploads + processes in
 * place and the SAME form fills in once extraction finishes.
 */
export default function MainPage() {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [record, setRecord] = useState<DocumentRecord | null>(null);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(1);
  const [draft, setDraft] = useState<Record<string, ExtractedField>>(BLANK_FIELDS);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showData, setShowData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleFileSelected(file: File) {
    setError(null);
    setUploading(true);
    setRecord(null);
    setDraft(BLANK_FIELDS);
    setSelectedField(null);
    try {
      const uploaded = await uploadDocument(file);
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

  function handleReset() {
    setDocumentId(null);
    setRecord(null);
    setDraft(BLANK_FIELDS);
    setSelectedRecordIndex(1);
    setSelectedField(null);
    setShowData(false);
    setError(null);
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
          <h2>{record?.source_file.original_filename ?? "No document loaded"}</h2>
          <div className="doc-meta">
            {documentId ? (
              <>
                {documentId} · {record?.record_count ?? 0} record(s) detected · status:{" "}
                {record?.status ?? (uploading ? "uploading" : processing ? "processing" : "-")}
                {totalReviewAcrossDoc > 0 ? ` · ${totalReviewAcrossDoc} field(s) need review across all records` : ""}
              </>
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

      {record?.status === "approved" && documentId && (
        <div className="approved-banner">
          <span>
            All {record.record_count} records approved
            {record.audit.approved_by ? ` (last by ${record.audit.approved_by})` : ""} on{" "}
            {record.audit.approved_at ? new Date(record.audit.approved_at).toLocaleString() : ""}
          </span>
          <span>
            <a href={excelExportUrl(documentId)}>Download Excel</a>
            {"  ·  "}
            <a href={xmlExportUrl(documentId)}>Download XML</a>
          </span>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

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
        onSelectImage={() => fileInputRef.current?.click()}
        onSave={handleSave}
        onCancelEdit={handleCancelEdit}
        onShowData={() => setShowData((v) => !v)}
        onExit={handleReset}
        onPrevious={() => goToRecord(selectedRecordIndex - 1)}
        onNext={() => goToRecord(selectedRecordIndex + 1)}
        onJumpToRecord={goToRecord}
        onApprove={handleApprove}
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
              {uploading ? "Uploading…" : "No document selected yet - click Select Image above."}
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
