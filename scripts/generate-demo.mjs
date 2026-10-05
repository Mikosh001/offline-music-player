import { mkdir, writeFile } from "node:fs/promises";
// Original short instrumental sketches, synthesized here. No samples or artist recordings.
const sampleRate = 22050,
  duration = 24,
  frames = sampleRate * duration;
const dir = new URL("../assets/audio/", import.meta.url);
await mkdir(dir, { recursive: true });
for (const [filename, notes, pace] of [
  ["qazaq-wave.wav", [220, 261.63, 329.63, 293.66], 0.375],
  ["quiet-evening.wav", [196, 246.94, 293.66, 369.99], 0.75],
]) {
  const data = Buffer.alloc(44 + frames * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + frames * 2, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sampleRate, 24);
  data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    const time = i / sampleRate,
      step = Math.floor(time / pace),
      phase = time % pace,
      note = notes[step % notes.length];
    const env = Math.exp(-phase * 4) * Math.min(1, phase * 40);
    const lead = Math.sin(2 * Math.PI * note * time) * env * 0.19;
    const pad =
      notes
        .slice(0, 3)
        .reduce((n, f) => n + Math.sin(2 * Math.PI * f * 0.5 * time), 0) *
      0.022;
    const beat =
      pace < 0.5
        ? Math.sin(2 * Math.PI * (55 - 20 * phase) * phase) *
          Math.exp(-phase * 24) *
          0.13
        : 0;
    const fade = Math.min(1, time, Math.max(0, (duration - time) / 2));
    data.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, (lead + pad + beat) * fade)) * 32767),
      44 + i * 2,
    );
  }
  await writeFile(new URL(filename, dir), data);
  console.log(`${filename}: ${data.length} bytes`);
}
