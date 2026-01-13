// ============================================================
// harmony-engine.js - All harmony/chord generation logic
// ============================================================

import { DATA, pcToNoteName, pcToPitch, rotate, normalizeAscending } from './utils.js';

// Configuration
const HARMONIC_STYLE = "Complex";
const USE_DECEPTIVE_CADENCE = false;
const USE_HARMONIC_MINOR_DOMINANT = true;

const notesLookup = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const letterNames = ["C","D","E","F","G","A","B"];

// Spelling map (required-letter spelling)
const spellingMap = {
  0:  { C: "C",  B: "B#", D: "Dbb" },
  1:  { C: "C#", D: "Db" },
  2:  { D: "D",  C: "C##", E: "Ebb" },
  3:  { D: "D#", E: "Eb", F: "Fbb" },
  4:  { E: "E",  F: "Fb" },
  5:  { F: "F",  E: "E#", G: "Gbb" },
  6:  { F: "F#", G: "Gb" },
  7:  { G: "G",  F: "F##", A: "Abb" },
  8:  { G: "G#", A: "Ab" },
  9:  { A: "A",  G: "G##", B: "Bbb" },
  10: { A: "A#", B: "Bb", C: "Cbb" },
  11: { B: "B",  C: "Cb" }
};

// Scale intervals
const scaleIntervalsMajor = [0,2,4,5,7,9,11];
const scaleIntervalsMinorNatural = [0,2,3,5,7,8,10];
const scaleIntervalsHarmonicMinor = [0,2,3,5,7,8,11];

function modeIntervals(mode) {
  if (mode === "major") return scaleIntervalsMajor;
  return (USE_HARMONIC_MINOR_DOMINANT ? scaleIntervalsHarmonicMinor : scaleIntervalsMinorNatural);
}

function isFlatKeyName(keyName) {
  return ["F","Db","Eb","Gb","Ab","Bb"].includes(keyName);
}

