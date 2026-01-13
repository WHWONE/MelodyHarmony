// ============================================================
// ui-controller.js - UI event handlers + rendering
// ============================================================

import { midiToPitch } from './utils.js';
import { 
  generateRuleBasedNumerals, 
  buildChord, 
  applyVoiceLeading, 
  applyDurations 
} from './harmony-engine.js';
import { 
  generateMelodyStructured, 
  transposeMelodyOctaves 
} from './melody-engine.js';
import { 
  ensureAudioReady, 
  stopPlayback, 
  playComposition, 
  clearDownload, 
  startRecording, 
  stopRecordingAndPrepareDownload,
  getRecordingState
} from './audio-engine.js';

const USE_DECEPTIVE_CADENCE = false;
const MELODY_OCTAVE_SHIFT = 1;

// DOM elements
const messages = document.getElementById("messages");
const statusEl = document.getElementById("status");
const downloadArea = document.getElementById("downloadArea");
const output = document.getElementById("output");

const keyEl = document.getElementById("key");
const modeEl = document.getElementById("mode");
const barsEl = document.getElementById("bars");
const barsLabel = document.getElementById("barsLabel");
const chordsPerBarEl = document.getElementById("chordsPerBar");
const progressionChordsEl = document.getElementById("progressionChords");
const progressionChordsLabel = document.getElementById("progressionChordsLabel");
const progressionPlaybackEl = document.getElementById("progressionPlayback");
const octaveEl = document.getElementById("octave");
const preferEl = document.getElementById("preferAccidentals");
const tempoEl = document.getElementById("tempo");
const tempoLabel = document.getElementById("tempoLabel");
const strumEl = document.getElementById("strumMs");
const strumLabel = document.getElementById("strumLabel");
const chordPatternEl = document.getElementById("chordPattern");
const rhythmStyleEl = document.getElementById("rhythmStyle");
const melDensityEl = document.getElementById("melDensity");
const melDensityLabel = document.getElementById("melDensityLabel");
const chordTonePrefEl = document.getElementById("chordTonePref");
const chordTonePrefLabel = document.getElementById("chordTonePrefLabel");
const maxLeapEl = document.getElementById("maxLeap");
const maxLeapLabel = document.getElementById("maxLeapLabel");
const phraseMeasuresEl = document.getElementById("phraseMeasures");
const phraseMeasuresLabel = document.getElementById("phraseMeasuresLabel");
const motifRepeatEl = document.getElementById("motifRepeat");
const motifRepeatLabel = document.getElementById("motifRepeatLabel");
const cadenceStrengthEl = document.getElementById("cadenceStrength");
const cadenceStrengthLabel = document.getElementById("cadenceStrengthLabel");

const generateBtn = document.getElementById("generate");
const playBtn = document.getElementById("play");
const stopBtn = document.getElementById("stop");
const copyBtn = document.getElementById("copyJson");
const recordBtn = document.getElementById("record");
const stopRecordBtn = document.getElementById("stopRecord");
const recordPlayBtn = document.getElementById("recordPlay");

let lastComposition = null;
let stopTimer = null;

function showError(msg) {
  messages.innerHTML = `<div class="error">${msg}</div>`;
}

function clearError() {
  messages.innerHTML = "";
}

function setStatus(text) {
  statusEl.textContent = text;
}

function buildFromUI() {
  return {
    key: keyEl.value,
    mode: modeEl.value,
    bars: parseInt(barsEl.value, 10),
    chordsPerBar: parseInt(chordsPerBarEl.value, 10),
    progressionChords: parseInt(progressionChordsEl.value, 10),
    progressionPlayback: progressionPlaybackEl.value,
    chordPattern: chordPatternEl.value,
    octave: parseInt(octaveEl.value, 10),
    prefer: preferEl.value,
    tempo: parseInt(tempoEl.value, 10),
    strumMs: parseInt(strumEl.value, 10),
    rhythmStyle: rhythmStyleEl.value,
    melodyDensity: parseInt(melDensityEl.value, 10),
    chordTonePref: parseInt(chordTonePrefEl.value, 10),
    maxLeap: parseInt(maxLeapEl.value, 10),
    phraseMeasures: parseInt(phraseMeasuresEl.value, 10),
    motifRepeat: parseInt(motifRepeatEl.value, 10),
    cadenceStrength: parseInt(cadenceStrengthEl.value, 10)
  };
}

