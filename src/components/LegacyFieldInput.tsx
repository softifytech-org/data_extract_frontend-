import type { MouseEvent } from "react";
import type { ExtractedField } from "../types/document";

const STATUS_ICON: Record<string, string> = {
  verified: "✓",
  needs_review: "⚠",
  corrected: "✓",
  rejected: "✕",
};

// Same explicit-N/A spellings services/validation/remark.py already
// recognizes server-side (patterns.EXPLICIT_NA_VALUES) - the Invalid
// button below only works because it writes a value the EXISTING
// backend remark logic already treats as "this field is invalid", so
// Remark recomputes automatically on save with no new backend code.
const EXPLICIT_NA_VALUES = new Set(["N.A", "N.A.", "NA", "N/A", "NONE"]);
// The exact spelling BN_WorkFlow.pdf's own "Common Rule (N.A Handling)"
// specifies ("You must type 'N.A' in the field").
const NA_VALUE = "N.A";

// image_name is never OCR-extracted (it's the upload's own filename) and
// remark is a DERIVED field computed from every other field's status
// (services/validation/remark.py only iterates OCR_FIELD_ORDER, which
// excludes it) - marking either one "invalid" would do nothing, so
// neither gets the button.
const NOT_TOGGLEABLE = new Set(["image_name", "remark"]);

function isExplicitNA(value: string | null): boolean {
  if (!value) return false;
  return EXPLICIT_NA_VALUES.has(value.trim().toUpperCase().replace(/\.$/, ""));
}

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
}

export default function LegacyFieldInput({
  field,
  selected,
  width = "medium",
  hasDocument = true,
  onSelect,
  onChange,
}: Props) {
  const value = field.value ?? "";
  const markedInvalid = hasDocument && isExplicitNA(field.value);
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
    // Un-marking clears back to blank rather than guessing at a "real"
    // value - the reviewer can always type one in if they change their
    // mind. Marking writes the exact legacy-spec spelling so Remark
    // (recomputed server-side on save) reads "<Field Name> is invalid"
    // automatically, with no extra step - and recomputes fresh from
    // current field state each time, so it never accumulates duplicate
    // mentions of the same field across repeated toggles.
    onChange(markedInvalid ? "" : NA_VALUE);
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
                ? "Marked invalid - click to clear"
                : "Mark this field invalid - updates Remark automatically"
            }
          >
            IN
          </button>
        )}
      </div>
    </div>
  );
}
