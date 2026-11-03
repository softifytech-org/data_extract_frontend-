import { reportDeviceActivity } from "./api";

const STORAGE_KEY = "ocr-data-entry.device-id";

/** A stable id for THIS browser installation, created once and kept in
 * localStorage. This is the only piece of resume state the client is
 * ever the source of truth for - everything else (last batch/image/
 * record, corrections, progress) lives in the backend, so a cleared
 * browser cache only loses the ability to recognize "this is the same
 * device", never the actual work (see app/api/devices.py's docstring). */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, generated);
    return generated;
  } catch {
    // Private browsing / storage disabled: fall back to a per-tab id.
    // Resume simply won't survive a reload in that case, same as if the
    // backend had never seen this device before.
    return crypto.randomUUID();
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced workspace-position report (Phase 2's "Save Workspace
 * Position"): called on every image/record navigation, but only the
 * last call within the debounce window actually reaches the backend -
 * rapid navigation (e.g. arrow-keying through records) doesn't spam the
 * activity endpoint. */
export function reportActivity(
  activity: { batch_id?: string | null; document_id?: string | null; record_index?: number | null },
  debounceMs = 800
): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void reportDeviceActivity(getDeviceId(), activity);
  }, debounceMs);
}

/** Immediate (non-debounced) report - for moments that must not be lost
 * to a debounce window closing late, e.g. right before the tab unloads. */
export function reportActivityNow(
  activity: { batch_id?: string | null; document_id?: string | null; record_index?: number | null }
): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  void reportDeviceActivity(getDeviceId(), activity);
}
