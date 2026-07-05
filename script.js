// ================= Service Worker + желі статусы =================
const swLabel = document.getElementById('swLabel');
const dot = document.getElementById('dot');
const statusLabel = document.getElementById('statusLabel');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(() => { swLabel.textContent = 'SW: белсенді'; })
      .catch(() => { swLabel.textContent = 'SW: қате'; });
  });
} else {
  swLabel.textContent = 'SW: қолдау жоқ';
}

function updateStatus() {
  if (navigator.onLine) {
    dot.classList.add('online');
    statusLabel.textContent = 'Онлайн';
  } else {
    dot.classList.remove('online');
    statusLabel.textContent = 'Офлайн — плеер жұмыс істеп тұр';
  }
}
window.addEventListener('online', updateStatus);
window.addEventListener('offline', updateStatus);
updateStatus();

// ================= Элементтер =================
const audio = document.getElementById('audio');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const seek = document.getElementById('seek');
const volume = document.getElementById('volume');
const curTimeEl = document.getElementById('curTime');
const totalTimeEl = document.getElementById('totalTime');
const trackNameEl = document.getElementById('trackName');
const playlistEl = document.getElementById('playlist');
const trackCountEl = document.getElementById('trackCount');
const emptyEl = document.getElementById('empty');
const addBtn = document.getElementById('addBtn');
const fileInput = document.getElementById('fileInput');
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');
const screenBox = document.getElementById('screenBox');
const toastEl = document.getElementById('toast');
const storageInfoEl = document.getElementById('storageInfo');

// ================= Хабарлама (toast) =================
let toastTimer = null;
function showToast(msg, isError, sticky) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('error', !!isError);
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  if (!sticky) {
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 5000);
  }
}

if (!window.indexedDB) {
  // Жеке (Private/Incognito) режимде кейбір браузерлер IndexedDB-ді толық бұғаттайды
  showToast('Бұл режимде дерекқор қолжетімсіз. Жеке/инкогнито режимде емес екеніңізді тексер.', true, true);
}

// ================= Жады көлемі =================
async function refreshStorageInfo() {
  if (!(navigator.storage && navigator.storage.estimate)) return;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    const usedMB = (usage / (1024 * 1024)).toFixed(1);
    const quotaGB = (quota / (1024 * 1024 * 1024)).toFixed(1);
    storageInfoEl.textContent = `Жады: ${usedMB} МБ қолданылды · шамамен ${quotaGB} ГБ бос орын бар`;
  } catch {
    storageInfoEl.textContent = '';
  }
}

if (navigator.storage && navigator.storage.persist) {
  // Браузерден деректерді автоматты тазаламауын сұраймыз (best-effort — Safari-де әрқашан қолдау таппайды)
  navigator.storage.persist().catch(() => {});
}

// ================= Күй =================
let tracks = [];
let currentIndex = -1;
let currentUrl = null;
let shuffle = false;
let repeat = false;

// Визуализатор бар-күйлері (нақты Web Audio API талдауышы ЕМЕС — әдейі,
// төмендегі ескертуді қара)
const BAR_COUNT = 28;
let barHeights = new Array(BAR_COUNT).fill(0);
let barTargets = new Array(BAR_COUNT).fill(0);

// ================= Іске қосу =================
async function init() {
  tracks = await MusicDB.getAllTracks();
  renderPlaylist();
  refreshStorageInfo();

  const savedVolume = parseFloat(localStorage.getItem('mp-volume'));
  if (!isNaN(savedVolume)) {
    audio.volume = savedVolume;
    volume.value = savedVolume;
  }

  const savedIndex = Number(localStorage.getItem('mp-last-index'));
  if (tracks.length && !isNaN(savedIndex) && savedIndex >= 0 && savedIndex < tracks.length) {
    loadTrack(savedIndex, false);
  } else if (tracks.length) {
    loadTrack(0, false);
  }
}
init();

