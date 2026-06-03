// バックエンドのtoken_service.pyと同じエンコード仕様
// FREQ_BASE = 700, FREQ_STEP = 200（16ステップ）
// トークン8バイト → 16周波数（各バイトを上位/下位ニブルに分割）
// START_FREQ: 開始マーカー / END_FREQ: 終了マーカー

const FREQ_BASE = 700;
const FREQ_STEP = 200;
const START_FREQ = 500;   // 開始マーカー（データ範囲700Hz より下）
const END_FREQ = 4100;    // 終了マーカー（データ範囲3700Hz より上）
const TONE_DURATION = 0.15; // 150ms per tone
const PILOT_DURATION = 0.2; // 200ms for pilot

function playTone(ctx: AudioContext, freq: number, startTime: number, duration: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.3, startTime);
  gain.gain.setValueAtTime(0.3, startTime + duration - 0.02);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export async function playToken(frequencies: number[]): Promise<void> {
  const ctx = new AudioContext();
  let t = ctx.currentTime + 0.05;

  playTone(ctx, START_FREQ, t, PILOT_DURATION);
  t += PILOT_DURATION;

  for (const freq of frequencies) {
    playTone(ctx, freq, t, TONE_DURATION);
    t += TONE_DURATION;
  }

  playTone(ctx, END_FREQ, t, PILOT_DURATION);
  t += PILOT_DURATION;

  await new Promise<void>((resolve) => setTimeout(resolve, (t - ctx.currentTime) * 1000 + 100));
  await ctx.close();
}

function snapToNearest(hz: number): number {
  const candidates = [START_FREQ, END_FREQ];
  for (let n = 0; n <= 15; n++) candidates.push(FREQ_BASE + n * FREQ_STEP);
  return candidates.reduce((prev, curr) =>
    Math.abs(curr - hz) < Math.abs(prev - hz) ? curr : prev
  );
}

function decodeFrequencies(freqs: number[]): string | null {
  if (freqs.length !== 16) return null;
  const nibbles = freqs.map((f) => Math.round((f - FREQ_BASE) / FREQ_STEP));
  if (nibbles.some((n) => n < 0 || n > 15)) return null;
  return nibbles.map((n) => n.toString(16)).join('');
}

// 不完全なトーン列でも可能な限りデコードする（END到達時に使用）
function decodePartial(freqs: number[]): string {
  return freqs
    .map((f) => {
      const n = Math.round((f - FREQ_BASE) / FREQ_STEP);
      return n >= 0 && n <= 15 ? n.toString(16) : '?';
    })
    .join('');
}

export type StopListening = () => void;

export type DebugInfo = {
  volume: number;      // 0-255
  rawHz: number;       // FFTピーク周波数
  snappedHz: number;   // グリッドスナップ後
  isStart: boolean;    // START_FREQ(500Hz) かどうか
  isEnd: boolean;      // END_FREQ(4100Hz) かどうか
  recording: boolean;  // START受信後の収録中フラグ
  captured: number;    // 収録済みトーン数
};

export async function listenForToken(
  onToken: (token: string, freqs: number[]) => void,
  onError: (msg: string) => void,
  onDebug?: (info: DebugInfo) => void,
  onPartial?: (partial: string, captured: number, freqs: number[]) => void
): Promise<StopListening> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    onError('マイクの許可が必要です');
    return () => {};
  }

  const ctx = new AudioContext({ sampleRate: 44100 });
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.1;
  source.connect(analyser);

  const bufLen = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufLen);
  const sampleRate = ctx.sampleRate;

  function hzToIndex(hz: number) {
    return Math.round((hz * analyser.fftSize) / sampleRate);
  }
  function indexToHz(idx: number) {
    return (idx * sampleRate) / analyser.fftSize;
  }

  let detected: number[] = [];
  let lastSnapped = 0;
  let recording = false;
  let animId = 0;
  let stopped = false;

  function loop() {
    if (stopped) return;
    analyser.getByteFrequencyData(dataArray);

    const lo = hzToIndex(400);
    const hi = Math.min(hzToIndex(4200), bufLen - 1);

    let maxVal = 0;
    let maxIdx = 0;
    for (let i = lo; i <= hi; i++) {
      if (dataArray[i] > maxVal) {
        maxVal = dataArray[i];
        maxIdx = i;
      }
    }

    if (maxVal > 60) {
      const hz = indexToHz(maxIdx);
      const snapped = snapToNearest(hz);

      onDebug?.({
        volume: maxVal,
        rawHz: Math.round(hz),
        snappedHz: snapped,
        isStart: snapped === START_FREQ,
        isEnd: snapped === END_FREQ,
        recording,
        captured: detected.length,
      });

      if (snapped !== lastSnapped) {
        lastSnapped = snapped;

        if (snapped === START_FREQ) {
          recording = true;
          detected = [];
        } else if (snapped === END_FREQ) {
          if (recording) {
            if (detected.length === 16) {
              const token = decodeFrequencies(detected);
              if (token) onToken(token, [...detected]);
            } else {
              onPartial?.(decodePartial(detected), detected.length, [...detected]);
            }
          }
          recording = false;
          detected = [];
        } else if (recording) {
          detected.push(snapped);
        }
      }
    }

    animId = requestAnimationFrame(loop);
  }

  loop();

  return () => {
    stopped = true;
    cancelAnimationFrame(animId);
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  };
}
