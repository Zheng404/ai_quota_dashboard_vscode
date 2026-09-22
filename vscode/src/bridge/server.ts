// Data Bridge Server — 本地 HTTP 服务器
// 接收浏览器扩展推送的配额数据，转交扩展内部分发与展示
//
// ===== 威胁模型（诚实声明）=====
// 本服务器的防御目标是：阻止恶意网页及其他浏览器扩展伪造请求（CSRF / 跨源访问）。
// 防御手段：Host 头校验（防 DNS rebinding）、探测密钥（X-Bridge-Probe）、
// 会话级随机 authToken、以及浏览器扩展来源的 CORS 限制。
// 本服务器【不防御本地恶意进程】：探测密钥随扩展公开发布，任何本地进程都可以
// 访问 /health 获取 authToken，进而伪造数据推送。若需防御本地进程，需要引入
// 系统级隔离机制（如 per-extension 密钥协商），这超出了本扩展的设计范围。

import * as http from 'http';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
// 协议常量/校验/类型直接消费单一可信源 browser-common/protocol/
// （esbuild bundle 内联 JS 实现；tsc 经同目录 index.d.ts 做类型检查；
// 契约与漂移守卫见 protocol.test.ts）
import {
	BRIDGE_PORTS,
	BRIDGE_PROBE_HEADER,
	BRIDGE_PROBE_SECRET,
	BRIDGE_AUTH_HEADER,
	BRIDGE_HEALTH_PATH,
	BRIDGE_DATA_PATH,
	BRIDGE_SOURCE,
} from '../../../browser-common/protocol/index.js';
import type { DataPayload } from '../../../browser-common/protocol/index.js';

/** 最大请求体大小 (1MB) */
const MAX_BODY_SIZE = 1024 * 1024;

/** 生成带进程 PID 的端口文件路径，避免多实例冲突 */
function getPortFilePath(): string {
	return path.join(os.tmpdir(), `.ai-quota-bridge-port-${process.pid}`);
}


// re-export：extension.ts / 测试经本模块引用协议类型
export type { DataPayload };

/** 配额数据接收回调 */
export type OnDataReceived = (payload: DataPayload) => void;

export class DataBridgeServer {
	private server: http.Server | null = null;
	private port = 0;
	private authToken: string;
	private onReceived: OnDataReceived;
	private outputChannel: vscode.OutputChannel | null = null;
	private readonly portFile: string;

	constructor(onReceived: OnDataReceived, outputChannel?: vscode.OutputChannel) {
		this.authToken = this.generateToken();
		this.onReceived = onReceived;
		this.outputChannel = outputChannel ?? null;
		this.portFile = getPortFilePath();
	}

	private log(msg: string): void {
		this.outputChannel?.appendLine(`[Bridge] ${msg}`);
	}

	private generateToken(): string {
		return randomBytes(32).toString('hex');
	}

	/** 启动服务器 */
	async start(preferredPort?: number): Promise<number> {
		const portsToTry = preferredPort
			? [preferredPort, ...BRIDGE_PORTS.filter(p => p !== preferredPort)]
			: BRIDGE_PORTS;

		for (let i = 0; i < portsToTry.length; i++) {
			const port = portsToTry[i];
			try {
				const actualPort = await this.tryListen(port);
				return actualPort;
			} catch (err: unknown) {
				const errnoErr = err as NodeJS.ErrnoException;
				if (errnoErr.code === 'EADDRINUSE') {
					this.log(`端口 ${port} 被占用，尝试下一个...`);
					continue;
				}
				throw err;
			}
		}
		throw new Error(`所有预定义端口均被占用: ${portsToTry.join(', ')}`);
	}

	private async tryListen(port: number): Promise<number> {
		return new Promise((resolve, reject) => {
			const server = http.createServer((req, res) => this.handleRequest(req, res));

			server.on('error', (err: NodeJS.ErrnoException) => {
				reject(err);
			});

			server.listen(port, '127.0.0.1', () => {
				this.server = server;
				this.onListening(resolve, reject);
			});
		});
	}

	private onListening(resolve: (port: number) => void, reject: (err: Error) => void): void {
		const addr = this.server?.address() as { port: number } | null;
		if (!addr) {
			reject(new Error('Server address is null after listening'));
			return;
		}
		this.port = addr.port;

		// 写入 PID 端口文件供调试和进程管理（不再写通用端口文件，避免多实例冲突）
		try {
			fs.writeFileSync(this.portFile, String(this.port), { mode: 0o600 });
		} catch {
			this.log(`无法写入端口文件: ${this.portFile}`);
		}

		this.log(`Data Bridge 已启动: http://127.0.0.1:${this.port}`);
		this.log(`Auth Token: ${this.authToken.substring(0, 8)}...`);
		resolve(this.port);
	}

