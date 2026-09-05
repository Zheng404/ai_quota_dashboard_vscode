/**
 * 浏览器扩展 background 打包配置（esbuild）
 *
 * 将 browser-common/scripts/background.js（瘦入口 + lib/ 子模块 + protocol/）
 * 打包为 IIFE 单文件，输出到 build/staging/{chrome,firefox}/scripts/background.js，
 * 由 build.sh 在 rsync 共享代码之后调用（覆盖 staging 内的 ESM 源码副本）。
 *
 * 设计取舍：
 * - format: 'iife' — Service Worker 单文件加载，lib/ 与 protocol/ 全部内联，不进发布包
 * - target: 'es2020' — 保守目标（可选链/空值合并均已原生支持），不做语法降级
 * - minify: false — 暂不压缩，便于发布包审查（后续可按需开启）
 * - 开发态零影响 — 源码树 browser-common 仍为 ESM 直载（manifest type:module），
 *   本脚本只写 build/staging，不回写源码
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 仓库根（本文件位于 <root>/vscode/）
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPoint = path.join(repoRoot, 'browser-common', 'scripts', 'background.js');
const stagingRoot = path.join(repoRoot, 'build', 'staging');

const platforms = ['chrome', 'firefox'];

for (const platform of platforms) {
	// esbuild 的 write 模式 build() 出现解析/解析失败等错误时经 logLevel 打印并填入 errors
	const result = await build({
		entryPoints: [entryPoint],
		bundle: true,
		format: 'iife',
		target: ['es2020'],
		minify: false,
		sourcemap: false,
		outfile: path.join(stagingRoot, platform, 'scripts', 'background.js'),
		banner: {
			js: '// 本文件由 esbuild 从 browser-common/scripts/background.js 打包生成（npm run build:browser / build.sh），请勿手改',
		},
		logLevel: 'info',
		metafile: false,
	});
	if (result.errors.length > 0) {
		// logLevel: info 已打印错误详情，此处仅以非零退出码通知调用方（build.sh 的 set -e）
		process.exit(1);
	}
}
