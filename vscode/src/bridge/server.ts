// Cookie Bridge Server — 本地 HTTP 服务器
// 接收浏览器扩展推送的 Cookie，更新到 Secret Storage

import * as http from 'http';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { randomBytes } from 'crypto';

/** 最大请求体大小 (1MB) */
const MAX_BODY_SIZE = 1024 * 1024;

/** 生成带进程 PID 的端口文件路径，避免多实例冲突 */
function getPortFilePath(): string {
	return path.join(os.tmpdir(), `.ai-quota-bridge-port-${process.pid}`);
}

/** 浏览器扩展推送的 Cookie 数据 */
export interface CookiePayload {
	source: string;
	timestamp: number;
	cookies: Array<{
		service: string;
		name: string;
		value: string;
		domain: string;
	}>;
	/** Kimi kimi-auth 值 */
	kimiAuthToken?: string;
	/** MiMo 完整 Cookie 字符串 */
	mimoCookie?: string;
}

/** Cookie 接收回调 */
export type OnCookiesReceived = (payload: CookiePayload) => void;

export class CookieBridgeServer {
	private server: http.Server | null = null;
	private port = 0;
	private authToken: string;
	private onReceived: OnCookiesReceived;
	private outputChannel: vscode.OutputChannel | null = null;
	private readonly portFile: string;

	constructor(onReceived: OnCookiesReceived, outputChannel?: vscode.OutputChannel) {
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
		return new Promise((resolve, reject) => {
			this.server = http.createServer((req, res) => this.handleRequest(req, res));

			this.server.on('error', (err: NodeJS.ErrnoException) => {
				if (err.code === 'EADDRINUSE' && preferredPort) {
					// 首选端口被占用，尝试随机端口
					this.log(`端口 ${preferredPort} 被占用，使用随机端口`);
					this.server = http.createServer((req, res) => this.handleRequest(req, res));
					this.server.listen(0, '127.0.0.1', () => {
						this.onListening(resolve);
					});
				} else {
					reject(err);
				}
			});

			this.server.listen(preferredPort ?? 0, '127.0.0.1', () => {
				this.onListening(resolve);
			});
		});
	}

	private onListening(resolve: (port: number) => void): void {
		const addr = this.server?.address() as { port: number } | null;
		if (!addr) { return; }
		this.port = addr.port;

		// 写入端口文件供浏览器扩展发现（带 PID 后缀避免多实例冲突）
		try {
			fs.writeFileSync(this.portFile, String(this.port), { mode: 0o600 });
		} catch {
			this.log(`无法写入端口文件: ${this.portFile}`);
		}

		this.log(`Cookie Bridge 已启动: http://127.0.0.1:${this.port}`);
		this.log(`Auth Token: ${this.authToken.substring(0, 8)}...`);
		resolve(this.port);
	}

	private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		// CORS: 允许 chrome-extension 来源
		const origin = req.headers.origin ?? '';
		if (origin.startsWith('chrome-extension://') || origin === '') {
			res.setHeader('Access-Control-Allow-Origin', origin || '*');
		}
		res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');

		// Preflight
		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		// 健康检查（无需认证，返回 authToken 供浏览器扩展使用）
		if (req.url === '/health' && req.method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok', authToken: this.authToken }));
			return;
		}

		// 认证检查
		const token = req.headers['x-auth-token'];
		if (token !== this.authToken) {
			res.writeHead(401, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Unauthorized' }));
			return;
		}

		// Cookie 接收端点
		if (req.url === '/cookies' && req.method === 'POST') {
			let body = '';
			let bodySize = 0;
			req.on('data', (chunk: Buffer) => {
				bodySize += chunk.length;
				if (bodySize > MAX_BODY_SIZE) {
					req.destroy();
					res.writeHead(413, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Request body too large' }));
					return;
				}
				body += chunk;
			});
			req.on('end', () => {
				try {
					const payload: CookiePayload = JSON.parse(body);

					if (payload.cookies && payload.cookies.length > 0) {
						this.log(`收到 ${payload.cookies.length} 条 Cookie (来源: ${payload.source})`);
						this.onReceived(payload);
					}

					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ received: payload.cookies?.length || 0 }));
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

	dispose(): void {
		if (this.server) {
			this.server.close();
			this.server = null;
		}
		try { fs.unlinkSync(this.portFile); } catch { /* ignore */ }
		this.log('Cookie Bridge 已停止');
	}
}
