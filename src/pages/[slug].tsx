import type { GetStaticPaths, GetStaticProps, NextPage } from 'next';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_APPS,
  AppDef,
  ModelDef,
  availableModelIds,
  effectiveAllowedModels,
  getApp,
} from '@/lib/config';
import Layout from '@/components/Layout';
import HistorySidebar from '@/components/HistorySidebar';
import MarkdownView from '@/components/MarkdownView';
import PasswordModal from '@/components/PasswordModal';
import {
  HistoryItem,
  addHistory,
  clearHistory,
  deleteHistory,
  exportHistory,
  importHistory,
  loadHistory,
  newId,
} from '@/lib/history';

const MAX_INPUT = 100_000;

type Props = {
  app: Pick<AppDef, 'slug' | 'name' | 'description' | 'systemPrompt'> & {
    requiresPassword: boolean;
    defaultModel: string;
  };
  models: ModelDef[];
};

const AppPage: NextPage<Props> = ({ app, models }) => {
  const [systemPrompt, setSystemPrompt] = useState(app.systemPrompt);
  const [userPrompt, setUserPrompt] = useState('');
  const [model, setModel] = useState(app.defaultModel);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Password gating — always require on mount, no persistence
  const [authed, setAuthed] = useState(!app.requiresPassword);
  const [password, setPassword] = useState<string>('');

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHistory(loadHistory(app.slug));
  }, [app.slug]);

  const onPasswordSuccess = (pw: string) => {
    setPassword(pw);
    setAuthed(true);
  };

  const onGenerate = async () => {
    if (!userPrompt.trim() || loading) return;
    if (systemPrompt.length + userPrompt.length > MAX_INPUT) {
      setErrorMsg(`入力が長すぎます(合計 ${MAX_INPUT.toLocaleString()} 文字以下にしてください)`);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setResult('');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: app.slug,
          systemPrompt,
          userPrompt,
          modelId: model,
          password: app.requiresPassword ? password : undefined,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setAuthed(false);
          setPassword('');
        }
        throw new Error(j.error || `Error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop() ?? '';
        for (const ev of events) {
          const lines = ev.split('\n');
          let event = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (event === 'delta' && parsed.text) {
              acc += parsed.text;
              setResult(acc);
            } else if (event === 'error') {
              throw new Error(parsed.message || 'Generation error');
            }
          } catch (e) {
            // ignore parse errors on partial events
          }
        }
      }

      // Save history
      const item: HistoryItem = {
        id: newId(),
        timestamp: Date.now(),
        systemPrompt,
        userPrompt,
        result: acc,
        model,
      };
      setHistory(addHistory(app.slug, item));
    } catch (e: any) {
      if (e.name !== 'AbortError') setErrorMsg(e.message || '生成に失敗しました');
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const onStop = () => abortRef.current?.abort();

  const restoreItem = (it: HistoryItem) => {
    setSystemPrompt(it.systemPrompt);
    setUserPrompt(it.userPrompt);
    setResult(it.result);
    if (models.find((m) => m.id === it.model)) setModel(it.model);
    setDrawerOpen(false);
  };

  const onExportHistory = () => {
    const data = exportHistory(app.slug);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${app.slug}-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportHistory = async (file: File) => {
    try {
      const text = await file.text();
      const next = importHistory(app.slug, text);
      setHistory(next);
    } catch {
      alert('履歴ファイルの読み込みに失敗しました');
    }
  };

  const sidebar = (
    <HistorySidebar
      items={history}
      onSelect={restoreItem}
      onDelete={(id) => setHistory(deleteHistory(app.slug, id))}
      onClear={() => setHistory(clearHistory(app.slug))}
      onExport={onExportHistory}
      onImport={onImportHistory}
    />
  );

  if (!authed) {
    return (
      <Layout title={app.name}>
        <PasswordModal slug={app.slug} onSuccess={onPasswordSuccess} />
      </Layout>
    );
  }

  const totalChars = systemPrompt.length + userPrompt.length;
  const overLimit = totalChars > MAX_INPUT;

  return (
    <Layout title={app.name} sidebar={sidebar}>
      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-72 bg-white border-r border-slate-200 overflow-y-auto">{sidebar}</div>
          <div className="flex-1 bg-black/30" onClick={() => setDrawerOpen(false)} />
        </div>
      ) : null}

      <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 md:p-6 min-h-0">
        {/* 入力カラム */}
        <section className="flex flex-col min-w-0 min-h-0 gap-3">
          <div className="md:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              className="text-sm px-3 py-1 rounded border border-slate-300 bg-white"
            >
              履歴を開く
            </button>
          </div>

          {app.description ? (
            <p className="text-sm text-slate-600">{app.description}</p>
          ) : null}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-600">システムプロンプト</label>
              <button
                type="button"
                onClick={() => setSystemPrompt(app.systemPrompt)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                定義値にリセット
              </button>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-400 overflow-y-auto"
              style={{ height: '8rem' }}
            />
          </div>

          <div className="flex flex-col flex-1 min-h-0">
            <label className="text-xs font-semibold text-slate-600 mb-1">入力</label>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="ここに入力してください..."
              className="w-full flex-1 min-h-[12rem] border border-slate-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setUserPrompt('')}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white text-sm hover:bg-slate-100"
            >
              クリア
            </button>
            <button
              onClick={() => {
                setUserPrompt('');
                setResult('');
                setErrorMsg(null);
              }}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white text-sm hover:bg-slate-100"
            >
              リセット
            </button>
            {loading ? (
              <button
                onClick={onStop}
                className="px-4 py-1.5 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700"
              >
                停止
              </button>
            ) : (
              <button
                onClick={onGenerate}
                disabled={!userPrompt.trim() || overLimit}
                className="px-4 py-1.5 rounded bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-40"
              >
                生成
              </button>
            )}
            <span className={`text-xs ml-auto ${overLimit ? 'text-red-600' : 'text-slate-400'}`}>
              {totalChars.toLocaleString()} / {MAX_INPUT.toLocaleString()} 文字
            </span>
          </div>

          {errorMsg ? (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {errorMsg}
            </div>
          ) : null}
        </section>

        {/* 結果カラム */}
        <section className="flex flex-col min-w-0 min-h-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-semibold text-slate-600">結果</h3>
            <button
              onClick={() => result && navigator.clipboard.writeText(result)}
              disabled={!result}
              className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-40"
            >
              コピー
            </button>
          </div>
          <div className="flex-1 bg-white border border-slate-200 rounded p-3 overflow-y-auto min-h-[12rem]">
            {result ? (
              <MarkdownView text={result} />
            ) : loading ? (
              <p className="text-sm text-slate-400">生成中...</p>
            ) : (
              <p className="text-sm text-slate-300">ここに結果が表示されます</p>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
};

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: ALL_APPS.map((a) => ({ params: { slug: a.slug } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const slug = params?.slug as string;
  const app = getApp(slug);
  if (!app) return { notFound: true };

  const available = availableModelIds();
  const models = effectiveAllowedModels(app, available);
  const defaultModel =
    app.defaultModel && models.find((m) => m.id === app.defaultModel)
      ? app.defaultModel
      : models[0]?.id ?? 'claude-sonnet-4-6';

  return {
    props: {
      app: {
        slug: app.slug,
        name: app.name,
        description: app.description,
        systemPrompt: app.systemPrompt,
        requiresPassword: Boolean(app.password),
        defaultModel,
      },
      models,
    },
  };
};

export default AppPage;
