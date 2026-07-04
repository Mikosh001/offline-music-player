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

// ================= Күй =================
let tracks = [];
let currentIndex = -1;
let currentUrl = null;
let shuffle = false;
let repeat = false;
let audioCtx, analyser, dataArray, sourceNode;

// ================= Іске қосу =================
async function init() {
  tracks = await MusicDB.getAllTracks();
  renderPlaylist();

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

  if (autoplay) {
    ensureAudioContext();
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
  ensureAudioContext();
  if (audio.paused) {
    audio.play().catch(() => {});
  } else {
    audio.pause();
  }
});

audio.addEventListener('play', () => {
  playBtn.textContent = '⏸';
  screenBox.classList.add('playing');
});
audio.addEventListener('pause', () => {
  playBtn.textContent = '▶';
  screenBox.classList.remove('playing');
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

// ================= Уақыт / seek =================
audio.addEventListener('timeupdate', () => {
  if (!isNaN(audio.duration)) {
    seek.value = (audio.currentTime / audio.duration) * 100;
    curTimeEl.textContent = formatTime(audio.currentTime);
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
addBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  for (const file of files) {
    await MusicDB.addTrack(file);
  }
  tracks = await MusicDB.getAllTracks();
  renderPlaylist();
  if (currentIndex === -1 && tracks.length) loadTrack(0, false);
  fileInput.value = '';
});

// ================= Трек өшіру =================
playlistEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('.del');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const deletingCurrent = tracks[currentIndex] && tracks[currentIndex].id === id;

  await MusicDB.deleteTrack(id);
  tracks = await MusicDB.getAllTracks();

  if (deletingCurrent) {
    audio.pause();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = null;
    currentIndex = -1;
    setTrackName(tracks.length ? '' : 'Треки жоқ — төменнен қос');
  }
  renderPlaylist();
});

// ================= Web Audio API визуализатор =================
// Ескерту: iOS/Safari-де AudioContext тек пайдаланушы түрткен әрекеттен
// кейін ғана іске қосылады, сондықтан ensureAudioContext() play басқанда шақырылады.
function ensureAudioContext() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioCtx.createMediaElementSource(audio);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 64;
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  drawVisualizer();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function drawVisualizer() {
  requestAnimationFrame(drawVisualizer);
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  if (!analyser) return;

  analyser.getByteFrequencyData(dataArray);
  const barCount = dataArray.length;
  const barWidth = canvas.width / barCount * 0.7;
  const gap = canvas.width / barCount * 0.3;

  for (let i = 0; i < barCount; i++) {
    const value = dataArray[i] / 255;
    const barHeight = value * canvas.height;
    canvasCtx.fillStyle = 'rgba(57, 255, 143, 0.9)';
    canvasCtx.fillRect(i * (barWidth + gap), canvas.height - barHeight, barWidth, barHeight);
  }
}