// ================= Плейлист рендер =================
function renderPlaylist() {
  playlistEl.innerHTML = '';
  trackCountEl.textContent = tracks.length;
  emptyEl.style.display = tracks.length ? 'none' : 'block';

  tracks.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = i === currentIndex ? 'active' : '';
    li.innerHTML = `
      <span class="idx">${i + 1}</span>
      <span class="name">${escapeHtml(t.name)}</span>
      <button class="del" data-id="${t.id}" title="Өшіру">✕</button>
    `;
    li.addEventListener('click', (e) => {
      if (e.target.closest('.del')) return;
      loadTrack(i, true);
    });
    playlistEl.appendChild(li);
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ================= Трек жүктеу/ойнату =================
function loadTrack(index, autoplay) {
  if (!tracks[index]) return;
  currentIndex = index;

  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(tracks[index].blob);
  audio.src = currentUrl;

  setTrackName(tracks[index].name);
  localStorage.setItem('mp-last-index', index);
  renderPlaylist();
  updateMediaSession(tracks[index]);

  if (autoplay) {
    audio.play().catch(() => {});
  }
}

function setTrackName(name) {
  trackNameEl.textContent = name;
  trackNameEl.classList.remove('scrolling');
  // келесі кадрда өлшеп, ұзын болса скролл қосамыз
  requestAnimationFrame(() => {
    const box = trackNameEl.parentElement;
    if (trackNameEl.scrollWidth > box.clientWidth) {
      trackNameEl.classList.add('scrolling');
    }
  });
}

// ================= Транспорт басқару =================
playBtn.addEventListener('click', () => {
  if (!tracks.length) return;
  if (currentIndex === -1) { loadTrack(0, true); return; }
  if (audio.paused) {
    audio.play().catch(() => {});
  } else {
    audio.pause();
  }
});

audio.addEventListener('play', () => {
  playBtn.textContent = '⏸';
  screenBox.classList.add('playing');
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});
audio.addEventListener('pause', () => {
  playBtn.textContent = '▶';
  screenBox.classList.remove('playing');
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});
audio.addEventListener('ended', () => {
  if (repeat) {
    audio.currentTime = 0;
    audio.play();
  } else {
    nextTrack();
  }
});

prevBtn.addEventListener('click', prevTrack);
nextBtn.addEventListener('click', nextTrack);

shuffleBtn.addEventListener('click', () => {
  shuffle = !shuffle;
  shuffleBtn.classList.toggle('active', shuffle);
});
repeatBtn.addEventListener('click', () => {
  repeat = !repeat;
  repeatBtn.classList.toggle('active', repeat);
});

function nextTrack() {
  if (!tracks.length) return;
  const idx = shuffle
    ? Math.floor(Math.random() * tracks.length)
    : (currentIndex + 1) % tracks.length;
  loadTrack(idx, true);
}
function prevTrack() {
  if (!tracks.length) return;
  const idx = (currentIndex - 1 + tracks.length) % tracks.length;
  loadTrack(idx, true);
}

// ================= Media Session API =================
// Бұл — телефонға "нақты музыка ойнатылып жатыр" деп білдіретін стандартты
// API. Осының арқасында: 1) құлыптау экранында/басқару орталығында
// трек аты мен түймелер шығады, 2) iOS/Android бетті фонда өлтірмей,
// ойнатуды жалғастыруға рұқсат етеді.
function updateMediaSession(track) {
  if (!('mediaSession' in navigator) || !track) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.name,
    artist: 'Offline Music Player',
    artwork: [{ src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml' }]
  });
}

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => audio.play().catch(() => {}));
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
  navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.seekTime != null) audio.currentTime = details.seekTime;
  });
}

// ================= Уақыт / seek =================
audio.addEventListener('timeupdate', () => {
  if (!isNaN(audio.duration)) {
    seek.value = (audio.currentTime / audio.duration) * 100;
    curTimeEl.textContent = formatTime(audio.currentTime);

    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: audio.currentTime
        });
      } catch {}
    }
  }
});
audio.addEventListener('loadedmetadata', () => {
  totalTimeEl.textContent = formatTime(audio.duration);
});
seek.addEventListener('input', () => {
  if (audio.duration) audio.currentTime = (seek.value / 100) * audio.duration;
});

function formatTime(sec) {
  if (isNaN(sec) || sec === Infinity) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ================= Дыбыс деңгейі =================
volume.addEventListener('input', () => {
  audio.volume = volume.value;
  localStorage.setItem('mp-volume', volume.value);
});

// ================= Ән қосу (телефон/компьютер файл бөлімінен) =================
// Ескерту: <input> сүзгісі (accept="audio/*") әдейі алынып тасталды — iOS-та
// кейбір MP3 файлдардың ішкі түрі (UTI) дұрыс танылмай, сүзгі оларды
// таңдатпай тастайтын жағдай болатын. Енді кез келген файл көрінеді,
// ал аудио еместерін осында JS арқылы сүземіз.
const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'flac', 'opus', 'weba', 'wma'];

