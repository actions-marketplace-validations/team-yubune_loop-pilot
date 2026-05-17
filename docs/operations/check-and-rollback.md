# 検証コマンドとロールバック

## 検証コマンド（test / lint / typecheck）

Claude が修正を適用した後に実行する検証コマンドは `CHECK_COMMAND` 環境変数で指定する。

**PoC 実測:** PR #7 の Workflow B run `25434230427` では、依存関係セットアップ後に `CHECK_COMMAND` が成功し、その後 commit/push された。TY-40 で `CHECK_COMMAND` 前の依存関係セットアップを追加済み。

### コマンド設計

- 単一のコマンドで test / lint / typecheck をまとめて実行する想定（例: `npm run check` が内部で `tsc --noEmit && eslint . && vitest run` を実行する）
- プロジェクトの `package.json`（または相当の設定ファイル）に `check` スクリプトを定義しておく
- 複数コマンドを直列実行する場合は `&&` で連結して指定する（例: `npm run lint && npm test`）

---

## 失敗時の挙動

`CHECK_COMMAND` が非ゼロで終了した場合、commit / push は行わない。

### ロールバックのフロー (TY-236 以降: `claude-code-action` 経路)

1. `anthropics/claude-code-action@v1` が repo-level repair を実行し、working tree を直接編集する（変更点は `git diff --numstat HEAD` で把握する）
2. post-fix が `git diff` を `parseGitNumstat` → `checkScope` に通し、`src/`, `tests/`, `docs/` の allow-list と hard-block / size budget で違反を弾く
3. **scope 違反:** `git reset --hard HEAD` + `git clean -ffd` で working tree を巻き戻し、`stopped(scope_violation)` で停止
4. **scope OK → `CHECK_COMMAND` 実行**
5. **`CHECK_COMMAND` 失敗:** 同じく `git reset --hard HEAD` + `git clean -ffd` で巻き戻し、`stopped(test_failure)` で停止。失敗末尾は `state.previousCheckFailure` に保存して次 iteration の prompt に渡す

- `git clean -ffd` を使うのは claude-code-action が新規ファイルを書き込みうるため。`git reset --hard HEAD` だけでは untracked file が残り、後続 iteration を汚染する

### 失敗時の状態と報告

- `status: stopped`, `stop_reason: test_failure` で停止する
- PR に失敗内容（コマンド出力の冒頭 20行 + 末尾 50行）をコメントとして投稿する。冒頭を含めるのは、テストフレームワークによってはエラーサマリーが出力の先頭に表示されるため

**PoC 実測:** PR #7 の途中検証で依存関係未セットアップにより `CHECK_COMMAND` が失敗し、変更はロールバックされ停止コメントが投稿された。その後 TY-40 で依存関係セットアップを追加し、PR #7 の再検証では成功した。

### 出力のサニタイズ

投稿前に以下の処理を行う:

- ANSI エスケープシーケンスを除去する（例: `sed 's/\x1b\[[0-9;]*[a-zA-Z]//g'`。`[a-zA-Z]` とすることで、カラーコード `m` だけでなくカーソル移動 `H` `J` 等のシーケンスも除去できる）
- コメント全体が GitHub の文字数制限（65,536 文字）を超えないよう、末尾行数を調整して切り詰める

---

## 関連ドキュメント

- [Claude Code repair request 仕様](../specs/claude-code-repair-request.md) — claude-code-action 向け repair prompt
- [Claude 修正エンジン仕様 (archived)](../_archive/specs/claude-fix-engine.md) — 旧 `edit_file` 直適用方式の歴史記録
- [停止条件とリカバリ](stop-and-recovery.md) — テスト失敗後の停止・復帰
- [推奨フローと状態管理](../architecture/flow-and-state.md) — フロー全体での位置づけ
- [全ドキュメント索引](../README.md)
