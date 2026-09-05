/**
 * Data Bridge 协议共享层 — 唯一入口
 *
 * 浏览器扩展（popup/dashboard/background/api）一律从本入口 import；
 * VSCode 端类型经 index.d.ts type-only 导入，运行时常量由
 * `vscode/src/bridge/constants.ts` 镜像（契约测试守卫逐值等价）。
 */

export * from './constants.js';
export * from './bridge.js';
export * from './messages.js';
