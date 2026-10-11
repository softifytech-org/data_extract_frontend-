import type { RecordEntry } from "../types/document";

interface Props {
  records: RecordEntry[];
  selectedIndex: number;
  onSelect: (recordIndex: number) => void;
}

function recordLabel(entry: RecordEntry): string {
  const idField = entry.fields["record_id"];
  const nameField = entry.fields["customer_name"];
  if (idField?.value) return idField.value;
  if (nameField?.value) return nameField.value;
  return `Record ${entry.record_index}`;
}

export default function RecordList({ records, selectedIndex, onSelect }: Props) {
  return (
    <div className="record-list">
      {records.map((entry) => {
        const reviewCount = Object.values(entry.fields).filter(
          (f) => f.status === "needs_review"
        ).length;
        return (
          <div
            key={entry.record_index}
            className={`record-list-item${entry.record_index === selectedIndex ? " selected" : ""}`}
            onClick={() => onSelect(entry.record_index)}
          >
            <div className="record-list-index">#{entry.record_index}</div>
            <div className="record-list-body">
              <div className="record-list-label">{recordLabel(entry)}</div>
              <div className="record-list-meta">
                {entry.overall_confidence != null ? `${entry.overall_confidence.toFixed(0)}%` : "-"}
                {reviewCount > 0 ? ` · ${reviewCount} review` : " · all clear"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
