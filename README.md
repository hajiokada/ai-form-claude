# Prompt Machine

複数の生成AIミニアプリを1つのNext.jsアプリ上で動的に提供するプラットフォーム。

## セットアップ

```bash
npm install
cp .env.local.example .env.local
# ANTHROPIC_API_KEY を最低限設定
npm run dev
```

## アプリの追加

`config/apps.json` にエントリを追加して再デプロイ。

```json
{
  "slug": "my-app",
  "name": "アプリ名",
  "description": "説明",
  "password": null,
  "systemPrompt": "...",
  "defaultModel": "claude-sonnet-4-6",
  "allowedModels": ["claude-sonnet-4-6", "gpt-5"]
}
```

## モデル

`config/models.json` で定義。env に対応する API キーが設定されている provider のみ選択肢に表示。

| Provider | 環境変数 |
|---|---|
| anthropic | `ANTHROPIC_API_KEY` (必須) |
| openai | `OPENAI_API_KEY` |
| google | `GOOGLE_GENERATIVE_AI_API_KEY` |

## デプロイ (Vercel)

- Pro プラン推奨(`/api/generate` の `maxDuration: 60`)
- 環境変数を Vercel ダッシュボードで設定

## 注意事項

- 履歴はブラウザの localStorage のみ。サーバーには保存されません。
- 入力サイズ上限: 100,000 文字
- レート制限: 既定 60 req/min/IP(インメモリ。マルチインスタンス環境では Upstash 等への置換推奨)
