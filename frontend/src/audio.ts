// 鳴き声通信プロトコル
// 8-FSK + preamble/sync + checksum + repeated frames.
// payload_raw は backend token と同じ 0-12 の整数 11個。

const SYMBOL_FREQS = [1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300];
const BASE = 13;
const PAYLOAD_LEN = 11;
const PREAMBLE = [7, 0, 7, 0, 7, 0];
const SYNC = [6, 1, 6];
const SYMBOL_SLOT_MS = 105;
const GAP_MS = 18;
const REPEAT_COUNT = 3;
const TONE_GAIN = 0.5;

const FFT_SIZE = 8192;
const MIN_STABLE_FRAMES = 2;
const AMP_THRESHOLD = 20;
const FREQ_TOLERANCE_HZ = 150;
const SEARCH_MIN_HZ = 1050;
const SEARCH_MAX_HZ = 3450;
const SAMPLE_RETENTION_MS = 16000;
const DECODE_STEP_MS = 24;
const DECODE_INTERVAL_MS = 180;
const SLOT_SAMPLE_START_MS = 22;
const SLOT_SAMPLE_END_MS = SYMBOL_SLOT_MS - 20;

const ENCODED_VALUE_LEN = 2;
const CHECKSUM_LEN = 2;
const DATA_SYMBOLS_LEN = (PAYLOAD_LEN + CHECKSUM_LEN) * ENCODED_VALUE_LEN;
const FRAME_SYMBOLS_LEN = PREAMBLE.length + SYNC.length + DATA_SYMBOLS_LEN;

let sharedOutputCtx: AudioContext | null = null;

function getOutputContext(): AudioContext {
  if (!sharedOutputCtx || sharedOutputCtx.state === 'closed') {
    sharedOutputCtx = new AudioContext();
  }
  return sharedOutputCtx;
}

export async function unlockAudioOutput(): Promise<void> {
  const ctx = getOutputContext();
  if (ctx.state === 'suspended') await ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.03);
}

export function computeChecksum(payloadRaw: number[]): [number, number] {
  const s = payloadRaw.reduce((a, v) => a + v, 0) % BASE;
  const w = payloadRaw.reduce((a, v, i) => a + v * (i + 1), 0) % BASE;
  return [s, w];
}

function encodeBase4Value(value: number): [number, number] {
  return [Math.floor(value / 4), value % 4];
}

function decodeBase4Value(high: number, low: number): number | null {
  if (high < 0 || high > 3 || low < 0 || low > 3) return null;
  const value = high * 4 + low;
  return value < BASE ? value : null;
}

export function encodePayload(payloadRaw: number[]): number[] {
  const [cs, cw] = computeChecksum(payloadRaw);
  const values = [...payloadRaw, cs, cw];
  const data = values.flatMap(encodeBase4Value);
  return [...PREAMBLE, ...SYNC, ...data];
}

export function decodeFrame(frameSymbols: number[]): number[] | null {
  if (frameSymbols.length !== FRAME_SYMBOLS_LEN) return null;
  if (!matchesExactly(frameSymbols.slice(0, PREAMBLE.length), PREAMBLE)) return null;
  const syncStart = PREAMBLE.length;
  if (!matchesExactly(frameSymbols.slice(syncStart, syncStart + SYNC.length), SYNC)) return null;

  const data = frameSymbols.slice(PREAMBLE.length + SYNC.length);
  const values: number[] = [];
  for (let i = 0; i < data.length; i += 2) {
    const value = decodeBase4Value(data[i], data[i + 1]);
    if (value === null) return null;
    values.push(value);
  }

  const payloadRaw = values.slice(0, PAYLOAD_LEN);
  const [cs, cw] = computeChecksum(payloadRaw);
  if (values[PAYLOAD_LEN] !== cs || values[PAYLOAD_LEN + 1] !== cw) return null;
  return payloadRaw;
}

