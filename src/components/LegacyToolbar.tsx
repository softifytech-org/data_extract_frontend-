export interface RecordOption {
  record_index: number;
  record_no: string;
  approved: boolean;
}

interface Props {
  recordIndex: number;
  recordCount: number;
  recordOptions: RecordOption[];
  canApprove: boolean;
  hasUnsavedChanges: boolean;
  saving: boolean;
  approving: boolean;
  approved: boolean;
  hasDocument: boolean;
  submitting: boolean;
  isInBatch?: boolean;
  onSelectImage: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onShowData: () => void;
  onExit: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onJumpToRecord: (recordIndex: number) => void;
  onApprove: () => void;
  onSubmit: () => void;
}

export default function LegacyToolbar({
  recordIndex,
  recordCount,
  recordOptions,
  canApprove,
  hasUnsavedChanges,
  saving,
  approving,
  approved,
  hasDocument,
  submitting,
  isInBatch,
  onSelectImage,
  onSave,
  onCancelEdit,
  onShowData,
  onExit,
  onPrevious,
  onNext,
  onJumpToRecord,
  onApprove,
  onSubmit,
}: Props) {
  return (
    <div className="legacy-toolbar">
      <div className="legacy-toolbar-buttons">
        <button className="legacy-btn" onClick={onSelectImage} title="Choose a new image or PDF to upload">
          Select Image
        </button>
        <button className="legacy-btn" onClick={onExit} title="Clear this screen and start a fresh upload">
          New Document
        </button>
        <button
          className="legacy-btn"
          onClick={onSave}
          disabled={!hasUnsavedChanges || saving}
          title="Save your edits to this record now (edits also save automatically when you switch records or approve)"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button className="legacy-btn" onClick={onShowData} title="Show this record's raw data (for troubleshooting)">
          Show Raw Data
        </button>
        <button
          className="legacy-btn"
          onClick={onCancelEdit}
          disabled={!hasUnsavedChanges}
          title="Discard your unsaved edits and restore the last saved values"
        >
          Discard Edits
        </button>
        {!isInBatch && (
          <button
            className="legacy-btn legacy-btn-primary"
            onClick={onSubmit}
            disabled={!hasDocument || submitting}
            title="Writes every record in this document out to XML right now (does not require approval first)"
          >
            {submitting ? "Generating…" : "Generate XML"}
          </button>
        )}
        <button
          className="legacy-btn legacy-btn-danger"
          onClick={onExit}
          title="Leave this document and clear the screen"
        >
          Exit
        </button>
      </div>
      <div className="legacy-toolbar-nav">
        <button className="legacy-btn" onClick={onPrevious} disabled={recordIndex <= 1}>
          ◀ Previous
        </button>
        <span className="legacy-record-counter">Record</span>
        <select
          className="legacy-record-jump"
          value={recordIndex}
          onChange={(e) => onJumpToRecord(Number(e.target.value))}
          title="Jump directly to a record by Record No"
        >
          {recordOptions.map((opt) => (
            <option key={opt.record_index} value={opt.record_index}>
              {opt.record_index}. {opt.record_no || `(record ${opt.record_index})`}
              {opt.approved ? " ✓" : ""}
            </option>
          ))}
        </select>
        <span className="legacy-record-counter">/ {recordCount}</span>
        <button className="legacy-btn" onClick={onNext} disabled={recordIndex >= recordCount}>
          Next ▶
        </button>
        <button
          className="legacy-btn legacy-btn-primary"
          onClick={onApprove}
          disabled={!canApprove || approving}
          title="Save this record, mark it approved, and move to the next record in this document"
        >
          {approved ? "✓ Approved" : approving ? "Approving…" : "Approve & Next Record"}
        </button>
      </div>
    </div>
  );
}
