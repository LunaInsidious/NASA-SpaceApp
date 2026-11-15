import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // .scratch/ は作業用の置き場、.claude/ は Claude Code の置き場（別の作業の worktree が入る）。どちらもコミットしないので、テストを探さない
    exclude: [...configDefaults.exclude, '.scratch/**', '.claude/**'],
  },
});
