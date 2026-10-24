// Where an import's progress is kept between app launches. Thousands of tracks
// don't fit comfortably in localStorage, so it's a small IndexedDB store of
// its own (memory only when IndexedDB isn't there, e.g. in tests).
import type { LikedImportState } from "./likedImportRunner";

const DB_NAME = "lane_jobs";
const STORE = "kv";
const KEY = "spotify_liked_import_v1";

let memory: LikedImportState | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const opening = openDb();
  if (!opening) return undefined;
  const db = await opening;
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadImportState(): Promise<LikedImportState | null> {
  try {
    const stored = await tx<LikedImportState>("readonly", (s) => s.get(KEY) as IDBRequest<LikedImportState>);
    if (stored && stored.version === 1) return stored;
  } catch {
    // fall back to what this session has
  }
  return memory;
}

export async function saveImportState(state: LikedImportState): Promise<void> {
  // a copy: the runner keeps changing its own object
  memory = JSON.parse(JSON.stringify(state)) as LikedImportState;
  try {
    await tx("readwrite", (s) => s.put(memory, KEY));
  } catch {
    // kept in memory for this session at least
  }
}

export async function clearImportState(): Promise<void> {
  memory = null;
  try {
    await tx("readwrite", (s) => s.delete(KEY));
  } catch {
    // nothing to clear
  }
}