function isLikelyAudio(file) {
  if (file.type && file.type.startsWith('audio')) return true;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return AUDIO_EXT.includes(ext);
}

addBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
  const allFiles = Array.from(e.target.files);
  if (!allFiles.length) return;

  const files = allFiles.filter(isLikelyAudio);
  const skipped = allFiles.length - files.length;

  const originalLabel = addBtn.textContent;
  addBtn.disabled = true;

  let okCount = 0;
  const failedNames = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    addBtn.textContent = `Қосылуда... ${i + 1}/${files.length}`;
    try {
      await MusicDB.addTrack(file);
      okCount++;
    } catch (err) {
      // Бір файл қатесе де, қалғандарын жалғастырамыз — бұрын осы жерде
      // бүкіл цикл үнсіз тоқтап, ештеңе қосылмағандай көрінетін.
      console.error('Ән қосылмады:', file.name, err);
      failedNames.push(file.name);
    }
    // Әр файлдан кейін дереу жаңартамыз, сондықтан біреуі қатесе де
    // сәтті қосылғандары бірден плейлистте көрінеді.
    tracks = await MusicDB.getAllTracks();
    renderPlaylist();
  }

  refreshStorageInfo();
  if (currentIndex === -1 && tracks.length) loadTrack(0, false);

  addBtn.disabled = false;
  addBtn.textContent = originalLabel;
  fileInput.value = '';

  const parts = [];
  if (okCount) parts.push(`${okCount} ән қосылды ✓`);
  if (failedNames.length) parts.push(`${failedNames.length} қосылмады: ${failedNames.join(', ')}`);
  if (skipped) parts.push(`${skipped} файл аудио емес деп өткізілді`);

  showToast(parts.join(' · ') || 'Ештеңе таңдалмады', failedNames.length > 0);
});

// ================= Трек өшіру =================
playlistEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('.del');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const deletingCurrent = tracks[currentIndex] && tracks[currentIndex].id === id;

  await MusicDB.deleteTrack(id);
  tracks = await MusicDB.getAllTracks();
  refreshStorageInfo();

  if (deletingCurrent) {
    audio.pause();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = null;
    currentIndex = -1;
    setTrackName(tracks.length ? '' : 'Треки жоқ — төменнен қос');
  }
  renderPlaylist();
});

// ================= Визуализатор (жалған-анимация) =================
// Маңызды: бұрын мұнда createMediaElementSource() арқылы <audio>
// шығысы Web Audio API графигі арқылы өтетін. iOS телефон фонға
// кеткенде немесе экран құлыпталғанда сол AudioContext-ті тоқтатып
// тастайды — сондықтан музыка да тоқтап қалатын. Енді визуализатор
// толығымен CSS/JS анимациясы, дыбыс ағынына мүлдем тимейді — сол
// себепті <audio> өз алдына табиғи түрде фонда ойнай береді.
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function tickVisualizer() {
  requestAnimationFrame(tickVisualizer);
  const playing = !audio.paused && !audio.ended;

  for (let i = 0; i < BAR_COUNT; i++) {
    if (playing && Math.random() < 0.12) {
      barTargets[i] = 0.15 + Math.random() * 0.85;
    } else if (!playing) {
      barTargets[i] = 0;
    }
    // жұмсақ өту (easing) — секірмей, толқындай қозғалу үшін
    barHeights[i] += (barTargets[i] - barHeights[i]) * 0.15;
  }
  drawBars();
}

function drawBars() {
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  const barWidth = (canvas.width / BAR_COUNT) * 0.65;
  const gap = (canvas.width / BAR_COUNT) * 0.35;

  for (let i = 0; i < BAR_COUNT; i++) {
    const h = Math.max(2, barHeights[i] * canvas.height);
    canvasCtx.fillStyle = 'rgba(57, 255, 143, 0.9)';
    canvasCtx.fillRect(i * (barWidth + gap), canvas.height - h, barWidth, h);
  }
}
tickVisualizer();