	private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		// Host 头校验（防 DNS rebinding）：恶意网页可将自有域名解析到 127.0.0.1 后发起请求，
		// 但其 Host 头为攻击者域名而非本机地址，会被此校验拦截。
		// 仅放行 127.0.0.1:<port> 或 localhost:<port>（域名部分不区分大小写）。
		const host = (req.headers.host ?? '').toLowerCase();
		if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) {
			this.log(`Host 头校验失败: host=${host || '(missing)'}`);
			res.writeHead(403, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Forbidden' }));
			return;
		}

		// CORS: 仅允许浏览器扩展来源（chrome-extension:// / moz-extension://）
		const origin = req.headers.origin ?? '';
		const isBrowserExtension = origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://');
		if (isBrowserExtension) {
			res.setHeader('Access-Control-Allow-Origin', origin);
		}
		res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
		// 允许头包含 X-Bridge-Probe：当前扩展靠 host_permissions 绕过预检，若未来收紧权限，
		// /health 探测请求的预检仍能通过（零成本保险）
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, X-Bridge-Probe');

		// Preflight（仅浏览器扩展可访问）
		if (req.method === 'OPTIONS') {
			res.writeHead(isBrowserExtension ? 204 : 403);
			res.end();
			return;
		}

		// 健康检查（需校验探测密钥，不泄露给本地任意进程）
		// Chrome MV3 Service Worker fetch 可能不携带 Origin header，故不依赖 CORS 判断身份，
		// 改为校验打包进扩展的探测密钥（X-Bridge-Probe），通过后才返回会话 authToken。
		if (req.url === BRIDGE_HEALTH_PATH && req.method === 'GET') {
			const probeHeader = BRIDGE_PROBE_HEADER.toLowerCase();
			const rawProbe = req.headers[probeHeader];
			const probe = Array.isArray(rawProbe) ? rawProbe[0] : rawProbe;
			if (probe !== BRIDGE_PROBE_SECRET) {
				this.log(`/health 探测密钥校验失败: origin=${req.headers.origin ?? '(none)'}`);
				res.writeHead(401, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Unauthorized' }));
				return;
			}
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok', port: this.port, authToken: this.authToken }));
			return;
		}

		// 认证检查
		const rawToken = req.headers[BRIDGE_AUTH_HEADER.toLowerCase()];
		const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
		if (token !== this.authToken) {
			const origin = req.headers.origin ?? '(none)';
			this.log(`认证失败: origin=${origin}, token=${token ? String(token).substring(0, 8) + '...' : '(missing)'}`);
			res.writeHead(401, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Unauthorized' }));
			return;
		}

		// 配额数据接收端点
		if (req.url === BRIDGE_DATA_PATH && req.method === 'POST') {
			// Content-Type 校验：仅接受 JSON 请求体（容忍 "; charset=" 后缀，值不区分大小写）
			const rawContentType = req.headers['content-type'];
			const contentType = (Array.isArray(rawContentType) ? rawContentType[0] : rawContentType ?? '').toLowerCase();
			if (!contentType.startsWith('application/json')) {
				this.log(`Content-Type 校验失败: ${contentType || '(missing)'}`);
				res.writeHead(415, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Unsupported Media Type' }));
				return;
			}

			const chunks: Buffer[] = [];
			let bodySize = 0;
			let destroyed = false;
			req.on('data', (chunk: Buffer) => {
				bodySize += chunk.length;
				if (bodySize > MAX_BODY_SIZE) {
					res.writeHead(413, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Request body too large' }));
					req.destroy();
					destroyed = true;
					return;
				}
				chunks.push(chunk);
			});
			req.on('error', (err) => {
				this.log(`请求错误: ${err.message}`);
				if (!destroyed && !res.writableEnded) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Bad request' }));
				}
			});
		req.on('end', () => {
			if (destroyed) { return; }
			try {
				const body = Buffer.concat(chunks).toString('utf-8');
				const payload: DataPayload = JSON.parse(body);

				// source 校验：仅接受本扩展来源标识的 payload（契约钉死 BRIDGE_SOURCE）
				if (!payload || payload.source !== BRIDGE_SOURCE) {
					this.log(`推送 source 校验失败: ${payload?.source ?? '(missing)'}`);
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Invalid payload source' }));
					return;
				}

				// 不再以 hasBridgeData 门禁拦截：空 data（如浏览器端空同步）也触发回调，
				// 由消费端执行「清空 receivedKinds + 按 activeKinds 同步移除」语义
				const kinds = (Array.isArray(payload.data) ? payload.data : []).map(d => d?.kind).filter(Boolean);
				this.log(`收到数据推送 (来源: ${payload.source}, kinds=${kinds.join(',') || '(none)'})`);
				this.onReceived(payload);

				// received 计数口径：只计 data 中 kind/serviceData 齐全的条目
				const receivedCount = (Array.isArray(payload.data) ? payload.data : [])
					.filter(d => !!d && typeof d === 'object' && typeof d.kind === 'string' && !!d.serviceData).length;
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ received: receivedCount }));
			} catch {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Invalid JSON' }));
			}
		});
			return;
		}

		// 未知路径
		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Not found' }));
	}

	getPort(): number { return this.port; }

	async dispose(): Promise<void> {
		if (this.server) {
			const server = this.server;
			this.server = null;
			// 主动断开所有已建立的 keep-alive 空闲连接：server.close() 只停止接受新连接，
			// close 回调需等 Node 默认 keepAliveTimeout（5s）才能触发，会拖慢 deactivate。
			// closeAllConnections 为 Node >=18.2 API，18.0/18.1 用可选链兜底
			server.closeAllConnections?.();
			await new Promise<void>((resolve) => {
				server.close((err) => {
					if (err) {
						this.log(`关闭服务器出错: ${err.message}`);
					}
					resolve();
				});
			});
		}
		try { fs.unlinkSync(this.portFile); } catch { /* ignore */ }
		this.log('Data Bridge 已停止');
	}
}
