import { useState, useRef } from 'react';
import { playToken, listenForToken, StopListening, DebugInfo } from './audio';

type TokenData = {
  token: string;
  frequencies: number[];
  expires_at: string;
};

type ListenStatus = 'idle' | 'listening' | 'error';

export default function App() {
  const [issued, setIssued] = useState<TokenData | null>(null);
  const [recognized, setRecognized] = useState<string | null>(null);
  const [recognizedFreqs, setRecognizedFreqs] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [listenStatus, setListenStatus] = useState<ListenStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [history, setHistory] = useState<{ token: string; match: boolean }[]>([]);
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [partial, setPartial] = useState<{ text: string; captured: number; freqs: number[] } | null>(null);
  const stopRef = useRef<StopListening | null>(null);
  const lockedRef = useRef(false);

  async function handleIssueAndPlay() {
    setError(null);
    try {
      const res = await fetch('/token', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TokenData = await res.json();
      setIssued(data);
      setPlaying(true);
      await playToken(data.frequencies);
    } catch (e) {
      setError(`トークン取得失敗: ${e}`);
    } finally {
      setPlaying(false);
    }
  }

  async function handleToggleListen() {
    if (listenStatus === 'listening') {
      stopRef.current?.();
      stopRef.current = null;
      setListenStatus('idle');
      setDebug(null);
      setPartial(null);
    } else {
      setError(null);
      lockedRef.current = false;
      const stop = await listenForToken(
        (token, freqs) => {
          if (lockedRef.current) return;
          lockedRef.current = true;
          setPartial(null);
          setRecognized(token);
          setRecognizedFreqs(freqs);
          setFlash(true);
          setTimeout(() => setFlash(false), 600);
          setHistory((prev) => [
            { token, match: issued?.token === token },
            ...prev.slice(0, 9),
          ]);
        },
        (msg) => {
          setError(msg);
          setListenStatus('error');
        },
        (info) => setDebug(info),
        (text, captured, freqs) => {
          if (!lockedRef.current) setPartial({ text, captured, freqs });
        }
      );
      stopRef.current = stop;
      setListenStatus('listening');
    }
  }

  const match = issued && recognized ? issued.token === recognized : null;

  return (
    <div style={styles.root}>
      <h1 style={styles.title}>音声トークン テスト</h1>
      <p style={styles.subtitle}>
        「発行して再生」→ 鳴き声で送信 ／ 「聴取開始」→ マイクで受信・デコード
      </p>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {match !== null && (
        <div style={{ ...styles.matchBanner, background: match ? '#d4edda' : '#f8d7da' }}>
          {match ? '✅ 一致' : '❌ 不一致'}　{issued!.token} vs {recognized}
        </div>
      )}

      <div style={styles.panels}>
        {/* ── 左パネル: 発行 ── */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelIcon}>📢</span>
            <span>発行中のトークン</span>
          </div>

          <div style={styles.tokenDisplay}>
            {issued?.token ?? <span style={{ color: '#bbb' }}>未発行</span>}
          </div>

          {issued && (
            <>
              <div style={styles.freqLabel}>周波数列（Hz）</div>
              <div style={styles.freqGrid}>
                {issued.frequencies.map((f, i) => (
                  <span key={i} style={styles.freqChip}>{f}</span>
                ))}
              </div>
              <div style={styles.expiry}>
                有効期限: {new Date(issued.expires_at).toLocaleTimeString('ja-JP')}
              </div>
            </>
          )}

          <button
            style={{ ...styles.btn, ...(playing ? styles.btnDisabled : styles.btnPrimary) }}
            onClick={handleIssueAndPlay}
            disabled={playing}
          >
            {playing ? '⏳ 再生中...' : '🔊 発行して再生'}
          </button>
        </div>

        {/* ── 右パネル: 認識 ── */}
        <div style={{ ...styles.panel, background: flash ? '#fffde7' : styles.panel.background, transition: 'background 0.3s' }}>
          <div style={styles.panelHeader}>
            <span style={styles.panelIcon}>🎤</span>
            <span>認識したトークン</span>
          </div>

          <div style={styles.tokenDisplay}>
            {recognized ?? <span style={{ color: '#bbb' }}>未認識</span>}
          </div>

          {recognizedFreqs.length > 0 && (
            <>
              <div style={styles.freqLabel}>受信周波数列（Hz）</div>
              <div style={styles.freqGrid}>
                {recognizedFreqs.map((f, i) => (
                  <span key={i} style={styles.freqChip}>{f}</span>
                ))}
              </div>
            </>
          )}

          {partial && !recognized && (
            <div style={styles.partialBox}>
              <div style={styles.partialLabel}>不完全 ({partial.captured}/16 トーン)</div>
              <div style={styles.partialToken}>{partial.text || '—'}</div>
              <div style={styles.freqLabel} >受信周波数列（Hz）</div>
              <div style={styles.freqGrid}>
                {partial.freqs.map((f, i) => (
                  <span key={i} style={styles.freqChip}>{f}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{ ...styles.statusBadge, color: listenStatus === 'listening' ? '#28a745' : '#6c757d' }}>
            {listenStatus === 'listening' ? '● 聴取中...' : listenStatus === 'error' ? '× エラー' : '○ 待機中'}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{
                ...styles.btn,
                ...(listenStatus === 'listening' ? styles.btnDanger : styles.btnSuccess),
              }}
              onClick={handleToggleListen}
            >
              {listenStatus === 'listening' ? '⏹ 聴取停止' : '🎙 聴取開始'}
            </button>
            {recognized && listenStatus === 'listening' && (
              <button
                style={{ ...styles.btn, background: '#6c757d', color: '#fff' }}
                onClick={() => { lockedRef.current = false; setRecognized(null); setRecognizedFreqs([]); setPartial(null); }}
              >
                🔄 次を認識
              </button>
            )}
          </div>

          {history.length > 0 && (
            <div style={styles.history}>
              <div style={styles.historyTitle}>認識履歴</div>
              {history.map((h, i) => (
                <div key={i} style={styles.historyRow}>
                  <span style={{ color: h.match ? '#28a745' : '#dc3545' }}>
                    {h.match ? '✅' : '❌'}
                  </span>
                  <code style={styles.historyToken}>{h.token}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── デバッグパネル ── */}
      {listenStatus === 'listening' && (
        <div style={styles.debugPanel}>
          <div style={styles.debugTitle}>リアルタイム音声モニタ</div>
          {debug ? (
            <div style={styles.debugGrid}>
              {/* 音量バー */}
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>音量</span>
                <div style={styles.barTrack}>
                  <div
                    style={{
                      ...styles.barFill,
                      width: `${(debug.volume / 255) * 100}%`,
                      background: debug.volume > 200 ? '#dc3545' : debug.volume > 100 ? '#28a745' : '#0d6efd',
                    }}
                  />
                </div>
                <span style={styles.debugVal}>{debug.volume}</span>
              </div>

              {/* 生周波数 */}
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>生Hz</span>
                <span style={styles.debugVal}>{debug.rawHz} Hz</span>
              </div>

              {/* スナップ後周波数 */}
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>スナップHz</span>
                <span style={{
                  ...styles.debugVal,
                  color: debug.isStart ? '#e67e22' : debug.isEnd ? '#e74c3c' : '#0d6efd',
                  fontWeight: debug.isStart || debug.isEnd ? 700 : 400,
                }}>
                  {debug.isStart
                    ? `${debug.snappedHz} Hz ← START`
                    : debug.isEnd
                    ? `${debug.snappedHz} Hz ← END`
                    : `${debug.snappedHz} Hz`}
                </span>
              </div>

              {/* 収録状態 */}
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>収録状態</span>
                <span style={{
                  ...styles.debugVal,
                  color: debug.recording ? '#28a745' : '#6c757d',
                  fontWeight: 700,
                }}>
                  {debug.recording
                    ? `● 収録中 ${debug.captured}/16 トーン`
                    : '○ 待機中（パイロット待ち）'}
                </span>
              </div>

              {/* 収録バー */}
              {debug.recording && (
                <div style={styles.debugRow}>
                  <span style={styles.debugLabel}>収録数</span>
                  <div style={styles.barTrack}>
                    <div style={{ ...styles.barFill, width: `${(debug.captured / 16) * 100}%`, background: '#28a745' }} />
                  </div>
                  <span style={styles.debugVal}>{debug.captured}/16</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#adb5bd', fontSize: 13 }}>音声入力なし（閾値60未満）</div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "'Courier New', monospace",
    maxWidth: 900,
    margin: '0 auto',
    padding: '24px 16px',
    color: '#212529',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: '0 0 4px',
  },
  subtitle: {
    color: '#6c757d',
    margin: '0 0 20px',
    fontSize: 14,
  },
  errorBanner: {
    background: '#f8d7da',
    border: '1px solid #f5c6cb',
    borderRadius: 6,
    padding: '10px 14px',
    marginBottom: 12,
    color: '#721c24',
  },
  matchBanner: {
    borderRadius: 6,
    padding: '10px 14px',
    marginBottom: 16,
    fontWeight: 600,
    fontSize: 16,
    textAlign: 'center',
  },
  panels: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
  },
  panel: {
    border: '2px solid #dee2e6',
    borderRadius: 10,
    padding: 20,
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontWeight: 700,
    fontSize: 16,
    marginBottom: 4,
  },
  panelIcon: {
    fontSize: 20,
  },
  tokenDisplay: {
    fontSize: 34,
    letterSpacing: 6,
    fontWeight: 700,
    minHeight: 48,
    wordBreak: 'break-all',
  },
  freqLabel: {
    fontSize: 11,
    color: '#6c757d',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  freqGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  freqChip: {
    background: '#e9ecef',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 12,
  },
  expiry: {
    fontSize: 12,
    color: '#adb5bd',
  },
  statusBadge: {
    fontSize: 14,
    fontWeight: 600,
  },
  btn: {
    padding: '10px 18px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 600,
    marginTop: 4,
  },
  btnPrimary: {
    background: '#0d6efd',
    color: '#fff',
  },
  btnDisabled: {
    background: '#adb5bd',
    color: '#fff',
    cursor: 'not-allowed',
  },
  btnSuccess: {
    background: '#198754',
    color: '#fff',
  },
  btnDanger: {
    background: '#dc3545',
    color: '#fff',
  },
  history: {
    marginTop: 8,
    borderTop: '1px solid #dee2e6',
    paddingTop: 8,
  },
  historyTitle: {
    fontSize: 11,
    color: '#6c757d',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  historyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    marginBottom: 2,
  },
  historyToken: {
    background: '#f8f9fa',
    padding: '1px 5px',
    borderRadius: 3,
  },
  partialBox: {
    background: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: 6,
    padding: '8px 12px',
  },
  partialLabel: {
    fontSize: 11,
    color: '#856404',
    marginBottom: 4,
  },
  partialToken: {
    fontSize: 22,
    letterSpacing: 4,
    fontWeight: 700,
    color: '#856404',
    wordBreak: 'break-all' as const,
  },
  debugPanel: {
    marginTop: 20,
    border: '2px solid #dee2e6',
    borderRadius: 10,
    padding: 20,
    background: '#1e1e2e',
    color: '#cdd6f4',
  },
  debugTitle: {
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    color: '#6c7086',
    marginBottom: 12,
  },
  debugGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  debugRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  debugLabel: {
    width: 90,
    fontSize: 12,
    color: '#6c7086',
    flexShrink: 0,
  },
  debugVal: {
    fontSize: 14,
    fontFamily: "'Courier New', monospace",
    minWidth: 160,
  },
  barTrack: {
    flex: 1,
    height: 10,
    background: '#313244',
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
    transition: 'width 0.05s',
  },
};