function safeFilenameBase(cfg) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `bluepath_${cfg.key}_${cfg.mode}_${cfg.tempo}bpm_${ts}`;
}

function mapProgressionToSlots(baseNumerals, totalSlots, mode) {
  const progLen = baseNumerals.length;

  if (totalSlots <= 0) return [];
  if (progLen <= 0) return new Array(totalSlots).fill("1");

  if (mode === "loop") {
    const out = [];
    for (let i = 0; i < totalSlots; i++) out.push(baseNumerals[i % progLen]);
    return out;
  }

  if (mode === "stretch") {
    if (totalSlots === 1) return [baseNumerals[progLen - 1]];
    const out = [];
    for (let i = 0; i < totalSlots; i++) {
      const t = i / (totalSlots - 1);
      const idx = Math.round(t * (progLen - 1));
      out.push(baseNumerals[Math.max(0, Math.min(progLen - 1, idx))]);
    }
    return out;
  }

  if (progLen === totalSlots) return baseNumerals.slice();

  if (progLen < totalSlots) {
    const out = baseNumerals.slice();
    const last = baseNumerals[progLen - 1];
    while (out.length < totalSlots) out.push(last);
    return out;
  }

  if (totalSlots === 1) return [baseNumerals[progLen - 1]];

  const out = new Array(totalSlots);
  out[0] = baseNumerals[0];
  out[totalSlots - 1] = baseNumerals[progLen - 1];

  const innerSlots = totalSlots - 2;
  const innerProg = progLen - 2;

  for (let s = 1; s <= innerSlots; s++) {
    const t = s / (innerSlots + 1);
    const idx = 1 + Math.floor(t * innerProg);
    out[s] = baseNumerals[Math.max(1, Math.min(progLen - 2, idx))];
  }
  return out;
}

function generateComposition(cfg) {
  const totalSlots = cfg.bars * cfg.chordsPerBar;

  const progLen = Math.max(1, parseInt(cfg.progressionChords, 10) || 4);
  const baseNumerals = generateRuleBasedNumerals(progLen, USE_DECEPTIVE_CADENCE);
  const numerals = mapProgressionToSlots(baseNumerals, totalSlots, cfg.progressionPlayback);
  const chords = numerals.map(n => {
    const degree = parseInt(n, 10) - 1;
    return buildChord({ key: cfg.key, mode: cfg.mode, degree, octave: cfg.octave, prefer: cfg.prefer });
  });

  let enhanced = applyVoiceLeading(chords);
  enhanced = applyDurations(enhanced, cfg.chordsPerBar);
  enhanced = enhanced.map(ch => ({ 
    ...ch, 
    notes: ch.voicingMidis.map(m => midiToPitch(m, cfg.prefer)) 
  }));

  const prog = {
    id: "p4_" + Date.now() + "_" + Math.random().toString(36).slice(2),
    key: cfg.key, mode: cfg.mode,
    bars: cfg.bars,
    chordsPerBar: cfg.chordsPerBar,
    chordPattern: cfg.chordPattern,
    octave: cfg.octave,
    template: "ruleBased",
    chords: enhanced
  };

  const mel = generateMelodyStructured(prog, cfg);

  const shiftedMelody = transposeMelodyOctaves({
    melody: mel.melody,
    prog,
    prefer: cfg.prefer,
    shiftOctaves: MELODY_OCTAVE_SHIFT
  });

  return {
    progression: prog,
    melody: shiftedMelody,
    phraseMarkers: mel.phraseMarkers,
    totalBeats: mel.totalBeats
  };
}

