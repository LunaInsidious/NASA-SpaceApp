import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // .scratch/ は作業用の置き場、.claude/ は Claude Code の置き場（別の作業の worktree が入る）。どちらもコミットしない。
    // 中のファイルが変わっても、開いている画面を読み直さない（worktree の tsconfig の変更で開発サーバーが止まっていた）
    watch: { ignored: ['**/.scratch/**', '**/.claude/**'] },
  },
});
