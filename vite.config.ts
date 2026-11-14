import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // .scratch/ は作業用の置き場（コミットしない）。中のファイルが変わっても、開いている画面を読み直さない
    watch: { ignored: ['**/.scratch/**'] },
  },
});