function renderMelodyViz(comp) {
  const { melody, phraseMarkers, totalBeats } = comp;
  const box = document.createElement("div");
  box.className = "melodyBox";

  const h = document.createElement("div");
  h.innerHTML = "<b>Composition Visualization</b> (Harmony + Melody)";
  box.appendChild(h);

  const grid = document.createElement("div");
  grid.className = "melodyGrid";

  const pxPerBeat = 22;
  const width = Math.max(700, Math.ceil(totalBeats * pxPerBeat) + 60);

  const inner = document.createElement("div");
  inner.style.position = "relative";
  inner.style.width = width + "px";
  inner.style.height = "160px";
  grid.appendChild(inner);

  const beatsInt = Math.ceil(totalBeats);
  for (let b = 0; b <= beatsInt; b += 1) {
    const x = b * pxPerBeat;

    const line = document.createElement("div");
    line.className = "beatLine" + ((b % 4 === 0) ? " measureLine" : "");
    line.style.left = x + "px";
    inner.appendChild(line);

    if (b % 4 === 0) {
      const barNum = (b / 4) + 1;
      const lbl = document.createElement("div");
      lbl.className = "barLabel";
      lbl.style.left = x + "px";
      lbl.textContent = `Bar ${barNum}`;
      inner.appendChild(lbl);
    }
  }

  const melodyMidis = melody
    .filter(n => !n.isRest && Number.isFinite(n.midi))
    .map(n => n.midi);
  const chordMidis = comp.progression.chords.flatMap(ch => ch.voicingMidis);
  const allMidis = [...melodyMidis, ...chordMidis];
  const minM = allMidis.length ? Math.min(...allMidis, 48) : 48;
  const maxM = allMidis.length ? Math.max(...allMidis, 72) : 72;
  const span = Math.max(1, maxM - minM);

  let chordBeat = 0;
  comp.progression.chords.forEach(ch => {
    ch.voicingMidis.forEach(midi => {
      const el = document.createElement("div");
      el.className = "harmonyNote";
      const x = chordBeat * pxPerBeat;
      const w = ch.durationBeats * pxPerBeat - 2;
      const y = 135 - ((midi - minM) / span) * 120;
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.width = w + "px";
      inner.appendChild(el);
    });
    chordBeat += ch.durationBeats;
  });

  phraseMarkers.forEach(b => {
    const m = document.createElement("div");
    m.className = "phraseMarker";
    m.style.left = (b * pxPerBeat) + "px";
    inner.appendChild(m);
  });

  melody.forEach(n => {
    if (n.isRest) return;
    const el = document.createElement("div");
    el.className = "melodyNote";
    const x = n.startBeat * pxPerBeat;
    const w = Math.max(8, n.durationBeats * pxPerBeat - 2);
    const y = 135 - ((n.midi - minM) / span) * 120;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.width = w + "px";
    el.style.background = n.isChordTone ? "rgba(0, 123, 255, 0.85)" : "rgba(0, 123, 255, 0.45)";
    inner.appendChild(el);
  });

  box.appendChild(grid);
  return box;
}

