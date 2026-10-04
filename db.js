const DB_NAME = "offline-music-player";
const DB_VERSION = 2;
let pending;
export function openDB() {
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const library = db.createObjectStore("library", { keyPath: "id" });
      const audio = db.createObjectStore("audio", { keyPath: "id" });
      db.createObjectStore("settings", { keyPath: "key" });
      db.createObjectStore("playlists", { keyPath: "id" });
      if (db.objectStoreNames.contains("tracks")) {
        req.transaction.objectStore("tracks").openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) {
            db.deleteObjectStore("tracks");
            return;
          }
          const old = cursor.value,
            id = `local-legacy-${old.id}`;
          library.put({
            id,
            title: old.name || "Атаусыз ән",
            artist: "Менің музыкам",
            artistId: "local",
            styles: ["pop"],
            duration: 0,
            downloaded: true,
            source: "local",
            size: old.size || old.blob?.size || 0,
            addedAt: old.addedAt || Date.now(),
          });
          audio.put({ id, blob: old.blob, savedAt: Date.now() });
          cursor.continue();
        };
      }
    };
    req.onblocked = () => window.dispatchEvent(new CustomEvent("dbblocked"));
    req.onerror = () => {
      pending = null;
      reject(req.error);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        pending = null;
      };
      resolve(db);
    };
  });
  return pending;
}
async function transaction(stores, mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let value;
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error || new Error("Деректер сақталмады."));
    tx.onabort = () => reject(tx.error || new Error("Сақтау тоқтатылды."));
    action(tx, (result) => {
      value = result;
    });
  });
}
export function getAll(store) {
  return transaction([store], "readonly", (tx, result) => {
    tx.objectStore(store).getAll().onsuccess = (e) => result(e.target.result);
  });
}
export function get(store, key) {
  return transaction([store], "readonly", (tx, result) => {
    tx.objectStore(store).get(key).onsuccess = (e) => result(e.target.result);
  });
}
export function put(store, record) {
  return transaction([store], "readwrite", (tx) => {
    tx.objectStore(store).put(record);
  });
}
export function remove(store, key) {
  return transaction([store], "readwrite", (tx) => {
    tx.objectStore(store).delete(key);
  });
}
export function saveAudio(track, blob) {
  return transaction(["library", "audio"], "readwrite", (tx) => {
    tx.objectStore("audio").put({ id: track.id, blob, savedAt: Date.now() });
    tx.objectStore("library").put({
      ...track,
      downloaded: true,
      size: blob.size,
      addedAt: track.addedAt || Date.now(),
    });
  });
}
export function deleteAudio(track) {
  return transaction(["library", "audio"], "readwrite", (tx) => {
    tx.objectStore("audio").delete(track.id);
    tx.objectStore("library").put({ ...track, downloaded: false, size: 0 });
  });
}
