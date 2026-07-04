// IndexedDB-де аудио файлдарды (Blob түрінде) сақтайтын жеңіл "драйвер".
// localStorage-тен айырмашылығы: көлемі шектелмейді дерлік (әдетте
// құрылғы дискінің үлкен пайызына дейін), сондықтан толық ән файлдарын
// сақтауға жарамды.

const DB_NAME = 'offline-music-player';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('addedAt', 'addedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addTrack(file) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record = {
      name: file.name.replace(/\.[^/.]+$/, ''), // кеңейтімсіз атау
      type: file.type,
      blob: file,
      addedAt: Date.now()
    };
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllTracks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.addedAt - b.addedAt));
    req.onerror = () => reject(req.error);
  });
}

async function deleteTrack(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

window.MusicDB = { addTrack, getAllTracks, deleteTrack };
