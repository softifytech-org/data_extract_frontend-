import type { ExtractedField } from "../types/document";

const STATUS_ICON: Record<string, string> = {
  verified: "✓",
  needs_review: "⚠",
  corrected: "✓",
  rejected: "✕",
};

interface Props {
  field: ExtractedField;
  selected: boolean;
  width?: "xs" | "sm" | "md" | "lg";
  /** False before any document has been processed - a blank pristine form
   * shouldn't show "not found" / review warnings, since nothing has
   * actually been extracted (or failed to be) yet. */
  hasDocument?: boolean;
  onSelect: () => void;
  onChange: (value: string) => void;
}

export default function LegacyFieldInput({
  field,
  selected,
  width = "md",
  hasDocument = true,
  onSelect,
  onChange,
}: Props) {
  const value = field.value ?? "";

  const inputClass = !hasDocument
    ? ""
    : field.source === "human"
      ? "human-edited"
      : field.status === "verified"
        ? "verified"
        : "needs-review";

  return (
    <div className={`legacy-field w-${width}${selected ? " selected" : ""}`} onClick={onSelect}>
      <label className="legacy-field-label">{field.label}</label>
      <div className="legacy-field-control">
        <input
          className={inputClass}
          value={value}
          placeholder={hasDocument && field.value === null ? "not found" : ""}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onSelect}
          title={
            hasDocument
              ? field.source === "ocr"
                ? `OCR confidence: ${field.confidence.toFixed(1)}${field.validation.notes.length ? " - " + field.validation.notes.join("; ") : ""}`
                : "Entered/corrected by reviewer"
              : undefined
          }
        />
        {hasDocument && (
          <span className={`status-icon ${field.status}`} title={field.status.replace("_", " ")}>
            {STATUS_ICON[field.status] ?? "?"}
          </span>
        )}
      </div>
    </div>
  );
}
