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

// マイク制約: FSKのクリーンな復調のため自動補正系をすべて無効化する
const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

// 固定スロット送信。可変重み付けは最短60msスロットを生み、FFT解析窓より短くなって
// デコードを不安定にするため廃止した。
const SLOT_TONE_MS = 80;   // 各記号の発音時間
const SLOT_GAP_MS = 20;    // 記号間の無音
const SLOT_MS = SLOT_TONE_MS + SLOT_GAP_MS; // = 100ms/記号
const TX_LEAD_MS = 50;     // 送信開始までのリード
const TX_TAIL_MS = 150;    // 末尾の余白

// 受信パラメータ
// FFT窓 = FFT_SIZE / sampleRate。2048/48000 ≈ 43ms で記号の発音時間(80ms)より短く、
// 1記号内に必ずクリーンな解析窓が収まる（旧8192は窓170msで記号より長く混信していた）。
const FFT_SIZE = 2048;
const MIN_STABLE_FRAMES = 2;  // この連続フレーム数で安定判定
const AMP_THRESHOLD = 50;
const FREQ_TOLERANCE_HZ = 80; // 最近傍スナップ許容幅

// ブロードキャスト（対称ランダムバックオフ）モードのタイミング
const BC_BACKOFF_MIN_MS = 800;
const BC_BACKOFF_MAX_MS = 2500;
const BC_END_ALPHA_MS = 500;    // START検出後、END待ちに上乗せする余裕(α)
const BC_RESPOND_DELAY_MS = 300; // END受信→応答送信までの待ち
const BC_MAX_CYCLES = 6;        // 鳴くサイクルの上限（トークン有効期限60秒内）
const PRE_BARK_MS = 800;        // 鳴き直前 0.8 秒だけ quick_stand を出す（"-0.8sec" 指定）

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function randBroadcastBackoffMs(): number {
  return BC_BACKOFF_MIN_MS + Math.floor(Math.random() * (BC_BACKOFF_MAX_MS - BC_BACKOFF_MIN_MS));
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

// 1フレーム(symbolCount記号)の送信ブロック時間の目安: lead + count*100 + tail
export function frameDurationMs(symbolCount: number): number {
  return TX_LEAD_MS + symbolCount * SLOT_MS + TX_TAIL_MS;
}

// existingCtx を渡すと既存コンテキストを使い、close しない（コントローラが自前のctxで鳴らす用）
export async function playSymbols(symbols: number[], existingCtx?: AudioContext): Promise<void> {
  const ctx = existingCtx ?? new AudioContext();
  const n = symbols.length;
  let t = ctx.currentTime + TX_LEAD_MS / 1000;

  for (let i = 0; i < n; i++) {
    playTone(ctx, SYMBOL_FREQS[symbols[i]], t, SLOT_TONE_MS);
    t += SLOT_MS / 1000;
  }

  await sleep(TX_LEAD_MS + n * SLOT_MS + TX_TAIL_MS);
  if (!existingCtx) ctx.close();
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

// ---- ブロードキャスト交換コントローラ ----
// 対称ランダムバックオフの半二重ループ:
//   ランダム待機(聞く) → START検出でEND待ち受信専念 → 鳴く(送信中は聞かない) → 繰り返し。
// 相手トークンを受信したら onPeerReceived を一度だけ発火。matched 判定は音声ではなく
// HTTP 側（resolve/poll）から markMatched() で受け取り、鳴き止める。
export interface BroadcastExchange {
  start: () => Promise<void>;
  stop: () => void;
  markMatched: () => void;
}

export type ExchangeClipName = 'slow_stand' | 'bark_vibe' | 'quick_sit' | 'quick_stand';
export type ExchangeRestImage = 'stop' | 'listen';

export function createBroadcastExchange(opts: {
  ownPayload: number[];
  onPeerReceived: (payload: number[]) => void;
  onExhausted: (received: boolean) => void;
  onError: (reason: 'mic_denied') => void;
  // 上層: ワンショット webp クリップを1回再生させる
  onClip?: (name: ExchangeClipName) => void;
  // 下層: クリップ非再生中に見せる静止画
  onRest?: (image: ExchangeRestImage) => void;
}): BroadcastExchange {
  const { ownPayload, onPeerReceived, onExhausted, onError, onClip, onRest } = opts;
  const ownSymbols = encodePayload(ownPayload);
  const frameSymbolCount = ownSymbols.length; // START + 14 + END = 16記号

  let animId = 0;
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let stopped = false;
  let matched = false;
  let received = false;
  let transmitting = false;

  // 受信状態機械
  type RxState = 'IDLE' | 'READING' | 'DONE';
  let rxState: RxState = 'IDLE';
  let rxBuffer: number[] = [];
  let rxPayload: number[] | null = null;

  function rxReset() {
    rxState = 'IDLE';
    rxBuffer = [];
    rxPayload = null;
  }

  function markMatched() {
    matched = true;
  }

  function stop() {
    stopped = true;
    cancelAnimationFrame(animId);
    stream?.getTracks().forEach(t => t.stop());
    audioCtx?.close();
    transmitting = false; // 半二重制御フラグのリセット（映像通知は UI 側の cleanup が担当）
  }

  function emitSymbol(sym: number) {
    if (rxState === 'DONE') return; // 受信完了済み

    if (sym === START_SYMBOL) {
      rxState = 'READING';
      rxBuffer = [];
      return;
    }

    if (rxState !== 'READING') return;

    if (sym === END_SYMBOL) {
      const decoded = decodeFrame(rxBuffer);
      if (decoded && !arraysEqual(decoded, ownPayload)) {
        rxState = 'DONE';
        rxPayload = decoded;
      } else {
        rxState = 'IDLE';
      }
      rxBuffer = [];
      return;
    }

    // 有効データシンボル 0–13
    if (sym < 0 || sym > BASE) {
      rxState = 'IDLE';
      rxBuffer = [];
      return;
    }

    // 隣接重複圧縮（二重カウント対策）
    if (rxBuffer.length > 0 && rxBuffer[rxBuffer.length - 1] === sym) return;

    rxBuffer.push(sym);
    if (rxBuffer.length > DATA_SYMBOLS_LEN) {
      rxState = 'IDLE';
      rxBuffer = [];
    }
  }

  // START検出後、ENDまで受信専念。成功でtrue、雑音/失敗/タイムアウトでfalse。
  async function awaitEnd(timeoutMs: number): Promise<boolean> {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      if (stopped || matched) return false;
      if (rxState === 'DONE') return true;
      if (rxState === 'IDLE') return false; // デコード失敗で巻き戻った＝雑音
      await sleep(10);
    }
    return false;
  }

  async function runBroadcast() {
    const dataDuration = frameDurationMs(frameSymbolCount);

    for (let cycle = 0; cycle < BC_MAX_CYCLES && !stopped && !matched; cycle++) {
      // --- ランダム待機（聞く） ---
      // 待機終盤 PRE_BARK_MS で quick_stand を出す。待機中に相手のSTARTを検出したら
      // リズム崩れとして listen.png に切り替え（再生中クリップは UI 側で流し切る）。
      rxReset();
      let rhythmBroken = false;
      let standEmitted = false;
      const deadline = performance.now() + randBroadcastBackoffMs();
      while (performance.now() < deadline && !stopped && !matched) {
        if (rxState === 'READING') {
          // 相手が鳴き始めた → リズム崩れ。受信専念（DATA長+α だけEND待ち）
          rhythmBroken = true;
          onRest?.('listen');
          const ok = await awaitEnd(dataDuration + BC_END_ALPHA_MS);
          if (ok && rxPayload && !received) {
            received = true;
            onPeerReceived(rxPayload);
          } else if (!ok) {
            rxReset();
          }
          break;
        }
        if (!standEmitted && performance.now() >= deadline - PRE_BARK_MS) {
          onClip?.('quick_stand'); // 鳴き直前の立ち上がり
          standEmitted = true;
        }
        await sleep(10);
      }

      if (stopped || matched) break;

      // 崩れて早期 break した場合も quick_stand は流す（流し切ってから listen.png が埋める）
      if (rhythmBroken && !standEmitted) onClip?.('quick_stand');

      if (received) await sleep(BC_RESPOND_DELAY_MS); // 受信直後は数百ms後に応答

      if (stopped || matched) break;

      // --- 鳴く（DATA送信・聞かない） ---
      transmitting = true;
      onClip?.('bark_vibe');
      await playSymbols(ownSymbols, audioCtx ?? undefined);
      transmitting = false;
      onClip?.('quick_sit');  // 鳴き終わり
      onRest?.('stop');       // 次サイクルの休憩は stop.png
    }

    // 双方成立は React 側が markMatched + loadSession 済み。それ以外は上限到達。
    if (!matched && !stopped) onExhausted(received);
  }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
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
    let currentSymbol: number | null = null;
    let stableCount = 0;

    function loop() {
      if (stopped) return;

      // 送信中は聞かない（半二重・自己エコー回避）
      if (!transmitting) {
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
      }

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);
    await runBroadcast();
  }

  return { start, stop, markMatched };
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
