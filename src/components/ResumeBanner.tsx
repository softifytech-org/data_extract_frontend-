import { useEffect, useState } from "react";
import { getDeviceResumeState, type DeviceResumeState } from "../services/api";
import { getDeviceId } from "../services/device";

interface Props {
  /** Called only when the operator explicitly clicks Resume Work - this
   * component never navigates anything on its own (see App.tsx's own
   * history on why automatic resume-on-load was tried before and
   * reverted for being confusing). */
  onResume: (batchId: string, documentId: string | null) => void;
}

function formatSavedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** "Welcome back" banner (Phase 6 of the device-resume spec) - shown only
 * when this device has real, backend-confirmed unfinished work. Renders
 * nothing at all (not even a loading flash) when there's nothing to
 * resume, so every existing screen looks exactly as it did before this
 * feature existed. */
export default function ResumeBanner({ onResume }: Props) {
  const [state, setState] = useState<DeviceResumeState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDeviceResumeState(getDeviceId())
      .then((resume) => {
        if (!cancelled) setState(resume);
      })
      .catch(() => {
        // No resumable-work signal is ever worth bothering the operator
        // about with an error - the existing upload screen below still
        // works normally either way.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || !state?.resumable || !state.batch_id) return null;

  const imagesLabel = `${state.images_completed}/${state.image_count} images`;
  const recordsLabel = `${state.records_completed}/${state.records_total} records`;

  return (
    <div className="resume-banner">
      <div className="resume-banner-text">
        <strong>Welcome back.</strong> You have unfinished work &mdash; batch {state.batch_id}
        {" "}({imagesLabel}, {recordsLabel} completed)
        {state.last_saved_at && <> &middot; last saved {formatSavedAt(state.last_saved_at)}</>}
      </div>
      <div className="resume-banner-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => onResume(state.batch_id as string, state.document_id)}
        >
          Resume Work
        </button>
        <button type="button" className="resume-banner-dismiss" onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
