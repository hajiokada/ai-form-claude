# 要件定義書: 生成AIミニアプリプラットフォーム

## 1. 概要
複数の生成AIミニアプリを1つのNext.jsアプリ上で動的に提供するプラットフォーム。各アプリはJSON設定で定義し、入力・履歴はブラウザローカルに保存、APIキーはサーバー側のenvで管理する。Vercelにデプロイする。

## 2. 技術スタック
- **フレームワーク**: Next.js (Pages Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **AI SDK**: Vercel AI SDK (`ai` + `@ai-sdk/anthropic` / `@ai-sdk/openai` / `@ai-sdk/google`)
- **ローカル保存**: localStorage(履歴は容量に応じてIndexedDBも検討)
- **バリデーション**: Zod (JSON設定・APIリクエスト)
- **デプロイ**: Vercel (Node.js Runtime、`/api/generate` は `maxDuration` を60秒以上に設定。長文生成想定のためProプラン推奨)

## 3. アプリ構成

### 3.1 ルーティング
- `/` : アプリ一覧ページ
- `/[slug]` : 各ミニアプリページ
- `/api/generate` : 生成APIエンドポイント(サーバー側でAI API呼び出し、SSEストリーミング)

### 3.2 アプリ定義 (`config/apps.json`)
```json
[
  {
    "slug": "care-letter",
    "name": "カルテ→ケアマネレター変換",
    "description": "訪問診療のカルテをケアマネ宛レターに整形",
    "password": null,
    "systemPrompt": "あなたは在宅医療の...",
    "defaultModel": "claude-sonnet-4-6",
    "allowedModels": ["claude-sonnet-4-6", "claude-opus-4-6", "gpt-5"]
  }
]
```
- `password`: null/未設定なら公開、文字列ならパスワード保護
- `defaultModel`: 未指定時は `claude-sonnet-4-6`
- `allowedModels`: 未指定時はenvで利用可能な全モデル

### 3.3 モデル定義 (`config/models.json`)
```json
[
  { "id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6", "provider": "anthropic", "apiModel": "claude-sonnet-4-6" },
  { "id": "claude-opus-4-6",  "label": "Claude Opus 4.6",  "provider": "anthropic", "apiModel": "claude-opus-4-6" },
  { "id": "gpt-5",            "label": "GPT-5",            "provider": "openai",    "apiModel": "gpt-5" },
  { "id": "gemini-2.5-pro",   "label": "Gemini 2.5 Pro",   "provider": "google",    "apiModel": "gemini-2.5-pro" }
]
```
- envにAPIキーが設定されているproviderのモデルのみ選択肢に表示

### 3.4 環境変数 (`.env.local` / Vercel環境変数)
```
ANTHROPIC_API_KEY=必須
OPENAI_API_KEY=任意
GOOGLE_GENERATIVE_AI_API_KEY=任意
```
- Anthropic未設定時はアプリ起動エラー

## 4. UI仕様

### 4.1 レイアウト
```
┌─────────────────────────────────────────┐
│ ヘッダー: アプリ名 / ホームリンク        │
├──────────────┬──────────────────────────┤
│              │                          │
│ 履歴サイド   │  中央エリア              │
│  バー(左)    │  - システムプロンプト     │
│              │  - ユーザー入力           │
│              │  - モデル選択/ボタン群    │
│              │  - 結果表示               │
│              │                          │
├──────────────┴──────────────────────────┤
│ フッター: 保存/プライバシー説明          │
└─────────────────────────────────────────┘
```
- モバイルでは左からスライドインするドロワー形式

### 4.2 中央エリア
| 要素 | 仕様 |
|------|------|
| システムプロンプト | textarea、アプリ定義の値を初期表示、編集可、自動リサイズ、定義値へのリセットボタン付き |
| ユーザー入力 | textarea、長文対応、自動リサイズ |
| モデル選択 | select、利用可能モデルのみ |
| クリアボタン | ユーザー入力をクリア |
| 生成ボタン | 押下ごとに必ず再実行(入力変更の有無に関わらず) |
| 結果表示 | Markdownレンダリング、コピーボタン付き、ストリーミング表示 |

### 4.3 履歴(左サイドバー)
- localStorage キー: `history:{slug}`
- 保存内容: `id`, `timestamp`, `systemPrompt`, `userPrompt`, `result`, `model`
- 機能: クリックで中央エリアに復元 / 個別削除 / 全削除 / 上限100件(超過時は古いものから削除)

### 4.4 パスワード保護
- 初回アクセス時にモーダル表示
- sessionStorageに検証済みフラグ保存(タブを閉じると再要求)
- サーバー側(`/api/generate`)でもパスワードを検証(クライアントのみの保護は不十分)

## 5. 生成フロー
1. クライアント: `/api/generate` にPOST (`slug`, `systemPrompt`, `userPrompt`, `modelId`, `password?`)
2. サーバー: アプリ設定取得 → パスワード検証 → Vercel AI SDKの `streamText` でproviderに応じて呼び出し
3. SSEでストリーミングレスポンスを返却
4. クライアント: リアルタイム表示 + 完了時に履歴へ追加

## 6. セキュリティ・プライバシー
- **APIキー**: サーバー側のみ。クライアントへは一切露出しない
- **学習への不使用**:
  - Anthropic: APIデフォルトで学習に使用されない
  - OpenAI: APIデフォルトで学習利用なし
  - Google: Gemini APIの学習利用設定を無効化(有料枠推奨)
- **通信**: HTTPSのみ。外部分析・トラッキング無し
- **ローカル保存**: 履歴はユーザーのブラウザ内のみ。サーバーには保存しない
- **CSP**: 厳格なContent-Security-Policy設定
- **レート制限**: `/api/generate` にIPベースのレート制限(例: 60req/min、Vercel KVまたはUpstash Redisで実装)
- **入力サイズ制限**: 合計100,000文字程度を上限

## 7. フッター表記(例)
> 入力・生成結果はあなたのブラウザ内にのみ保存され、当サーバーには記録されません。
> 生成AI提供各社のAPI経由で処理され、入力内容はAIの学習には使用されません。

## 8. Vercelデプロイ時の注意点
- 関数タイムアウト: Hobby 10秒 / Pro 60秒(最大300秒)。長文生成ではストリーミング必須
- `config/*.json` はビルド時にバンドルされるため、アプリ追加時は再デプロイが必要(将来的にVercel KV等への移行余地あり)
- 環境変数はVercelダッシュボードで設定

## 9. 拡張余地(将来)
- エクスポート/インポート(履歴JSON)
- アプリ設定のUI上での編集
- 画像入力対応
- Vercel KVへの設定移行(再デプロイ不要化)