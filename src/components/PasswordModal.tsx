import { useState } from 'react';

export default function PasswordModal({
  slug,
  onSuccess,
}: {
  slug: string;
  onSuccess: (pw: string) => void;
}) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, password: pw }),
      });
      if (res.ok) {
        onSuccess(pw);
      } else if (res.status === 401) {
        setError('パスワードが正しくありません');
      } else if (res.status === 429) {
        setError('試行回数が多すぎます。しばらく待ってから再試行してください');
      } else {
        setError('検証に失敗しました');
      }
    } catch {
      setError('ネットワークエラー');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h2 className="font-semibold mb-2">パスワードが必要です</h2>
        <p className="text-xs text-slate-500 mb-3">このアプリは保護されています。</p>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          placeholder="パスワード"
        />
        {error ? <p className="text-xs text-red-600 mt-2">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !pw}
          className="mt-4 w-full bg-slate-900 text-white rounded py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-40"
        >
          {busy ? '確認中...' : '続行'}
        </button>
      </form>
    </div>
  );
}
