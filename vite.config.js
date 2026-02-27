import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	ssr: {
		noExternal: ['@strudel/web', '@strudel/core', '@strudel/mini', '@strudel/tonal', '@strudel/transpiler', '@strudel/webaudio']
	}
});
