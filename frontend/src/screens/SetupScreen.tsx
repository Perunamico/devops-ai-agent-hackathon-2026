import { useState } from 'react';
import { useApp } from '../App';
import { createPet } from '../api';

export default function SetupScreen() {
  const { setPet, setScreen } = useApp();
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('');
  const [tone, setTone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const pet = await createPet({ name, personality, tone });
      setPet(pet);
      setScreen('home');
    } catch (err) {
      setError(err instanceof Error ? err.message : '作成に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-b from-violet-50 to-white">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🐾</div>
          <h1 className="text-2xl font-bold text-gray-900">AIペットをつくろう</h1>
          <p className="text-sm text-gray-500 mt-2">
            あなたの代わりに話しかける小さな仲介役です
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ペットの名前
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              required
              placeholder="例：ポチ"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              性格・特徴
            </label>
            <textarea
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              maxLength={200}
              required
              rows={3}
              placeholder="例：好奇心旺盛で探検家みたい。新しいことが好き"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              話し方・口調
            </label>
            <textarea
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              maxLength={200}
              required
              rows={2}
              placeholder="例：やわらかく短文。断定しない、のんびり系"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-violet-600 text-white rounded-xl py-3 font-semibold text-sm
              hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'ペットが目覚めています...' : 'ペットをつくる'}
          </button>
        </form>
      </div>
    </div>
  );
}
