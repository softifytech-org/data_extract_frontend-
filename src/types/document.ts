export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "processed"
  | "needs_review"
  | "approved"
  | "failed";

export type FieldStatus = "verified" | "needs_review" | "corrected" | "rejected";
export type FieldSource = "ocr" | "human";
export type DataType =
  | "text"
  | "name"
  | "email"
  | "phone"
  | "date"
  | "currency"
  | "number"
  | "enum"
  | "id_code"
  | "address";

export interface BoundingBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FieldValidation {
  format_valid: boolean | null;
  ocr_agreement: boolean | null;
  ocr_agreement_ratio: number | null;
  business_rule_valid: boolean | null;
  notes: string[];
}

export interface ExtractedField {
  field_name: string;
  label: string;
  value: string | null;
  original_ocr_value: string | null;
  data_type: DataType;
  confidence: number;
  status: FieldStatus;
  source: FieldSource;
  validation: FieldValidation;
  bounding_box: BoundingBox | null;
}

export interface SourceFileInfo {
  original_filename: string;
  stored_filename: string;
  file_type: string;
  content_type: string;
  pages: number;
  size_bytes: number;
}

export interface AuditInfo {
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_by: string | null;
}

export interface RecordEntry {
  record_index: number;
  page: number;
  fields: Record<string, ExtractedField>;
  cross_field_warnings: string[];
  overall_confidence: number | null;
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
}

export interface DocumentRecord {
  document_id: string;
  status: DocumentStatus;
  layout: "old" | "new";
  source_file: SourceFileInfo;
  records: RecordEntry[];
  record_count: number;
  overall_confidence: number | null;
  error_message: string | null;
  last_export_path: string | null;
  last_xml_export_path: string | null;
  audit: AuditInfo;
}

export interface DocumentSummary {
  document_id: string;
  status: string;
  original_filename: string;
  created_at: string;
  record_count: number;
  overall_confidence: number | null;
}

export interface ApiError {
  detail: string;
}
