import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // .scratch/ は作業用の置き場（コミットしない）なので、テストを探さない
    exclude: [...configDefaults.exclude, '.scratch/**'],
  },
});
