import type { MouseEvent } from "react";
import type { ExtractedField } from "../types/document";

const STATUS_ICON: Record<string, string> = {
  verified: "✓",
  needs_review: "⚠",
  corrected: "✓",
  rejected: "✕",
};

// image_name is never OCR-extracted (it's the upload's own filename) and
// remark is a DERIVED field computed from every other field's status
// (services/validation/remark.py only iterates OCR_FIELD_ORDER, which
// excludes it) - marking either one "invalid" would do nothing, so
// neither gets the button.
const NOT_TOGGLEABLE = new Set(["image_name", "remark"]);

interface Props {
  field: ExtractedField;
  selected: boolean;
  width?: "short" | "medium" | "long";
  /** False before any document has been processed - a blank pristine form
   * shouldn't show "not found" / review warnings, since nothing has
   * actually been extracted (or failed to be) yet. */
  hasDocument?: boolean;
  onSelect: () => void;
  onChange: (value: string) => void;
  /** Flips field.marked_invalid without ever touching field.value - see
   * ExtractedField.marked_invalid's own comment (app/models/document.py)
   * for the bug this replaced: the old toggle overwrote value with the
   * literal text "N.A", permanently losing whatever the operator or OCR
   * had there. */
  onToggleInvalid: () => void;
}

export default function LegacyFieldInput({
  field,
  selected,
  width = "medium",
  hasDocument = true,
  onSelect,
  onChange,
  onToggleInvalid,
}: Props) {
  const value = field.value ?? "";
  const markedInvalid = hasDocument && field.marked_invalid;
  const toggleable = hasDocument && !NOT_TOGGLEABLE.has(field.field_name);

  const inputClass = !hasDocument
    ? ""
    : markedInvalid
      ? "marked-invalid"
      : field.source === "human"
        ? "human-edited"
        : field.status === "verified"
          ? "verified"
          : "needs-review";

  function toggleInvalid(e: MouseEvent) {
    e.stopPropagation();
    onSelect();
    onToggleInvalid();
  }

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
        {toggleable && (
          <button
            type="button"
            className={`invalid-toggle${markedInvalid ? " active" : ""}`}
            onClick={toggleInvalid}
            title={
              markedInvalid
                ? "Marked invalid - click to unmark (value is kept either way)"
                : "Mark this field invalid - keeps the current value, updates Remark automatically"
            }
          >
            IN
          </button>
        )}
      </div>
    </div>
  );
}
