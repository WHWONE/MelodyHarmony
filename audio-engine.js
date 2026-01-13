// ============================================================
// audio-engine.js - SoundFont playback + recording
// ============================================================

const BEATS_PER_BAR = 4;

let audioCtx = null;
let chordInstrument = null;
let melodyInstrument = null;

let scheduledNodes = [];
let isAudioReady = false;

// Recording
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let lastRecordingUrl = null;

// ------------------------------------------------------------
// Audio init
// ------------------------------------------------------------
export async function ensureAudioReady() {
  if (isAudioReady) return;

  // ✅ NUMBER TWO GOES HERE
  if (!window.Soundfont) {
    throw new Error("soundfont-player failed to load (Soundfont is undefined).");
  }
  
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  chordInstrument = await Soundfont.instrument(audioCtx, 'acoustic_grand_piano');
  melodyInstrument = await Soundfont.instrument(audioCtx, 'acoustic_grand_piano');

  isAudioReady = true;
}

// ------------------------------------------------------------
// Playback control
// ------------------------------------------------------------
export function stopPlayback() {
  scheduledNodes.forEach(n => {
    try { n.stop(); } catch (_) {}
  });
  scheduledNodes = [];
}

function beatToSeconds(beat, tempo) {
  return (beat * 60) / tempo;
}

// ------------------------------------------------------------
// Scheduling
// ------------------------------------------------------------
export function scheduleComposition(comp, tempo, strumMs) {
  stopPlayback();

  const startTime = audioCtx.currentTime + 0.05;
  const strumStep = Math.max(0, strumMs) / 1000;

  let currentBeats = 0;

  const PATTERNS = {
    sustain:         { offsets: [0], gate: "sustain" },
    sustainAccent:   { offsets: [0], gate: "sustain", accentOn1: true },
    hits13:          { offsets: [0, 2], gateBeats: 0.55 },
    hits24:          { offsets: [1, 3], gateBeats: 0.50 },
    quarterPulse:    { offsets: [0, 1, 2, 3], gateBeats: 0.40 },
    eighthPulse:     { offsets: [0,0.5,1,1.5,2,2.5,3,3.5], gateBeats: 0.28 },
    anticipationInto:{ offsets: [-0.5, 0], gateBeats: 0.55 },
    anticipateHold:  { offsets: [-0.5], gate: "sustain" }
  };

  const pattern = PATTERNS[comp.progression.chordPattern] || PATTERNS.sustain;

  // --------------------
  // Chords
  // --------------------
  comp.progression.chords.forEach(ch => {
    const durBeats = ch.durationBeats;
    const defaultGate = pattern.gate === "sustain"
      ? durBeats * 0.95
      : Math.min(durBeats * 0.9, pattern.gateBeats ?? 0.45);

    pattern.offsets.forEach(off => {
      if (off >= durBeats) return;

      const beat = currentBeats + off;
      const time = startTime + beatToSeconds(beat, tempo);
      const gateSec = beatToSeconds(
        Math.max(0.05, Math.min(defaultGate, durBeats - Math.max(0, off))),
        tempo
      );

      const beatInBar = ((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
      const barAccent = (beatInBar === 0) ? 1.18 : (beatInBar === 2 ? 1.08 : 1.0);

      ch.notes.forEach((note, idx) => {
        const t = time + idx * strumStep;
        let vel = Math.max(0.35, 0.72 - idx * 0.06);
        if (pattern.accentOn1 && beatInBar === 0) vel *= 1.12;
        vel = Math.min(0.95, vel * barAccent);

        const node = chordInstrument.play(note, t, {
          gain: vel,
          duration: gateSec
        });
        scheduledNodes.push(node);
      });
    });

    currentBeats += durBeats;
  });

  // --------------------
  // Melody
  // --------------------
  comp.melody.forEach(n => {
    if (n.isRest) return;

    const t = startTime + beatToSeconds(n.startBeat, tempo);
    const dur = beatToSeconds(n.durationBeats * 0.98, tempo);

    const node = melodyInstrument.play(n.pitch, t, {
      gain: n.velocity,
      duration: dur
    });
    scheduledNodes.push(node);
  });

  return beatToSeconds(currentBeats, tempo);
}

export function playComposition(comp, tempo, strumMs) {
  return scheduleComposition(comp, tempo, strumMs);
}

// ------------------------------------------------------------
// Recording (MediaRecorder)
// ------------------------------------------------------------
export function clearDownload(downloadArea) {
  downloadArea.style.display = "none";
  downloadArea.innerHTML = "";
  if (lastRecordingUrl) {
    URL.revokeObjectURL(lastRecordingUrl);
    lastRecordingUrl = null;
  }
}

export async function startRecording() {
  if (isRecording) return;

  const dest = audioCtx.createMediaStreamDestination();
  audioCtx.destination.connect(dest);

  mediaRecorder = new MediaRecorder(dest.stream);
  recordedChunks = [];

  mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
  mediaRecorder.start();
  isRecording = true;
}

export async function stopRecordingAndPrepareDownload(filenameBase, downloadArea) {
  if (!isRecording || !mediaRecorder) return;

  mediaRecorder.stop();
  isRecording = false;

  const blob = await new Promise(res => {
    mediaRecorder.onstop = () => res(new Blob(recordedChunks, { type: "audio/webm" }));
  });

  const url = URL.createObjectURL(blob);
  lastRecordingUrl = url;

  downloadArea.style.display = "block";
  downloadArea.innerHTML = `
    <div><b>Recording ready.</b></div>
    <div class="hint">Click to download:</div>
    <a href="${url}" download="${filenameBase}.webm">Download</a>
  `;
}

export function getRecordingState() {
  return isRecording;
}
