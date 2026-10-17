import type { DocumentRecord, DocumentSummary } from "../types/document";

// In local dev this stays "" and vite.config.ts's dev-only proxy forwards
// /api to the backend. A static Vercel build has no such proxy, so
// production sets VITE_API_BASE_URL to the deployed backend's origin
// (e.g. https://<name>.onrender.com) and every call below is absolute.
const API_ROOT = import.meta.env.VITE_API_BASE_URL ?? "";
const BASE = `${API_ROOT}/api/documents`;
const BATCH_BASE = `${API_ROOT}/api/batches`;

export class ApiRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) message = body.detail;
    } catch {
      // response had no JSON body - keep the generic message
    }
    throw new ApiRequestError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export type DocumentLayout = "old" | "new";

export async function uploadDocument(
  file: File,
  layout: DocumentLayout = "old"
): Promise<{ document_id: string; status: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("layout", layout);
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: form });
  return handle(res);
}

export async function processDocument(documentId: string): Promise<{ document_id: string; status: string }> {
  const res = await fetch(`${BASE}/${documentId}/process`, { method: "POST" });
  return handle(res);
}

export async function getResults(documentId: string): Promise<DocumentRecord> {
  const res = await fetch(`${BASE}/${documentId}/results`);
  return handle(res);
}

export async function getDocument(documentId: string): Promise<DocumentRecord> {
  const res = await fetch(`${BASE}/${documentId}`);
  return handle(res);
}

export async function updateFields(
  documentId: string,
  recordIndex: number,
  fields: Record<string, string | null>
): Promise<DocumentRecord> {
  const body = {
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v }])),
  };
  const res = await fetch(`${BASE}/${documentId}/records/${recordIndex}/fields`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function validateDocument(documentId: string): Promise<DocumentRecord> {
  const res = await fetch(`${BASE}/${documentId}/validate`, { method: "POST" });
  return handle(res);
}

export async function approveDocument(documentId: string, approvedBy?: string): Promise<DocumentRecord> {
  const res = await fetch(`${BASE}/${documentId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved_by: approvedBy ?? null }),
  });
  return handle(res);
}

export async function approveRecord(
  documentId: string,
  recordIndex: number,
  approvedBy?: string
): Promise<DocumentRecord> {
  const res = await fetch(`${BASE}/${documentId}/records/${recordIndex}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved_by: approvedBy ?? null }),
  });
  return handle(res);
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const res = await fetch(BASE);
  return handle(res);
}

export function documentFileUrl(documentId: string): string {
  return `${BASE}/${documentId}/file`;
}

export function excelExportUrl(documentId: string): string {
  return `${BASE}/${documentId}/export/excel`;
}

export function xmlExportUrl(documentId: string): string {
  return `${BASE}/${documentId}/export/xml`;
}

export interface SubmitResponse {
  document_id: string;
  xml_path: string;
  records_submitted: number;
}