function normalizeSpellingForDisplay(s) {
  return s.replace(/##/g, "x").replace(/bb/g, "b");
}

function preferAccidentalCosmetic(spelled, keyName) {
  if (isFlatKeyName(keyName)) {
    return spelled
      .replace("C#", "Db").replace("D#", "Eb").replace("F#", "Gb")
      .replace("G#", "Ab").replace("A#", "Bb");
  }
  return spelled
    .replace("Db", "C#").replace("Eb", "D#").replace("Gb", "F#")
    .replace("Ab", "G#").replace("Bb", "A#");
}

export function getDiatonicScaleSpelled(keyName, mode) {
  const keyPc = DATA.noteToPc[keyName];
  if (keyPc === undefined) return [];
  const ints = modeIntervals(mode);
  const scale = [];
  for (let i=0; i<7; i++) {
    const pc = (keyPc + ints[i]) % 12;
    const degreeLetter = letterNames[i];
    let spelled = (spellingMap[pc] && spellingMap[pc][degreeLetter]) 
      ? spellingMap[pc][degreeLetter] 
      : pcToNoteName(pc, "sharps");
    spelled = preferAccidentalCosmetic(spelled, keyName);
    spelled = normalizeSpellingForDisplay(spelled);
    scale.push(spelled);
  }
  return scale;
}

function getRequiredLetter(rootSpelled, degreeOffset) {
  const rootLetter = rootSpelled.charAt(0);
  const rootLetterNum = letterNames.indexOf(rootLetter);
  return letterNames[(rootLetterNum + degreeOffset) % 7];
}

// Chord recipes
export const chordIntervals = {
  "Triad (Major)":      [{int:0,deg:0},{int:4,deg:2},{int:7,deg:4}],
  "Triad (minor)":      [{int:0,deg:0},{int:3,deg:2},{int:7,deg:4}],
  "Triad (Diminished)": [{int:0,deg:0},{int:3,deg:2},{int:6,deg:4}],
  "Triad (Augmented)":  [{int:0,deg:0},{int:4,deg:2},{int:8,deg:4}],
  "sus2": [{int:0,deg:0},{int:2,deg:1},{int:7,deg:4}],
  "sus4": [{int:0,deg:0},{int:5,deg:3},{int:7,deg:4}],
  "6":  [{int:0,deg:0},{int:4,deg:2},{int:7,deg:4},{int:9,deg:5}],
  "m6": [{int:0,deg:0},{int:3,deg:2},{int:7,deg:4},{int:9,deg:5}],
  "Major 7":          [{int:0,deg:0},{int:4,deg:2},{int:7,deg:4},{int:11,deg:6}],
  "minor 7":          [{int:0,deg:0},{int:3,deg:2},{int:7,deg:4},{int:10,deg:6}],
  "Dominant 7":       [{int:0,deg:0},{int:4,deg:2},{int:7,deg:4},{int:10,deg:6}],
  "Half-Diminished 7":[{int:0,deg:0},{int:3,deg:2},{int:6,deg:4},{int:10,deg:6}],
  "Diminished 7":     [{int:0,deg:0},{int:3,deg:2},{int:6,deg:4},{int:9,deg:6}],
  "Dominant 7sus4":   [{int:0,deg:0},{int:5,deg:3},{int:7,deg:4},{int:10,deg:6}],
  "Major 9":          [{int:0,deg:0},{int:4,deg:2},{int:7,deg:4},{int:11,deg:6},{int:2,deg:1}],
  "minor 9":          [{int:0,deg:0},{int:3,deg:2},{int:7,deg:4},{int:10,deg:6},{int:2,deg:1}],
  "Dominant 9":       [{int:0,deg:0},{int:4,deg:2},{int:7,deg:4},{int:10,deg:6},{int:2,deg:1}],
  "add9":             [{int:0,deg:0},{int:4,deg:2},{int:7,deg:4},{int:2,deg:1}],
  "madd9":            [{int:0,deg:0},{int:3,deg:2},{int:7,deg:4},{int:2,deg:1}],
  "Half-Diminished 9":[{int:0,deg:0},{int:3,deg:2},{int:6,deg:4},{int:10,deg:6},{int:2,deg:1}],
  "Major 11":         [{int:0,deg:0},{int:4,deg:2},{int:7,deg:4},{int:11,deg:6},{int:2,deg:1},{int:5,deg:3}],
  "minor 11":         [{int:0,deg:0},{int:3,deg:2},{int:7,deg:4},{int:10,deg:6},{int:2,deg:1},{int:5,deg:3}],
  "Dominant 11":      [{int:0,deg:0},{int:4,deg:2},{int:7,deg:4},{int:10,deg:6},{int:2,deg:1},{int:5,deg:3}],
  "Half-Diminished 11":[{int:0,deg:0},{int:3,deg:2},{int:6,deg:4},{int:10,deg:6},{int:2,deg:1},{int:5,deg:3}],
  "Major 13":         [{int:0,deg:0},{int:4,deg:2},{int:7,deg:4},{int:11,deg:6},{int:2,deg:1},{int:5,deg:3},{int:9,deg:5}],
  "minor 13":         [{int:0,deg:0},{int:3,deg:2},{int:7,deg:4},{int:10,deg:6},{int:2,deg:1},{int:5,deg:3},{int:9,deg:5}],
  "Dominant 13":      [{int:0,deg:0},{int:4,deg:2},{int:7,deg:4},{int:10,deg:6},{int:2,deg:1},{int:5,deg:3},{int:9,deg:5}],
  "Half-Diminished 13":[{int:0,deg:0},{int:3,deg:2},{int:6,deg:4},{int:10,deg:6},{int:2,deg:1},{int:5,deg:3},{int:9,deg:5}]
};

export const diatonicChordsMajor = {
  "1": { quality:"Major", func:"Tonic", structure:["Triad (Major)","Major 7","Major 9"] },
  "2": { quality:"minor", func:"Subdominant", structure:["Triad (minor)","minor 7","minor 9"] },
  "3": { quality:"minor", func:"Tonic", structure:["Triad (minor)","minor 7","minor 9"] },
  "4": { quality:"Major", func:"Subdominant", structure:["Triad (Major)","Major 7","Major 9"] },
  "5": { quality:"Major", func:"Dominant", structure:["Triad (Major)","Dominant 7","Dominant 9"] },
  "6": { quality:"minor", func:"Tonic/Subdominant", structure:["Triad (minor)","minor 7","minor 9"] },
  "7": { quality:"Diminished", func:"Dominant", structure:["Triad (Diminished)","Half-Diminished 7","Half-Diminished 9"] }
};

export const diatonicChordsMinor = {
  "1": { quality:"minor", func:"Tonic", structure:["Triad (minor)","minor 7","minor 9"] },
  "2": { quality:"Diminished", func:"Subdominant", structure:["Triad (Diminished)","Half-Diminished 7","Half-Diminished 9"] },
  "3": { quality:"Major", func:"Tonic/Mediant", structure:["Triad (Major)","Major 7","Major 9"] },
  "4": { quality:"minor", func:"Subdominant", structure:["Triad (minor)","minor 7","minor 9"] },
  "5": { quality:"Major", func:"Dominant", structure:["Triad (Major)","Dominant 7","Dominant 9"] },
  "6": { quality:"Major", func:"Subdominant", structure:["Triad (Major)","Major 7","Major 9"] },
  "7": { quality:"Diminished", func:"Dominant", structure:["Triad (Diminished)","Half-Diminished 7","Half-Diminished 9"] }
};

export const PROGRESSION_RULES = {
  "1": ["4","5","6","2","3"],
  "2": ["5","7","4"],
  "3": ["6","4","2"],
  "4": ["5","7","2","6","1"],
  "5": ["1","6","4"],
  "6": ["2","4","5"],
  "7": ["1","6","5"]
};

function randChoice(arr) {
  return arr[Math.floor(Math.random()*arr.length)];
}

function getRandomType(numeral, mode) {
  const diatonic = (mode === "major") ? diatonicChordsMajor : diatonicChordsMinor;
  const numeralData = diatonic[numeral];
  const isMinorQuality = numeralData.quality.toLowerCase().includes("minor") 
    || numeralData.quality.toLowerCase().includes("diminished");

  let available = [];
  if (HARMONIC_STYLE === "Simple") {
    if (Math.random() < 0.7) available.push(numeralData.structure[0]);
    if (Math.random() < 0.3) available.push(numeralData.structure[1]);
  } else {
    if (Math.random() < 0.4) available.push(numeralData.structure[0]);
    if (Math.random() < 0.6) available.push(numeralData.structure[1]);
    if (Math.random() < 0.5) available.push(numeralData.structure[2]);
  }

  if (numeral !== "7" && Math.random() < 0.2) available.push(randChoice(["sus2","sus4"]));
  if (numeral !== "7" && Math.random() < 0.15) available.push(isMinorQuality ? "madd9" : "add9");
  if (numeral === "5" && Math.random() < 0.1) available.push("Dominant 7sus4");
  if (numeral !== "7" && Math.random() < 0.05) available.push(isMinorQuality ? "m6" : "6");

  if (available.length === 0) return numeralData.structure[0];
  let result = randChoice(available);

  if ((numeral === "7" && mode === "major" && result.includes("7")) 
    || (numeral === "2" && mode === "minor" && result.includes("7"))) {
    return "Half-Diminished 7";
  }
  return result;
}

export function generateRuleBasedNumerals(length, useDeceptiveCadence) {
  const tonicStarts = ["1","3","6"];
  let out = [];
  let current = randChoice(tonicStarts);
  out.push(current);

  while (out.length < length) {
    const possible = PROGRESSION_RULES[current] || ["1"];
    let next = randChoice(possible);
    if (next === current) {
      const filtered = possible.filter(n => n !== current);
      if (filtered.length) next = randChoice(filtered);
    }

    if (out.length === length - 1) {
      const isDominant = (current === "5" || current === "7");
      if (isDominant && useDeceptiveCadence) next = "6";
      else if (isDominant) next = "1";
      else {
        const res = ["1","6"];
        if (!res.includes(next)) next = randChoice(res);
      }
    }

    current = next;
    out.push(current);
  }
  return out;
}

export function chordNotesSpelled({ keyName, mode, numeral, chordType }) {
  const scale = getDiatonicScaleSpelled(keyName, mode);
  const rootSpelled = scale[parseInt(numeral,10)-1];
  const keyPc = DATA.noteToPc[keyName];
  const ints = modeIntervals(mode);
  const degreeIndex = parseInt(numeral,10)-1;
  const rootPc = (keyPc + ints[degreeIndex]) % 12;

  const recipe = chordIntervals[chordType];
  if (!recipe) return { rootSpelled, tones: [], pcs: [] };

  const tones = [];
  const pcs = [];
  for (const it of recipe) {
    const pc = (rootPc + it.int) % 12;
    const requiredLetter = getRequiredLetter(rootSpelled, it.deg);
    let spelled = (spellingMap[pc] && spellingMap[pc][requiredLetter]) 
      ? spellingMap[pc][requiredLetter] 
      : pcToNoteName(pc, "sharps");
    spelled = preferAccidentalCosmetic(spelled, keyName);
    spelled = normalizeSpellingForDisplay(spelled);
    tones.push(spelled);
    pcs.push(pc);
  }
  return { rootSpelled, tones, pcs, rootPc };
}

export function buildChord({ key, mode, degree, octave, prefer }) {
  const numeral = String(degree + 1);
  const diatonic = (mode === "major") ? diatonicChordsMajor : diatonicChordsMinor;
  
  if (!diatonic[numeral]) {
    console.error(`Missing diatonic data for degree ${numeral} in ${mode} mode`);
    const fallbackNumeral = "1";
    const chordType = getRandomType(fallbackNumeral, mode);
    const spelled = chordNotesSpelled({ keyName: key, mode, numeral: fallbackNumeral, chordType });
    const rootMidi = spelled.rootPc + (octave + 1) * 12;
    const recipe = chordIntervals[chordType];
    const baseMidis = recipe.map(it => rootMidi + it.int);
    const roman = DATA.romanNumerals[mode][0];
    const quality = diatonic[fallbackNumeral].quality;

    return {
      roman,
      root: pcToPitch(spelled.rootPc, octave, prefer),
      quality,
      chordType,
      degree: 0,
      baseMidis,
      spelledRoot: spelled.rootSpelled,
      spelledTones: spelled.tones
    };
  }
  
  const chordType = getRandomType(numeral, mode);
  const spelled = chordNotesSpelled({ keyName: key, mode, numeral, chordType });
  const rootMidi = spelled.rootPc + (octave + 1) * 12;
  const recipe = chordIntervals[chordType];
  const baseMidis = recipe.map(it => rootMidi + it.int);
  const roman = DATA.romanNumerals[mode][degree];
  const quality = diatonic[numeral].quality;

  return {
    roman,
    root: pcToPitch(spelled.rootPc, octave, prefer),
    quality,
    chordType,
    degree,
    baseMidis,
    spelledRoot: spelled.rootSpelled,
    spelledTones: spelled.tones
  };
}

function chordDistance(prev, curr) {
  const a = prev.slice().sort((x,y)=>x-y);
  const b = curr.slice().sort((x,y)=>x-y);
  return a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);
}

function generateVoicingCandidates(baseMidis) {
  const candidates = [];
  for (let inv=0; inv<3; inv++) {
    const asc = normalizeAscending(rotate(baseMidis, inv));
    for (const shift of [-12,0,12]) {
      candidates.push(asc.map(m => m + shift));
    }
  }
  return candidates;
}

export function applyVoiceLeading(chords) {
  let prev = null;
  return chords.map((ch) => {
    const candidates = generateVoicingCandidates(ch.baseMidis);
    let best = candidates[0];

    if (prev) {
      let bestScore = Infinity;
      for (const c of candidates) {
        const score = chordDistance(prev, c);
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
    } else {
      const asc = normalizeAscending(ch.baseMidis);
      const avg = asc.reduce((s,m)=>s+m,0)/asc.length;
      best = (avg < 54) ? asc.map(m=>m+12) : asc;
    }

    prev = best;
    return { ...ch, voicingMidis: best };
  });
}

const BEATS_PER_BAR = 4;

export function applyDurations(chords, chordsPerBar) {
  const dur = BEATS_PER_BAR / Math.max(1, chordsPerBar);
  return chords.map((ch) => ({ ...ch, durationBeats: dur }));
}