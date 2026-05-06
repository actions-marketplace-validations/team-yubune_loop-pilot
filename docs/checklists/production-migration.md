# 本番移植時の検討事項チェックリスト

PoC で動作確認した後、本プロジェクトに移植する際に対応すべき事項。

## 現状

PR #7 / TY-11 で、同一リポジトリ PR に対する Workflow A/B の主要 E2E は確認済み。

- Workflow A: hidden comment 作成、接続済みユーザー PAT による `@codex review` 投稿
- Codex: `pull_request_review` 総評 + inline `pull_request_review_comment` 投稿
- Workflow B: `pull_request_review` トリガー、PR head checkout、Claude 修正、`CHECK_COMMAND`、commit/push、修正要約、再 `@codex review`
- 最終終了: Codex の no major issues コメントを受け、`status: done`, `stopReason: no_findings`

この checklist は「PoC で動いたか」ではなく、「本番移植前に設計・運用として決めるべきこと」を残す。

---

## 設計上の修正が必要な項目（本番移植前に必須）

- [ ] インラインコメントの取得範囲フィルタの検証（`created_at` ベースのフィルタが期待通り動作するか）
- [ ] Claude API エラー時のリトライ戦略の実装・チューニング
- [ ] `CHECK_COMMAND` の各プロジェクトへの適用（`package.json` の `check` スクリプト整備）
- [ ] Claude API 呼び出しのバッチ化検討（findings が少ないファイル同士をまとめて1回の API 呼び出しで処理し、コスト効率を改善する。閾値例: 1ファイルあたり findings 1件以下のファイルはバッチ化対象）
- [ ] hidden comment の競合対策（楽観ロック + TOCTOU 対策の実装。方針は [状態管理](../architecture/flow-and-state.md#hidden-comment-の競合書き込みリスク) に記載済み。PoC では concurrency 制御で代替）
- [ ] large file の扱いを決める。PoC では文字数ベースの `MAX_INPUT_TOKENS_PER_FILE` 超過時にスキップし、chunking は未実装
- [ ] cross-file finding の扱いを決める。PoC はファイル単位で閉じた修正のみ対応
- [ ] 互換用 `issue_comment` トリガー経由で修正 commit/push まで進むケースを検証する、または本番では `pull_request_review` のみを正式対応にする
- [ ] `DEBOUNCE_SECONDS=0` への短縮可否を決める。PR #7 ではデフォルト待機での安定動作のみ確認済み
- [ ] `concurrency` キューの実運用リスクを判断する。GitHub Actions の待機キュー制約により、短時間の複数 review では中間 run が置き換えられる可能性がある

---

## 運用・セキュリティの項目

- [ ] デバウンス方式の見直し（`sleep` → イベント駆動 or 外部スケジューラ）
- [x] Codex のレビュー形式に合わせた severity パーサーの厳密化（PoC で取得した実コメントを基に）
- [x] `Codex Review` 文言の環境変数化（`CODEX_REVIEW_MARKER`）— PoC 段階で対応済み
- [x] Codex bot 名 `chatgpt-codex-connector[bot]` の環境変数化（`CODEX_BOT_LOGIN`）— PoC 段階で対応済み
- [ ] Bot Token のスコープ最小化と Fine-grained PAT の設定
- [ ] `CODEX_REVIEW_REQUEST_TOKEN` の運用方式決定（個人 PAT 継続ではなく、専用 machine user または GitHub App token への置き換えを検討）
- [x] Fork PR 起動防止の実装
- [ ] 外部 fork PR を使った起動防止 E2E 検証
- [ ] `MAX_REVIEW_ITERATIONS` の適正値決定（コスト試算に基づく。20以上も検討）
- [ ] `/reset-review` 等のリカバリコマンド実装
- [ ] hidden comment 消失時の自動リカバリ機構
- [ ] GitHub API レート制限の考慮（1 iteration あたり最低4回の API コール × 20 iteration = 80回。複数 PR が並行する場合は 1時間あたり1,000リクエスト制限に注意）
- [ ] Slack 通知等の運用連携

---

## PoC では完了、本番で再確認する項目

- [x] `CODEX_REVIEW_REQUEST_TOKEN` により、GitHub 連携済みユーザーとして `@codex review` を投稿できる
- [x] `GITHUB_TOKEN` の `contents: write` により、同一リポジトリ PR branch へ commit/push できる
- [x] Codex inline comment artifact を保存できる
- [x] `CHECK_COMMAND` 前に依存関係をセットアップできる
- [x] P0/P1 が解消された場合、hidden comment が `done / no_findings` になる

本番リポジトリでは branch protection、required checks、organization policy が異なる可能性があるため、上記は移植先でも最小 PR で再確認する。

---

## 関連ドキュメント

- [PoC チェックリスト](poc-checklist.md)
- [セキュリティ](../operations/security.md)
- [システム概要](../architecture/system-overview.md) — コスト概算・パラメータ
- [全ドキュメント索引](../README.md)
