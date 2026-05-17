# テスト戦略

PoC 段階でも以下のユニットテスト・統合テストを実装する。自動ループの信頼性はこれらのコンポーネントの正確性に依存するため、テストなしでの PoC 検証は非推奨。

---

## ユニットテスト（必須）

### 1. Severity パーサー

> 仕様の詳細は [Severity パーサー仕様](../specs/severity-parser.md) を参照。

- `P0 Title` → severity: `P0`, title: `Title`
- `[P1] Title` → severity: `P1`, title: `Title`
- `**P0** Title` → severity: `P0`, title: `Title`
- `**[P0]** Title` → severity: `P0`, title: `Title`
- `[P0]Title`（スペースなし） → severity: `P0`, title: `Title`
- `P2 Title` → 対象外（無視される）
- `\n  P0 Title`（先頭に空白・改行） → severity: `P0`, title: `Title`（strip 後にマッチ）
- `Some text with P0 in the middle` → フォールバック検知
- `No severity badge at all` → severity なし

### 2. findings ハッシュ

> 仕様の詳細は [ループ検知](../specs/loop-detection.md) を参照。

- 同一 findings セット → 同一ハッシュ（決定性）
- findings の順序が異なる → 同一ハッシュ（順序非依存）
- 1件でも異なる finding → 異なるハッシュ
- `line` のみ異なる → 同一ハッシュ（`line` はキーに含めない）

### 3. claude-code-action 統合 (post-fix scope check / CHECK_COMMAND)

> 旧 `edit_file` ベースの単一適用ロジックは TY-236 で削除済み。修正そのものは `anthropics/claude-code-action@v1` (repo-level repair executor) に委譲され、テスト対象は **claude-code-action の出力を受け取る post-fix 側のガード** に移った。

- scope check の violation 種別ごとに stop reason が `scope_violation` で返る (path traversal / hard-block / disallowed prefix / 上限超過)
- `CHECK_COMMAND` 失敗時に `git reset --hard HEAD` + `git clean -ffd` で working tree が原状復帰し、`stopped(test_failure)` を残す
- `CHECK_COMMAND` 成功時のみ `git add → commit → push` が走る
- `outcome=failure` / `outcome=cancelled` / `max_turns_exceeded` の各経路で `action_failure` / `action_timeout` / `max_turns_exceeded` に分岐する

詳細仕様は [Claude Code repair request 仕様](../specs/claude-code-repair-request.md) と [変更スコープ検査](../operations/security.md#変更スコープ検査post-fix) を参照。

### 4. ループ検知

> 仕様の詳細は [ループ検知](../specs/loop-detection.md) を参照。

- 同一ハッシュ → ループ検知
- 振動パターン（A → B → A） → ループ検知
- 異なるハッシュ → ループなし

---

## 統合テスト（推奨）

- **モック Codex コメント**を使った Workflow B の Phase 1（レビュー受信・集約）の E2E テスト
- GitHub API のレスポンスをモックし、パース → severity 抽出 → findings JSON 生成の一連の流れを検証する
- 実際の Codex インラインコメントの原文を GitHub Actions Artifact として保存し、テストケースの入力データとして使用する
- 複数 Codex 指摘を受けた場合の auto-fix loop を検証する（TY-138）
  - 同一ファイルに複数閾値以上 finding があるケース
  - 複数ファイルに閾値以上 finding が分散するケース
  - 全 finding の修正結果が `CHECK_COMMAND` 成功後に 1 iteration / 1 commit に集約されることを確認する
  - 全 finding が修正不能な場合のみ stopped になることを確認する
  - claude-code-action 失敗 (`outcome=failure`) / timeout (`outcome=cancelled`) / `max_turns_exceeded` の各経路で stop reason が正しく分岐することを確認する

---

## テスト実行

テストは `CHECK_COMMAND`（デフォルト: `npm run check`）に含めるか、CI の別ステップとして実行する。

---

## 関連ドキュメント

- [Severity パーサー仕様](../specs/severity-parser.md)
- [Claude 修正エンジン仕様](../specs/claude-fix-engine.md)
- [ループ検知](../specs/loop-detection.md)
- [全ドキュメント索引](../README.md)
