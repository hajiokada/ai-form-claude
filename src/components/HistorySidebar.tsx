import { useRef } from 'react';
import { HistoryItem } from '@/lib/history';

export default function HistorySidebar({
  items,
  onSelect,
  onDelete,
  onClear,
  onExport,
  onImport,
}: {
  items: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col h-full min-h-0">
    <div className="p-3 flex-1 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold uppercase text-slate-500">履歴</h2>
        <div className="flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            読込
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
          {items.length > 0 ? (
            <>
              <button
                onClick={onExport}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                書出
              </button>
              <button
                onClick={() => {
                  if (confirm('履歴をすべて削除しますか?')) onClear();
                }}
                className="text-xs text-slate-500 hover:text-red-600"
              >
                全削除
              </button>
            </>
          ) : null}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">まだ履歴はありません</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li
              key={it.id}
              className="group rounded border border-slate-200 hover:border-slate-400 bg-white"
            >
              <button
                onClick={() => onSelect(it)}
                className="w-full text-left p-2"
                title={new Date(it.timestamp).toLocaleString()}
              >
                <div className="text-[10px] text-slate-500">
                  {new Date(it.timestamp).toLocaleString()} · {it.model}
                </div>
                <div className="text-xs text-slate-800 line-clamp-2">{it.userPrompt}</div>
              </button>
              <div className="flex justify-end px-2 pb-1">
                <button
                  onClick={() => onDelete(it.id)}
                  className="text-[10px] text-slate-400 hover:text-red-600"
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
    <div className="border-t border-slate-200 p-3 text-[10px] text-slate-500 leading-relaxed bg-white">
      入力・生成結果はあなたのブラウザ内にのみ保存され、当サーバーには記録されません。
      生成AI提供各社のAPI経由で処理され、入力内容はAIの学習には使用されません。
    </div>
    </div>
  );
}
