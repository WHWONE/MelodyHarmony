// ============================================================
// melody-engine.js - All melody generation logic
// ============================================================

import { DATA, midiToPitch, pitchToMidi, pcToPitch, snapBeats } from './utils.js';
import { getDiatonicScaleSpelled } from './harmony-engine.js';

const MELODY_OCTAVE_SHIFT = 1;
const MELODY_REST_CHANCE = 0.18;
const MELODY_STEP = 0.25;

// Rhythm presets
export const RHYTHM_PRESETS = {
  pop: { 
    0.25: 0.6, 0.5: 3.0, 1.0: 2.5, 1.5: 0.8, 2.0: 0.4, 3.0: 0.1
  },
  ballad: {
    0.25: 0.2, 0.5: 1.0, 1.0: 2.5, 1.5: 1.8, 2.0: 2.0, 3.0: 1.0
  },
  syncopated: {
    0.25: 1.0, 0.5: 2.5, 1.0: 1.5, 1.5: 2.5, 2.0: 0.6, 3.0: 0.2
  },
  sparse: {
    0.25: 0.1, 0.5: 0.8, 1.0: 2.0, 1.5: 1.5, 2.0: 2.5, 3.0: 1.5
  },
  latin: {
    0.25: 0.4, 0.5: 3.5, 1.0: 1.2, 1.5: 1.8, 2.0: 0.3, 3.0: 0.1
  },
  jazz: {
    0.25: 1.5, 0.5: 2.0, 1.0: 2.2, 1.5: 2.5, 2.0: 1.0, 3.0: 0.5
  },
  minimalist: {
    0.25: 0.1, 0.5: 0.3, 1.0: 4.0, 1.5: 0.2, 2.0: 1.5, 3.0: 0.1
  },
  flowing: {
    0.25: 2.5, 0.5: 3.0, 1.0: 0.8, 1.5: 0.2, 2.0: 0.1, 3.0: 0.05
  },
  dramatic: {
    0.25: 1.5, 0.5: 0.5, 1.0: 0.8, 1.5: 0.3, 2.0: 3.0, 3.0: 2.5
  },
  funky: {
    0.25: 2.5, 0.5: 2.8, 1.0: 1.5, 1.5: 0.4, 2.0: 0.2, 3.0: 0.1
  }
};

function buildChordTimeline(prog) {
  let beat = 0;
  const timeline = prog.chords.map((ch) => {
    const startBeat = beat;
    beat += ch.durationBeats;
    return { startBeat, endBeat: beat, chord: ch };
  });
  return { timeline, totalBeats: beat };
}

function chordAtBeat(tline, beat) {
  for (const seg of tline.timeline) {
    if (beat >= seg.startBeat && beat < seg.endBeat) return seg.chord;
  }
  return tline.timeline[tline.timeline.length - 1].chord;
}

function modeIntervals(mode) {
  return mode === "major" 
    ? [0,2,4,5,7,9,11] 
    : [0,2,3,5,7,8,11]; // harmonic minor
}

export function buildScaleMidis(key, mode, centerOctave) {
  const keyPc = DATA.noteToPc[key];
  const scale = modeIntervals(mode);
  const pool = [];
  for (let oct = centerOctave - 1; oct <= centerOctave + 1; oct++) {
    for (const interval of scale) {
      const pc = (keyPc + interval) % 12;
      pool.push(pitchToMidi(pcToPitch(pc, oct, "sharps")));
    }
  }
  return Array.from(new Set(pool)).sort((a,b)=>a-b);
}

function pickNearest(pool, target, n=10) {
  return pool.slice().sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)).slice(0,n);
}

export function chooseMelodyMidi({ chordMidis, scalePool, prevMidi, chordTonePref, maxLeap }) {
  const center = chordMidis.reduce((s,m)=>s+m,0)/chordMidis.length;
  const target = prevMidi != null ? prevMidi : center;

  const preferChord = Math.random() < chordTonePref;
  let candidates = pickNearest(preferChord ? chordMidis : scalePool, target, 10);

  if (prevMidi != null) {
    const filtered = candidates.filter(m => Math.abs(m - prevMidi) <= maxLeap);
    if (filtered.length) candidates = filtered;
  }

  if (prevMidi != null && Math.random() < 0.6) {
    return candidates.slice().sort((a,b)=>Math.abs(a-prevMidi)-Math.abs(b-prevMidi))[0];
  }

  const top = candidates.slice(0, Math.min(4, candidates.length));
  return top[Math.floor(Math.random() * top.length)];
}

