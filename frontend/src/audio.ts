// 鳴き声通信プロトコル
// シンボル 0–15 → 周波数 1000–4000 Hz (200 Hz 刻み)
// START = 14 (3800 Hz), END = 15 (4000 Hz)
// フレーム: START + 14 DATA_SYMBOLS + END

const SYMBOL_FREQS: number[] = Array.from({ length: 16 }, (_, i) => 1000 + i * 200);
const START_SYMBOL = 14;
const END_SYMBOL = 15;
const BASE = 13;             // データシンボル値範囲 0–12
const VERSION = 0;
const DATA_SYMBOLS_LEN = 14; // VERSION(1) + PAYLOAD(11) + CHECKSUM(2)

// タイミング範囲 (ms)
const DATA_DURATION_MIN = 90;
const DATA_DURATION_MAX = 130;
const START_DURATION_MIN = 140;
const START_DURATION_MAX = 170;
const END_DURATION_MIN = 160;
const END_DURATION_MAX = 190;
const GAP_MIN = 30;
const GAP_MAX = 50;

// 受信パラメータ
const FFT_SIZE = 8192;
const MIN_STABLE_FRAMES = 3;  // この連続フレーム数で安定判定 (≈50ms @60fps)
const AMP_THRESHOLD = 50;
const FREQ_TOLERANCE_HZ = 80; // 最近傍スナップ許容幅

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// ---- チェックサム ----

export function computeChecksum(payloadRaw: number[]): [number, number] {
  const s = payloadRaw.reduce((a, v) => a + v, 0) % BASE;
  const w = payloadRaw.reduce((a, v, i) => a + v * (i + 1), 0) % BASE;
  return [s, w];
}

// ---- エンコード ----

function encodeSymbols(rawData: number[]): number[] {
  let prev = START_SYMBOL;
  const result: number[] = [];
  for (const raw of rawData) {
    const candidates = Array.from({ length: BASE + 1 }, (_, i) => i).filter(s => s !== prev);
    result.push(candidates[raw]);
    prev = candidates[raw];
  }
  return result;
}

export function encodePayload(payloadRaw: number[]): number[] {
  const [cs, cw] = computeChecksum(payloadRaw);
  const rawData = [VERSION, ...payloadRaw, cs, cw];
  const encoded = encodeSymbols(rawData);
  return [START_SYMBOL, ...encoded, END_SYMBOL];
}

// ---- デコード ----

function decodeSymbols(encodedData: number[]): number[] | null {
  let prev = START_SYMBOL;
  const result: number[] = [];
  for (const encoded of encodedData) {
    const candidates = Array.from({ length: BASE + 1 }, (_, i) => i).filter(s => s !== prev);
    const idx = candidates.indexOf(encoded);
    if (idx === -1) return null;
    result.push(idx);
    prev = encoded;
  }
  return result;
}

export function decodeFrame(dataSymbols: number[]): number[] | null {
  if (dataSymbols.length !== DATA_SYMBOLS_LEN) return null;
  const raw = decodeSymbols(dataSymbols);
  if (!raw) return null;
  if (raw[0] !== VERSION) return null;
  const payloadRaw = raw.slice(1, 12);
  const [cs, cw] = computeChecksum(payloadRaw);
  if (raw[12] !== cs || raw[13] !== cw) return null;
  return payloadRaw;
}

// ---- 送信 ----

function playTone(ctx: AudioContext, freq: number, startTime: number, durationMs: number): void {
  const dur = durationMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const fade = Math.min(0.02, dur * 0.15);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.28, startTime + fade);
  gain.gain.setValueAtTime(0.28, startTime + dur - fade);
  gain.gain.linearRampToValueAtTime(0, startTime + dur);
  osc.start(startTime);
  osc.stop(startTime + dur);
}

export async function playSymbols(symbols: number[]): Promise<void> {
  const ctx = new AudioContext();
  let t = ctx.currentTime + 0.05;

  for (const sym of symbols) {
    const freq = SYMBOL_FREQS[sym];
    let durMs: number;
    if (sym === START_SYMBOL) {
      durMs = rand(START_DURATION_MIN, START_DURATION_MAX);
    } else if (sym === END_SYMBOL) {
      durMs = rand(END_DURATION_MIN, END_DURATION_MAX);
    } else {
      durMs = rand(DATA_DURATION_MIN, DATA_DURATION_MAX);
    }
    const gapMs = rand(GAP_MIN, GAP_MAX);
    playTone(ctx, freq, t, durMs);
    t += (durMs + gapMs) / 1000;
  }

  await new Promise<void>(resolve => setTimeout(resolve, (t - ctx.currentTime) * 1000 + 100));
  ctx.close();
}

// ---- 受信 ----

export type StopListening = () => void;

function snapToSymbol(hz: number): number | null {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < SYMBOL_FREQS.length; i++) {
    const dist = Math.abs(hz - SYMBOL_FREQS[i]);
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return bestDist <= FREQ_TOLERANCE_HZ ? best : null;
}

function detectPeakSymbol(analyser: AnalyserNode, dataArray: Uint8Array<ArrayBuffer>): number | null {
  analyser.getByteFrequencyData(dataArray);
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  const loIdx = Math.floor(900 / binHz);
  const hiIdx = Math.min(Math.ceil(4100 / binHz), dataArray.length - 1);

  let maxVal = 0;
  let maxIdx = 0;
  for (let i = loIdx; i <= hiIdx; i++) {
    if (dataArray[i] > maxVal) { maxVal = dataArray[i]; maxIdx = i; }
  }
  if (maxVal < AMP_THRESHOLD) return null;
  return snapToSymbol(maxIdx * binHz);
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

  function stop() {
    stopped = true;
    cancelAnimationFrame(animId);
    stream?.getTracks().forEach(t => t.stop());
    audioCtx?.close();
  }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError('mic_denied');
      return;
    }

    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.1;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

    // 受信状態機械
    type RxState = 'IDLE' | 'READING' | 'LOCKED';
    let rxState: RxState = 'IDLE';
    let buffer: number[] = [];
    let currentSymbol: number | null = null;
    let stableCount = 0;

    function emitSymbol(sym: number) {
      if (rxState === 'LOCKED') return;

      if (sym === START_SYMBOL) {
        rxState = 'READING';
        buffer = [];
        return;
      }

      if (rxState !== 'READING') return;

      if (sym === END_SYMBOL) {
        const decoded = decodeFrame(buffer);
        if (decoded && !arraysEqual(decoded, ownPayload)) {
          rxState = 'LOCKED';
          onPayloadRaw(decoded);
        } else {
          rxState = 'IDLE';
        }
        buffer = [];
        return;
      }

      // 有効データシンボル 0–13
      if (sym < 0 || sym > BASE) {
        rxState = 'IDLE';
        buffer = [];
        return;
      }

      // 隣接重複圧縮（二重カウント対策）
      if (buffer.length > 0 && buffer[buffer.length - 1] === sym) return;

      buffer.push(sym);
      if (buffer.length > DATA_SYMBOLS_LEN) {
        rxState = 'IDLE';
        buffer = [];
      }
    }

    function loop() {
      if (stopped) return;
      const sym = detectPeakSymbol(analyser, dataArray);

      if (sym === currentSymbol) {
        stableCount++;
        if (stableCount === MIN_STABLE_FRAMES && sym !== null) {
          emitSymbol(sym);
        }
      } else {
        currentSymbol = sym;
        stableCount = 1;
      }

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);
  }

  return { start, stop };
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
