import type { DocumentRecord, DocumentSummary } from "../types/document";

// In local dev this stays "" and vite.config.ts's dev-only proxy forwards
// /api to the backend. A static Vercel build has no such proxy, so
// production sets VITE_API_BASE_URL to the deployed backend's origin
// (e.g. https://<name>.onrender.com) and every call below is absolute.
const API_ROOT = import.meta.env.VITE_API_BASE_URL ?? "";
const BASE = `${API_ROOT}/api/documents`;

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

export async function uploadDocument(file: File): Promise<{ document_id: string; status: string }> {
  const form = new FormData();
  form.append("file", file);
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
