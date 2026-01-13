// ============================================================
// utils.js - Shared data structures and helper functions
// ============================================================

export const DATA = {
  noteToPc: {
    C: 0, "C#": 1, Db: 1,
    D: 2, "D#": 3, Eb: 3,
    E: 4,
    F: 5, "F#": 6, Gb: 6,
    G: 7, "G#": 8, Ab: 8,
    A: 9, "A#": 10, Bb: 10,
    B: 11
  },
  pcToSharp: ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],
  pcToFlat:  ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"],
  modes: {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10]
  },
  diatonicTriadQualities: {
    major: ["major","minor","minor","major","major","minor","diminished"],
    minor: ["minor","diminished","major","minor","minor","major","major"]
  },
  romanNumerals: {
    major: ["I","ii","iii","IV","V","vi","vii°"],
    minor: ["i","ii°","III","iv","V","VI","vii°"]
  },
  templates: { basic: [0, 3, 4, 0] }
};

export function pcToNoteName(pc, prefer) {
  const fixed = ((pc % 12) + 12) % 12;
  return (prefer === "flats" ? DATA.pcToFlat : DATA.pcToSharp)[fixed];
}

export function pitchToMidi(pitch) {
  const m = pitch.match(/^([A-G](?:#|b)?)(-?\d+)$/);
  if (!m) throw new Error("Invalid pitch: " + pitch);
  const note = m[1];
  const octave = parseInt(m[2], 10);
  const pc = DATA.noteToPc[note];
  if (pc === undefined) throw new Error("Invalid note name: " + note);
  return pc + (octave + 1) * 12;
}

export function midiToPitch(midi, prefer) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return pcToNoteName(pc, prefer) + octave;
}

export function pcToPitch(pc, octave, prefer) {
  return pcToNoteName(pc, prefer) + octave;
}

export function rotate(arr, n) {
  const a = arr.slice();
  while (n-- > 0) a.push(a.shift());
  return a;
}

export function normalizeAscending(midis) {
  const out = midis.slice().sort((a,b)=>a-b);
  for (let i=1; i<out.length; i++) {
    while (out[i] <= out[i-1]) out[i] += 12;
  }
  return out;
}

export function snapBeats(x, step = 0.25) {
  return Math.round(x / step) * step;
}