# システム概要

## 目的

Pull Request に対して、以下の自動ループを実現する。

1. PR を作成
2. Codex がレビュー
3. Codex の指摘を Claude に渡す
4. Claude が修正して commit / push
5. Codex が再レビュー
6. 閾値以上 (default `P3`) の指摘がなくなるまで繰り返す
7. ただし `MAX_REVIEW_ITERATIONS` 回で停止（デフォルト 20 回）

---

## 本リポジトリの位置づけ

このリポジトリは、エンドユーザー向けに公開された本番の GitHub Action である。

同一リポジトリ PR に対する Workflow A/B の主要 E2E は確認済みであり、運用・セキュリティ・コストに関する判断は各リポジトリの運用方針に従って設定する。

---

## 基本方針

- **Codex はレビュー専任**
- **Claude は修正専任**
- 再レビューは push 自動連動ではなく、**明示的に `@codex review` を起動**
- Claude に渡す単位は **1 コメント単位ではなく「最新の Codex review 一式」**
- 修正対象は **`LOOPPILOT_SEVERITY_THRESHOLD` 以上の severity**（デフォルト `P3` → P0/P1/P2/P3 すべて、`P2` で P3 を skip する挙動に戻す選択あり）
- **最大往復回数は環境変数 `MAX_REVIEW_ITERATIONS` で制御**（デフォルト: 20）
- **Codex レビュー受信後、一定時間待機してから Claude に渡す**

---

## 設定可能なパラメータ

設定値（Repository variables / secrets）の一覧・既定値は、ドリフトを防ぐため **ルート [README](../../README.md) を単一の情報源** とする。

- 全変数の早見表 → [README「設定 (Repository variables)」](../../README.md#設定-repository-variables)
- トークンと必要権限（Fine-grained PAT のスコープ）→ [README「トークンと必要権限」](../../README.md#トークンと必要権限-fine-grained-pat)
- スコープ検査の詳細 → [scope-policy.md](../operations/scope-policy.md) / 認証・トークンの設計根拠 → [security.md](../operations/security.md)

本ドキュメントが前提とする主要な挙動:

- 修正対象は `LOOPPILOT_SEVERITY_THRESHOLD` 以上の severity（既定 `P3` = P0/P1/P2/P3 すべて）
- 最大往復回数は `MAX_REVIEW_ITERATIONS`（既定 20）
- Codex レビュー受信後 `DEBOUNCE_SECONDS`（既定 90 秒）待機してから集約する
- `LOOPPILOT_FULL_AUTO=true` の間はラベルの付け外しで開始/停止を制御できない（停止は `false` に戻すか workflow を無効化する）

---

## 役割分担

### Codex
- レビューだけ
- 設定 threshold 以上の指摘だけが auto-fix 対象（default `P3`）
- 修正はしない

### Claude
- 指摘修正だけ
- 必要最小限の変更だけ
- テスト・lint・型チェックを通す
- commit / push する

この責務分離により、ループが安定しやすくなる。

---

## 最終まとめ

今回の設計は以下。

- **Codex はレビュー専任（bot: `chatgpt-codex-connector[bot]`）**
- **Claude は修正専任（`anthropics/claude-code-action@v1` を GitHub Actions 内で呼び出し）**
- **Codex の総評レビュー（`pull_request_review`）を主トリガーに Workflow B を起動し、互換用に `issue_comment` も許可**
- **インラインコメント（`pull_request_review_comment`）を GitHub API で一括取得し、`LOOPPILOT_SEVERITY_THRESHOLD` 以上の severity を抽出**
- **修正は `anthropics/claude-code-action@v1` (repo-level repair) に委譲し、post-fix で scope check + `CHECK_COMMAND` を回す**
- **レビュー受信後に `DEBOUNCE_SECONDS` 秒待機してから集約する**
- **Claude 修正後に `@codex review` を再実行（`CODEX_REVIEW_REQUEST_TOKEN` 設定時は接続済みユーザー PAT で投稿）**
- **閾値以上の finding がなくなるか `MAX_REVIEW_ITERATIONS` 回到達で終了**
- **状態は PR の hidden comment で管理（status の遷移は [状態遷移図](flow-and-state.md#状態遷移図) を参照）**
- **Workflow 2本構成（A: 初期化、B: レビュー受信+修正）**
- **API キーは Repository secrets で管理**

この構成が、最も制御しやすく、運用上も安定しやすい。

---

## 関連ドキュメント

- [推奨フローと状態管理](flow-and-state.md) — ステップごとの詳細と状態遷移
- [イベント設計](event-design.md) — Workflow A/B のトリガーと重複防止
- [Severity パーサー仕様](../specs/severity-parser.md) — Codex コメントの解析
- [Claude Code repair request 仕様](../specs/claude-code-repair-request.md) — `claude-code-action` 向け repair prompt 生成
- [全ドキュメント索引](../README.md)
