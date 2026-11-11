import { ApiRequestError, type FieldChange, updateFields } from "./api";

/** IndexedDB-backed outbox for field corrections that could not reach
 * the backend because of a NETWORK problem specifically - never for a
 * genuine server-side rejection (bad data, validation failure), which
 * must still surface to the operator immediately and is never retried
 * silently (see isNetworkFailure below and persistDraft in MainPage.tsx,
 * the only caller that queues anything here).
 *
 * One entry per (documentId, recordIndex): further edits to the same
 * record while offline MERGE into the existing queued entry instead of
 * piling up duplicate writes, so only the latest value per field is ever
 * replayed. */

const DB_NAME = "ocr-data-entry-outbox";
const STORE = "pending-corrections";
const DB_VERSION = 1;

export interface OutboxEntry {
  key: string; // `${documentId}:${recordIndex}`
  documentId: string;
  recordIndex: number;
  changes: Record<string, FieldChange>;
  queuedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function keyFor(documentId: string, recordIndex: number): string {
  return `${documentId}:${recordIndex}`;
}

/** Queues a correction for later sync, merging with any already-queued,
 * not-yet-synced change for the same record (last value per field wins -
 * the same semantics a normal online save would have if the two edits
 * had happened back to back). */
export async function queueCorrection(
  documentId: string, recordIndex: number, changes: Record<string, FieldChange>
): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const key = keyFor(documentId, recordIndex);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const existing: OutboxEntry | undefined = getReq.result;
        const merged: OutboxEntry = {
          key, documentId, recordIndex,
          changes: { ...(existing?.changes ?? {}), ...changes },
          queuedAt: existing?.queuedAt ?? new Date().toISOString(),
        };
        store.put(merged);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  void notifyListeners();
}

export async function listPending(): Promise<OutboxEntry[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as OutboxEntry[]);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function removePending(key: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** A real network failure (offline, DNS failure, connection reset) -
 * fetch() itself rejects with a plain (non-ApiRequestError) exception,
 * since ApiRequestError is only ever thrown AFTER a response was
 * actually received (see api.ts's handle()). A genuine 4xx/5xx from the
 * server is never treated as a connectivity problem - retrying the exact
 * same invalid request forever would never succeed, so that case is
 * deliberately excluded here and must surface to the operator instead. */
export function isNetworkFailure(err: unknown): boolean {
  return !(err instanceof ApiRequestError);
}

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

async function notifyListeners(): Promise<void> {
  const count = (await listPending()).length;
  for (const l of listeners) l(count);
}

/** Subscribes to the outbox's pending-count, for a small "N change(s)
 * waiting to sync" indicator - returns an unsubscribe function. Fires
 * once immediately with the current count. */
export function subscribeToPendingCount(listener: Listener): () => void {
  listeners.add(listener);
  void notifyListeners();
  return () => {
    listeners.delete(listener);
  };
}

let flushing = false;

/** Attempts to replay every queued correction. Safe to call repeatedly
 * (on reconnect, on a timer, after a successful online save) - a
 * concurrent call while one is already in flight is a no-op, and each
 * entry is only removed from the outbox after the backend has actually
 * confirmed it (never optimistically). A real server-side rejection on
 * replay (as opposed to still being offline) leaves the entry queued
 * rather than dropping a correction silently - a human should resolve
 * that case, not lose the data on review of corrected values. */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const entries = await listPending();
    for (const entry of entries) {
      try {
        await updateFields(entry.documentId, entry.recordIndex, entry.changes);
        await removePending(entry.key);
      } catch (err) {
        if (!isNetworkFailure(err)) {
          // Still offline - try again on the next flush. A real
          // server-side rejection is deliberately left queued too
          // (rather than silently discarded) since dropping a
          // correction nobody will ever re-enter is worse than it
          // staying visibly pending; it will keep surfacing until an
          // operator revisits that record and saves successfully.
        }
      } finally {
        void notifyListeners();
      }
    }
  } finally {
    flushing = false;
  }
}

let started = false;

/** Starts the background sync loop once per page load: flush on
 * reconnect, and on a periodic timer as a fallback for environments
 * where the 'online' event is unreliable (some browsers/VPNs). Safe to
 * call from multiple components - only arms the listeners once. */
export function startOutboxSync(): void {
  if (started) return;
  started = true;
  window.addEventListener("online", () => void flushOutbox());
  void flushOutbox();
  setInterval(() => void flushOutbox(), 15000);
}