function weightedChoice(items) {
  const total = items.reduce((s, it) => s + it.w, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function clampSnapDuration(dur, remaining) {
  const d = Math.max(MELODY_STEP, Math.min(dur, remaining));
  return snapBeats(d);
}

export function pickDurationMusical({ 
  baseWeights, remaining, beatInBar, lastDuration, densityPercent
}) {
  let candidates = Object.entries(baseWeights)
    .filter(([dur, w]) => parseFloat(dur) <= remaining + 1e-9 && w > 0);
  
  if (candidates.length === 0) {
    return Math.max(MELODY_STEP, remaining);
  }
  
  const maxDur = densityPercent > 70 ? 1.0 : 
                 densityPercent > 50 ? 1.5 : 3.0;
  candidates = candidates.filter(([dur]) => parseFloat(dur) <= maxDur);
  
  if (candidates.length === 0) {
    return Math.max(MELODY_STEP, Math.min(maxDur, remaining));
  }
  
  candidates = candidates.map(([dur, w]) => {
    let bias = 1.0;
    const d = parseFloat(dur);
    const onDownbeat = (beatInBar % 2 < 0.1);
    
    if (d >= 2.0 && onDownbeat) bias *= 3.0;
    if (d >= 2.0 && !onDownbeat) bias *= 0.2;
    if (d <= 0.5 && !onDownbeat) bias *= 1.5;
    
    return [dur, w * bias];
  });
  
  if (lastDuration && lastDuration >= 2.0) {
    candidates = candidates.map(([dur, w]) => {
      const d = parseFloat(dur);
      return [dur, d <= 1.0 ? w * 2.0 : w * 0.3];
    });
  }
  
  const items = candidates.map(([dur, w]) => ({ beats: parseFloat(dur), w }));
  return weightedChoice(items).beats;
}

function buildMotif(phraseNotes) {
  const slots = phraseNotes.map(n => n.startInPhrase);
  const intervals = [];
  for (let i=1; i<phraseNotes.length; i++) {
    intervals.push(phraseNotes[i].midi - phraseNotes[i-1].midi);
  }
  return { slots, intervals };
}

function realizeMotif({ motif, phraseStartBeat, phraseBeats, startMidi, maxLeap }) {
  const out = [];
  let midi = startMidi;
  for (let i=0; i<motif.slots.length; i++) {
    const s = motif.slots[i];
    if (s >= phraseBeats) continue;
    if (i>0) {
      let step = motif.intervals[i-1] ?? 0;
      if (Math.abs(step) > maxLeap) step = Math.sign(step) * maxLeap;
      midi += step;
    }
    out.push({ midi, startBeat: phraseStartBeat + s, startInPhrase: s });
  }
  return out;
}

function applyCadence({ phraseNotes, phraseEndBeat, chordEnd, cadenceStrength01, prefer }) {
  if (!phraseNotes.length) return phraseNotes;
  const last = phraseNotes[phraseNotes.length-1];

  const chordMidis = chordEnd.voicingMidis.slice().sort((a,b)=>a-b);
  const root = chordMidis[0], third = chordMidis[1], fifth = chordMidis[2];
  const weighted = [root, root, root, third, third, fifth];

  if (Math.random() < cadenceStrength01) {
    last.midi = weighted.slice().sort((a,b)=>Math.abs(a-last.midi)-Math.abs(b-last.midi))[0];
  }

  const extra = cadenceStrength01 * 1.5;
  last.durationBeats = Math.min(2.5, Math.max(last.durationBeats ?? 0.5, 0.5 + extra));
  last.velocity = Math.min(0.95, (last.velocity ?? 0.75) + cadenceStrength01 * 0.12);

  const maxDur = Math.max(0.5, phraseEndBeat - last.startBeat);
  last.durationBeats = Math.min(last.durationBeats, maxDur);

  last.pitch = midiToPitch(last.midi, prefer);
  last.isChordTone = chordEnd.voicingMidis.includes(last.midi);

  return phraseNotes;
}

export function generateMelodyStructured(prog, cfg) {
  const tline = buildChordTimeline(prog);
  const scalePool = buildScaleMidis(cfg.key, cfg.mode, cfg.octave + 1);

  const rhythmPreset = cfg.rhythmStyle || 'pop';
  const baseWeights = RHYTHM_PRESETS[rhythmPreset] || RHYTHM_PRESETS.pop;
  const density01 = cfg.melodyDensity/100;

  const beatsPerPhrase = cfg.phraseMeasures * 4;
  const phraseCount = Math.ceil(tline.totalBeats / beatsPerPhrase);
  const phraseMarkers = Array.from({length: phraseCount}, (_,i)=> i*beatsPerPhrase);

  let storedMotif = null;
  let prevMidi = null;
  let lastDuration = null;
  const melody = [];

  for (let p=0; p<phraseCount; p++) {
    const phraseStart = p * beatsPerPhrase;
    const phraseEnd = Math.min(tline.totalBeats, phraseStart + beatsPerPhrase);
    const phraseBeats = phraseEnd - phraseStart;

    const chordTonePref = cfg.chordTonePref/100;
    const reuse = (p>0) && storedMotif && (Math.random() < (cfg.motifRepeat/100));
    let phraseNotes = [];

    if (reuse) {
      const chordStart = chordAtBeat(tline, phraseStart);
      const chordMidis = chordStart.voicingMidis;
      const center = chordMidis.reduce((s,m)=>s+m,0)/chordMidis.length;
      const startMidi = chooseMelodyMidi({
        chordMidis, scalePool,
        prevMidi: prevMidi != null ? prevMidi : center,
        chordTonePref, maxLeap: cfg.maxLeap
      });

      const realized = realizeMotif({ 
        motif: storedMotif, phraseStartBeat: phraseStart, 
        phraseBeats, startMidi, maxLeap: cfg.maxLeap 
      });

      realized.forEach(r => {
        const remaining = phraseEnd - r.startBeat;
        let dur = pickDurationMusical({
          baseWeights, remaining,
          beatInBar: r.startBeat % 4,
          lastDuration, densityPercent: cfg.melodyDensity
        });
        dur = clampSnapDuration(dur, remaining);

        if (Math.random() < MELODY_REST_CHANCE) {
          phraseNotes.push({
            isRest: true, startBeat: r.startBeat,
            durationBeats: dur, velocity: 0,
            startInPhrase: r.startInPhrase
          });
          return;
        }

        const chordHere = chordAtBeat(tline, r.startBeat);
        const beatInBar = r.startBeat % 4;
        let vel = (beatInBar===0 || beatInBar===2) ? 0.85 : 0.72;
        vel += (Math.random()*0.08 - 0.04);
        vel = Math.max(0.35, Math.min(0.95, vel));

        phraseNotes.push({
          midi: r.midi,
          pitch: midiToPitch(r.midi, cfg.prefer),
          startBeat: r.startBeat,
          durationBeats: dur,
          velocity: vel,
          isChordTone: chordHere.voicingMidis.includes(r.midi),
          startInPhrase: r.startInPhrase
        });

        prevMidi = r.midi;
        lastDuration = dur;
      });

    } else {
      let s = 0;

      while (s < phraseBeats - 1e-9) {
        s = snapBeats(s);
        const startBeat = phraseStart + s;
        const remaining = phraseEnd - startBeat;

        if (Math.random() > density01) {
          s += MELODY_STEP;
          s = snapBeats(s);
          continue;
        }

        const beatInBar = startBeat % 4;
        let dur = pickDurationMusical({
          baseWeights, remaining, beatInBar,
          lastDuration, densityPercent: cfg.melodyDensity
        });
        dur = clampSnapDuration(dur, remaining);

        if (Math.random() < MELODY_REST_CHANCE) {
          phraseNotes.push({
            isRest: true, startBeat, durationBeats: dur,
            velocity: 0, startInPhrase: s
          });
          s += dur;
          s = snapBeats(s);
          continue;
        }

        const chordHere = chordAtBeat(tline, startBeat);
        const midi = chooseMelodyMidi({
          chordMidis: chordHere.voicingMidis,
          scalePool, prevMidi, chordTonePref,
          maxLeap: cfg.maxLeap
        });

        let vel = (beatInBar===0 || beatInBar===2) ? 0.85 : 0.72;
        vel += (Math.random()*0.08 - 0.04);
        vel = Math.max(0.35, Math.min(0.95, vel));

        phraseNotes.push({
          midi, pitch: midiToPitch(midi, cfg.prefer),
          startBeat, durationBeats: dur, velocity: vel,
          isChordTone: chordHere.voicingMidis.includes(midi),
          startInPhrase: s
        });

        prevMidi = midi;
        lastDuration = dur;
        s += dur;
        s = snapBeats(s);
      }

      const pitchedNotes = phraseNotes.filter(n => !n.isRest);

      if (p === 0 && pitchedNotes.length >= 3) {
        storedMotif = buildMotif(pitchedNotes.slice(0, Math.min(8, pitchedNotes.length)));
      }
      if (!storedMotif && pitchedNotes.length >= 3) {
        storedMotif = buildMotif(pitchedNotes.slice(0, Math.min(8, pitchedNotes.length)));
      }
    }

    const cadenceStrength01 = cfg.cadenceStrength/100;
    const chordEnd = chordAtBeat(tline, Math.max(0, phraseEnd - 0.001));
    phraseNotes = applyCadence({ 
      phraseNotes, phraseEndBeat: phraseEnd, 
      chordEnd, cadenceStrength01, prefer: cfg.prefer 
    });

    melody.push(...phraseNotes);
  }

  melody.sort((a,b)=>a.startBeat-b.startBeat);
  return { melody, phraseMarkers, totalBeats: tline.totalBeats };
}

export function transposeMelodyOctaves({ melody, prog, prefer, shiftOctaves }) {
  const shift = Math.max(0, Math.min(2, shiftOctaves | 0));
  if (shift === 0) return melody;

  const semis = shift * 12;
  const tline = buildChordTimeline(prog);

  return melody.map(n => {
    if (n.isRest) return n;
    const midi = n.midi + semis;

    const chordHere = chordAtBeat(tline, n.startBeat);
    const chordPCs = new Set(
      chordHere.voicingMidis.map(m => ((m % 12) + 12) % 12)
    );
    const isChordTone = chordPCs.has(((midi % 12) + 12) % 12);

    return {
      ...n, midi,
      pitch: midiToPitch(midi, prefer),
      isChordTone
    };
  });
}