/**
 * 浏览器扩展共享常量
 *
 * 本文件兼容 ES module（popup.js / dashboard.js）和经典脚本（background.js Service Worker）：
 * - ES module：`import { BRIDGE_PROBE_SECRET } from '../constants.js'`
 * - 经典脚本：直接使用全局变量 `BRIDGE_PROBE_SECRET`
 *
 * BRIDGE_PROBE_SECRET：用于访问 VSCode Bridge /health 端点的探测密钥。
 * VSCode 端在 server.ts 中保存同一常量，/health 请求需携带此密钥才会返回会话 authToken。
 * 这是一道门槛：本地其它进程不知道此密钥，无法获取真正的 authToken 来伪造推送。
 *
 * 注意：此密钥打包在扩展中，理论上可被逆向提取。它是纵深防御的第一层门槛，
 * 真正的会话级认证仍依赖 VSCode 启动时随机生成的 authToken。
 */
const BRIDGE_PROBE_SECRET = 'aqd-bridge-probe-7f3c9e1a4b2d';

// 兼容经典脚本：暴露到全局（background.js Service Worker 无 import/export）
if (typeof self !== 'undefined') {
  self.BRIDGE_PROBE_SECRET = BRIDGE_PROBE_SECRET;
}

// 兼容 ES module：命名导出（popup.js / dashboard.js）
if (typeof exports !== 'undefined') {
  exports.BRIDGE_PROBE_SECRET = BRIDGE_PROBE_SECRET;
}