function matchesExactly(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function playTone(ctx: AudioContext, freq: number, startTime: number, durationMs: number): void {
  const dur = durationMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const fade = Math.min(0.015, dur * 0.2);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(TONE_GAIN, startTime + fade);
  gain.gain.setValueAtTime(TONE_GAIN, startTime + dur - fade);
  gain.gain.linearRampToValueAtTime(0, startTime + dur);
  osc.start(startTime);
  osc.stop(startTime + dur);
}

export async function playSymbols(symbols: number[]): Promise<void> {
  const ctx = getOutputContext();
  if (ctx.state === 'suspended') await ctx.resume();

  let t = ctx.currentTime + 0.05;
  for (let repeat = 0; repeat < REPEAT_COUNT; repeat++) {
    for (const sym of symbols) {
      playTone(ctx, SYMBOL_FREQS[sym], t, SYMBOL_SLOT_MS - GAP_MS);
      t += SYMBOL_SLOT_MS / 1000;
    }
    t += 0.18;
  }

  const totalMs = REPEAT_COUNT * symbols.length * SYMBOL_SLOT_MS + (REPEAT_COUNT - 1) * 180;
  await new Promise<void>(resolve => setTimeout(resolve, totalMs + 180));
}

function snapToSymbol(hz: number): number | null {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < SYMBOL_FREQS.length; i++) {
    const dist = Math.abs(hz - SYMBOL_FREQS[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return bestDist <= FREQ_TOLERANCE_HZ ? best : null;
}

function detectPeakSymbol(analyser: AnalyserNode, dataArray: Uint8Array<ArrayBuffer>): number | null {
  analyser.getByteFrequencyData(dataArray);
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  const loIdx = Math.floor(SEARCH_MIN_HZ / binHz);
  const hiIdx = Math.min(Math.ceil(SEARCH_MAX_HZ / binHz), dataArray.length - 1);

  let maxVal = 0;
  let maxIdx = 0;
  for (let i = loIdx; i <= hiIdx; i++) {
    if (dataArray[i] > maxVal) {
      maxVal = dataArray[i];
      maxIdx = i;
    }
  }
  if (maxVal < AMP_THRESHOLD) return null;
  return snapToSymbol(maxIdx * binHz);
}

type SymbolSample = {
  t: number;
  sym: number | null;
};

function preambleScore(symbols: number[], start: number): number {
  let score = 0;
  for (let i = 0; i < PREAMBLE.length; i++) {
    if (symbols[start + i] === PREAMBLE[i]) score++;
  }
  return score;
}

function majoritySymbol(samples: SymbolSample[], startMs: number, slot: number): number | null {
  const from = startMs + slot * SYMBOL_SLOT_MS + SLOT_SAMPLE_START_MS;
  const to = startMs + slot * SYMBOL_SLOT_MS + SLOT_SAMPLE_END_MS;
  const counts = new Array(SYMBOL_FREQS.length).fill(0);
  let total = 0;

  for (const sample of samples) {
    if (sample.t < from) continue;
    if (sample.t > to) break;
    if (sample.sym === null) continue;
    counts[sample.sym]++;
    total++;
  }

  if (total < MIN_STABLE_FRAMES) return null;
  let best = -1;
  let bestCount = 0;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > bestCount) {
      best = i;
      bestCount = counts[i];
    }
  }
  return bestCount >= MIN_STABLE_FRAMES ? best : null;
}

function readFrameAt(samples: SymbolSample[], startMs: number): number[] | null {
  const symbols: number[] = [];
  for (let slot = 0; slot < FRAME_SYMBOLS_LEN; slot++) {
    const sym = majoritySymbol(samples, startMs, slot);
    if (sym === null) return null;
    symbols.push(sym);
  }
  return symbols;
}

function tryDecodeFromSamples(samples: SymbolSample[], ownPayload: number[]): number[] | null {
  if (samples.length === 0) return null;
  const lastSampleAt = samples[samples.length - 1].t;
  const firstStart = Math.max(samples[0].t, lastSampleAt - 9000);
  const lastStart = lastSampleAt - FRAME_SYMBOLS_LEN * SYMBOL_SLOT_MS;
  for (let startMs = firstStart; startMs <= lastStart; startMs += DECODE_STEP_MS) {
    const candidate = readFrameAt(samples, startMs);
    if (!candidate) continue;
    if (preambleScore(candidate, 0) < PREAMBLE.length - 1) continue;
    const decoded = decodeFrame(candidate);
    if (decoded && !arraysEqual(decoded, ownPayload)) return decoded;
  }
  return null;
}

export function createBarkListener(
  ownPayload: number[],
  onPayloadRaw: (payload: number[]) => void,
  onError: (reason: 'mic_denied') => void,
): { start: () => Promise<void>; stop: () => void } {
  let animId = 0;
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let stopped = false;
  let locked = false;

  function stop() {
    stopped = true;
    cancelAnimationFrame(animId);
    stream?.getTracks().forEach(t => t.stop());
    audioCtx?.close();
  }

  async function start() {
    stopped = false;
    locked = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      onError('mic_denied');
      return;
    }

    audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.05;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    const samples: SymbolSample[] = [];
    let currentSymbol: number | null = null;
    let stableCount = 0;
    let lastDecodeAt = 0;

    function sampleSymbol(sym: number | null) {
      if (locked) return;
      const now = performance.now();
      samples.push({ t: now, sym });
      while (samples.length > 0 && now - samples[0].t > SAMPLE_RETENTION_MS) {
        samples.shift();
      }
      if (now - lastDecodeAt < DECODE_INTERVAL_MS) return;
      lastDecodeAt = now;
      const decoded = tryDecodeFromSamples(samples, ownPayload);
      if (decoded) {
        locked = true;
        onPayloadRaw(decoded);
      }
    }

    function loop() {
      if (stopped) return;
      const sym = detectPeakSymbol(analyser, dataArray);
      if (sym === currentSymbol) {
        stableCount++;
      } else {
        currentSymbol = sym;
        stableCount = 1;
      }
      sampleSymbol(stableCount >= MIN_STABLE_FRAMES ? sym : null);
      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);
  }

  return { start, stop };
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
