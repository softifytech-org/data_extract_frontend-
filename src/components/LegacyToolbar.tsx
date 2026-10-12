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
        <button className="legacy-btn" onClick={onSelectImage}>
          Select Image
        </button>
        <button className="legacy-btn" onClick={onExit}>
          New
        </button>
        <button className="legacy-btn" onClick={onSave} disabled={!hasUnsavedChanges || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="legacy-btn" onClick={onShowData}>
          Show Data
        </button>
        <button className="legacy-btn" onClick={onCancelEdit} disabled={!hasUnsavedChanges}>
          Cancel Edit
        </button>
        <button
          className="legacy-btn legacy-btn-primary"
          onClick={onSubmit}
          disabled={!hasDocument || submitting}
          title="Writes every record in this document out as XML, in the same field layout as the legacy data dump, to local storage and the database"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
        <button className="legacy-btn legacy-btn-danger" onClick={onExit}>
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
        >
          {approved ? "✓ Approved" : approving ? "Approving…" : "Approve & Submit"}
        </button>
      </div>
    </div>
  );
}
