import type { Track } from "@/shared/types";

export interface DownloadEntry {
  track: Track;
  byteSize: number;
  savedAt: number;
}
interface DownloadRecord extends DownloadEntry { blob: Blob }

// A separate database keeps downloads safe when Chromium's temporary cache is cleared.
let connection: Promise<IDBDatabase> | undefined;
function open() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lane-downloads", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("tracks", { keyPath: "track.id" });
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      db.onclose = () => { connection = undefined; };
      resolve(db);
    };
    request.onerror = () => { connection = undefined; reject(request.error); };
  });
}
async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tracks", mode);
    const request = work(tx.objectStore("tracks"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? request.error);
    tx.onabort = () => reject(tx.error ?? new Error("Download transaction aborted"));
  });
}
export const downloadsDb = {
  async list(): Promise<DownloadEntry[]> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const entries: DownloadEntry[] = [];
      const tx = db.transaction("tracks");
      const cursor = tx.objectStore("tracks").openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        const { track, byteSize, savedAt } = row.value as DownloadRecord;
        entries.push({ track, byteSize, savedAt });
        row.continue();
      };
      tx.oncomplete = () => resolve(entries.sort((a, b) => b.savedAt - a.savedAt));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
  get(id: string): Promise<DownloadRecord | undefined> { return transaction("readonly", store => store.get(id)); },
  async put(track: Track, blob: Blob) {
    await transaction("readwrite", store => store.put({ track, blob, byteSize: blob.size, savedAt: Date.now() } satisfies DownloadRecord));
  },
  async remove(id: string) { await transaction("readwrite", store => store.delete(id)); },
  async clear() { await transaction("readwrite", store => store.clear()); },
};
