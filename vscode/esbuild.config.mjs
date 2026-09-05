/**
 * VSCode 扩展打包配置（esbuild）
 *
 * 两个 build：
 * 1. extension —— src/extension.ts → out/extension.js（cjs 单文件 bundle，
 *    external: ['vscode']），替代原 tsc emit 多文件产物
 * 2. webview —— src/webview/main.ts → media/dashboard.js（iife bundle），
 *    构建期编译替代字符串模板（#11）；入口不存在时跳过（Stage 2 落地后自动启用）
 *
 * 设计取舍：
 * - tsc 只做类型检查（tsconfig noEmit），emit 全部由 esbuild 承担——
 *   顺带解除 tsc rootDir 限制，protocol 共享层可 runtime 直 import
 * - minify: false —— 暂不压缩，便于发布包审查
 * - sourcemap 开发期生成（out/ 与 media/ 下的 .map 文件已进 .vscodeignore，不进包）
 * - --watch 经 esbuild context API 同时监听两个 build
 */

import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// 仓库根（本文件位于 <root>/vscode/）
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const extensionEntry = path.join(repoRoot, 'vscode', 'src', 'extension.ts');
const webviewEntry = path.join(repoRoot, 'vscode', 'src', 'webview', 'main.ts');

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
	{
		entryPoints: [extensionEntry],
		bundle: true,
		format: 'cjs',
		platform: 'node',
		target: ['node16'],
		external: ['vscode'],
		minify: false,
		sourcemap: true,
		outfile: path.join(repoRoot, 'vscode', 'out', 'extension.js'),
		banner: {
			js: '// 本文件由 esbuild 从 src/extension.ts 打包生成（npm run build），请勿手改',
		},
		logLevel: 'info',
	},
];

if (fs.existsSync(webviewEntry)) {
	builds.push({
		entryPoints: [webviewEntry],
		bundle: true,
		format: 'iife',
		target: ['es2020'],
		minify: false,
		sourcemap: true,
		outfile: path.join(repoRoot, 'vscode', 'media', 'dashboard.js'),
		banner: {
			js: '// 本文件由 esbuild 从 src/webview/ 打包生成（npm run build），请勿手改',
		},
		logLevel: 'info',
	});
} else {
	console.log('[build] src/webview/main.ts 不存在，跳过 webview bundle（Stage 2 落地后自动启用）');
}

if (watch) {
	const ctxs = await Promise.all(builds.map((options) => context(options)));
	await Promise.all(ctxs.map((ctx) => ctx.watch()));
	console.log('[watch] extension/webview bundle 监听中（Ctrl+C 退出）');
} else {
	for (const options of builds) {
		// write 模式 build() 的解析/解析失败经 logLevel 打印并填入 errors（同 esbuild.browser.mjs）
		const result = await build(options);
		if (result.errors.length > 0) {
			process.exit(1);
		}
	}
}