export async function submitDocument(documentId: string, submittedBy?: string): Promise<SubmitResponse> {
  const res = await fetch(`${BASE}/${documentId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved_by: submittedBy ?? null }),
  });
  return handle(res);
}

export function submissionXmlDownloadUrl(documentId: string): string {
  return `${BASE}/${documentId}/submit/download`;
}

// --- Batch upload (multi-image, queue-backed) ---
//
// No authentication anywhere, by explicit decision: this app has no
// accounts, no shared key, no gate of any kind. Every batch endpoint
// here is reachable by anyone who can reach the URL - see the final
// report for what that means and what it risks.

export interface BatchImageStatus {
  position: number;
  document_id: string;
  original_filename: string;
  status: string;
  error: string | null;
  // Both null until the image has actually been processed (status
  // "completed"/"needs_review") - never 0/false for "not processed yet",
  // which would be indistinguishable from "processed with zero records".
  record_count: number | null;
  all_records_approved: boolean | null;
}

export interface BatchClearResponse {
  batch_id: string;
  images_cleared: number;
  errors: string[];
}

export interface BatchSummary {
  id: string;
  status: string;
  image_count: number;
  created_at: string;
  updated_at: string;
}

export interface BatchDetail extends BatchSummary {
  images: BatchImageStatus[];
}

export interface BatchUploadResponse {
  batch_id: string;
  image_count: number;
  status: string;
}

export interface BatchSubmitResponse {
  batch_id: string;
  records_submitted: number;
  status: string;
}

export interface BatchSubmissionStatus {
  batch_id: string;
  submitted: boolean;
  record_count: number | null;
  submitted_at: string | null;
}

export async function uploadBatch(files: File[], layout: DocumentLayout = "old"): Promise<BatchUploadResponse> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  form.append("layout", layout);
  const res = await fetch(BATCH_BASE, { method: "POST", body: form });
  return handle(res);
}

export async function listBatches(): Promise<BatchSummary[]> {
  const res = await fetch(BATCH_BASE);
  return handle(res);
}

export async function getBatch(batchId: string): Promise<BatchDetail> {
  const res = await fetch(`${BATCH_BASE}/${batchId}`);
  return handle(res);
}

/** Removes one image from a batch that hasn't been submitted yet - for a
 * wrong/unwanted upload, as opposed to clearBatch's whole-batch cleanup
 * after a real submission exists. Returns the updated batch so the
 * caller can refresh its list from the response instead of a second
 * round trip. */
export async function removeBatchImage(batchId: string, position: number): Promise<BatchDetail> {
  const res = await fetch(`${BATCH_BASE}/${batchId}/images/${position}`, { method: "DELETE" });
  return handle(res);
}

/** Only succeeds once the batch has a real submission (see the backend's
 * clear_batch) - never call this on a batch the reviewer hasn't already
 * submitted and downloaded. Best-effort per-image: a non-empty `errors`
 * list means some of the batch's data could not be cleared and must be
 * surfaced to the user, not treated as a silent success. */
export async function clearBatch(batchId: string): Promise<BatchClearResponse> {
  const res = await fetch(`${BATCH_BASE}/${batchId}`, { method: "DELETE" });
  return handle(res);
}

export class BatchNotReadyError extends Error {
  blockers: string[];
  constructor(blockers: string[]) {
    super("Batch is not ready to submit");
    this.blockers = blockers;
  }
}

export async function submitBatch(batchId: string): Promise<BatchSubmitResponse> {
  const res = await fetch(`${BATCH_BASE}/${batchId}/submit`, { method: "POST" });
  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      // no JSON body
    }
    if (res.status === 400 && Array.isArray(body?.detail?.blockers)) {
      throw new BatchNotReadyError(body.detail.blockers);
    }
    throw new ApiRequestError(
      res.status, typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`
    );
  }
  return res.json();
}

export async function getBatchSubmissionStatus(batchId: string): Promise<BatchSubmissionStatus> {
  const res = await fetch(`${BATCH_BASE}/${batchId}/submission`);
  return handle(res);
}

export function downloadBatchSubmissionXml(batchId: string): Promise<void> {
  return downloadFile(`${BATCH_BASE}/${batchId}/submission/download`, `${batchId}_submission.xml`);
}

/** Fetches and saves a file via a throwaway object URL, so the download
 * gets a sensible filename regardless of what the browser would have
 * guessed from the URL alone. */
async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) message = body.detail;
    } catch {
      // no JSON body - keep the generic message
    }
    throw new ApiRequestError(res.status, message);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export function downloadBatchDocumentExcel(documentId: string): Promise<void> {
  return downloadFile(excelExportUrl(documentId), `${documentId}.xlsx`);
}

export function downloadBatchDocumentXml(documentId: string): Promise<void> {
  return downloadFile(xmlExportUrl(documentId), `${documentId}.xml`);
}