function renderComposition(comp) {
  output.innerHTML = "";

  const prog = comp.progression;
  const title = document.createElement("h3");
  title.textContent = `Progression (${prog.bars} bars • ${prog.chords.length} chords • ${prog.chordsPerBar} chords/bar)`;
  output.appendChild(title);

  const wrap = document.createElement("div");
  wrap.className = "cards";

  prog.chords.forEach((ch) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="roman">${ch.roman}</div>
      <div class="name">${(ch.spelledRoot || ch.notes[0]).replace(/\d+$/, "")} • ${ch.chordType || ch.quality}</div>
      <div class="notes">${ch.notes.join(" ")}</div>
      <div class="meta">Duration: ${ch.durationBeats} beats</div>
    `;
    wrap.appendChild(card);
  });

  output.appendChild(wrap);
  output.appendChild(renderMelodyViz(comp));

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `ID: ${prog.id} • Key: ${prog.key} • Mode: ${prog.mode} • Bars: ${prog.bars} • Chords/bar: ${prog.chordsPerBar} • Pattern: ${prog.chordPattern} • Total beats: ${comp.totalBeats}`;
  output.appendChild(meta);
}

// Event listeners
barsEl.addEventListener("input", () => (barsLabel.textContent = barsEl.value));
progressionChordsEl.addEventListener("input", () => (progressionChordsLabel.textContent = progressionChordsEl.value));
tempoEl.addEventListener("input", () => (tempoLabel.textContent = tempoEl.value));
strumEl.addEventListener("input", () => (strumLabel.textContent = strumEl.value));
melDensityEl.addEventListener("input", () => (melDensityLabel.textContent = melDensityEl.value));
chordTonePrefEl.addEventListener("input", () => (chordTonePrefLabel.textContent = chordTonePrefEl.value));
maxLeapEl.addEventListener("input", () => (maxLeapLabel.textContent = maxLeapEl.value));
phraseMeasuresEl.addEventListener("input", () => (phraseMeasuresLabel.textContent = phraseMeasuresEl.value));
motifRepeatEl.addEventListener("input", () => (motifRepeatLabel.textContent = motifRepeatEl.value));
cadenceStrengthEl.addEventListener("input", () => (cadenceStrengthLabel.textContent = cadenceStrengthEl.value));

generateBtn.addEventListener("click", () => {
  try {
    clearError();
    clearDownload(downloadArea);
    lastComposition = generateComposition(buildFromUI());
    renderComposition(lastComposition);
    setStatus("Generated");
  } catch (e) {
    showError(e.message || String(e));
    setStatus("Error");
  }
});

playBtn.addEventListener("click", async () => {
  try {
    clearError();
    if (!lastComposition) generateBtn.click();

    const cfg = buildFromUI();
    await ensureAudioReady();

    stopBtn.disabled = false;
    setStatus(getRecordingState() ? "Playing + Recording..." : "Playing...");

    const totalSeconds = playComposition(lastComposition, cfg.tempo, cfg.strumMs);

    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = setTimeout(() => {
      stopBtn.disabled = true;
      setStatus(getRecordingState() ? "Finished (still recording)" : "Finished");
    }, Math.ceil((totalSeconds + 0.3) * 1000));
  } catch (e) {
    showError(e.message || String(e));
    setStatus("Error");
  }
});

stopBtn.addEventListener("click", () => {
  stopPlayback();
  if (stopTimer) clearTimeout(stopTimer);
  stopBtn.disabled = true;
  setStatus(getRecordingState() ? "Stopped playback (still recording)" : "Stopped");
});

copyBtn.addEventListener("click", async () => {
  try {
    clearError();
    if (!lastComposition) generateBtn.click();
    const json = JSON.stringify(lastComposition, null, 2);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(json);
      setStatus("Copied JSON");
    } else {
      window.prompt("Copy JSON:", json);
    }
  } catch (e) {
    showError(e.message || String(e));
    setStatus("Error");
  }
});

recordBtn.addEventListener("click", async () => {
  try {
    clearError();
    await ensureAudioReady();
    await startRecording();
    setStatus("Recording...");
    stopRecordBtn.disabled = false;
  } catch (e) {
    showError(e.message || String(e));
    setStatus("Error");
  }
});

stopRecordBtn.addEventListener("click", async () => {
  try {
    clearError();
    const cfg = buildFromUI();
    const status = await stopRecordingAndPrepareDownload(safeFilenameBase(cfg), downloadArea);
    setStatus(status);
    stopRecordBtn.disabled = true;
  } catch (e) {
    showError(e.message || String(e));
    setStatus("Error");
  }
});

recordPlayBtn.addEventListener("click", async () => {
  try {
    clearError();
    if (!lastComposition) generateBtn.click();

    const cfg = buildFromUI();
    await ensureAudioReady();

    stopBtn.disabled = false;
    stopRecordBtn.disabled = false;

    await startRecording();
    setStatus("Recording + Playing...");

    const totalSeconds = playComposition(lastComposition, cfg.tempo, cfg.strumMs);

    const waitMs = Math.ceil((totalSeconds + 0.35) * 1000);
    setTimeout(async () => {
      try {
        stopPlayback();
        stopBtn.disabled = true;
        const status = await stopRecordingAndPrepareDownload(safeFilenameBase(cfg), downloadArea);
        setStatus(status);
        stopRecordBtn.disabled = true;
      } catch (e) {
        showError(e.message || String(e));
        setStatus("Error");
      }
    }, waitMs);

  } catch (e) {
    showError(e.message || String(e));
    setStatus("Error");
  }
});

// Auto-generate once on load
generateBtn.click();