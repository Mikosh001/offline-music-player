// IndexedDB-де аудио файлдарды (Blob түрінде) сақтайтын жеңіл "драйвер".
// localStorage-тен айырмашылығы: көлемі шектелмейді дерлік (әдетте
// құрылғы дискінің үлкен пайызына дейін), сондықтан толық ән файлдарын
// сақтауға жарамды.

const DB_NAME = 'offline-music-player';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

// Кейбір құрылғылар (әсіресе iOS-та Files қолданбасынан алынған
// файлдар) дұрыс MIME "type" бермей, бос жол қайтарады. Сол жағдайда
// кеңейтім бойынша болжаймыз — олай болмаса <audio> ойната алмайды.
const MIME_MAP = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac',
  wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  flac: 'audio/flac', opus: 'audio/opus', weba: 'audio/webm'
};

function guessMime(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return MIME_MAP[ext] || 'audio/mpeg';
}

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
  if (!file || file.size === 0) {
    // Көбіне iCloud/бұлтта сақталған, телефонға әлі толық жүктелмеген
    // файлдар осылай 0 байт болып келеді (интернет жоқ кезде оқылмайды).
    throw new Error('Файл бос немесе оқылмады (iCloud-та жүктелмеген болуы мүмкін)');
  }

  const mime = (file.type && file.type.startsWith('audio')) ? file.type : guessMime(file.name);
  // Түпнұсқа File-дың "type" өрісі бос/дұрыс емес болса, дұрыс MIME-мен
  // жаңа Blob жасаймыз — олай болмаса кейбір браузерде <audio> ойнатпайды.
  const normalizedBlob = (file.type === mime) ? file : new Blob([file], { type: mime });

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record = {
      name: file.name.replace(/\.[^/.]+$/, ''), // кеңейтімсіз атау
      type: mime,
      blob: normalizedBlob,
      size: file.size,
      addedAt: Date.now()
    };
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB транзакциясы тоқтатылды (жады жетпеуі мүмкін)'));
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
