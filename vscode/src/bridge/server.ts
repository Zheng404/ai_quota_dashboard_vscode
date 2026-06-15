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

/**
 * /health 端点的探测密钥（与浏览器扩展 constants.js 中的 BRIDGE_PROBE_SECRET 对齐）。
 * 浏览器扩展访问 /health 时必须在 X-Bridge-Probe 头携带此密钥，才会返回会话 authToken。
 * 本地其它进程不知道此密钥，无法获取 authToken 来伪造凭证推送。
 * 这是纵深防御的第一层门槛；真正的会话级认证仍依赖随机生成的 authToken。
 */
const BRIDGE_PROBE_SECRET = 'aqd-bridge-probe-7f3c9e1a4b2d';

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
	/** GLM API Key */
	glmApiKey?: string;
	/** 浏览器扩展当前活跃的服务 kind 列表，用于 VSCode 端同步移除服务 */
	activeKinds?: string[];
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

	/** 预定义端口列表（与浏览器扩展对齐） */
	private readonly fallbackPorts = [37100, 37101, 37102, 37103, 37104, 37105, 37106, 37107, 37108, 37109, 37110];

	/** 启动服务器 */
	async start(preferredPort?: number): Promise<number> {
		const portsToTry = preferredPort
			? [preferredPort, ...this.fallbackPorts.filter(p => p !== preferredPort)]
			: this.fallbackPorts;

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

		this.log(`Cookie Bridge 已启动: http://127.0.0.1:${this.port}`);
		this.log(`Auth Token: ${this.authToken.substring(0, 8)}...`);
		resolve(this.port);
	}

	private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		// CORS: 仅允许浏览器扩展来源（chrome-extension:// / moz-extension://）
		const origin = req.headers.origin ?? '';
		const isBrowserExtension = origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://');
		if (isBrowserExtension) {
			res.setHeader('Access-Control-Allow-Origin', origin);
		}
		res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');

		// Preflight（仅浏览器扩展可访问）
		if (req.method === 'OPTIONS') {
			res.writeHead(isBrowserExtension ? 204 : 403);
			res.end();
			return;
		}

	// 健康检查（需校验探测密钥，不泄露给本地任意进程）
	// Chrome MV3 Service Worker fetch 可能不携带 Origin header，故不依赖 CORS 判断身份，
	// 改为校验打包进扩展的探测密钥（X-Bridge-Probe），通过后才返回会话 authToken。
	if (req.url === '/health' && req.method === 'GET') {
		const probe = req.headers['x-bridge-probe'];
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
	const rawToken = req.headers['x-auth-token'];
	const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
	if (token !== this.authToken) {
		const origin = req.headers.origin ?? '(none)';
		this.log(`认证失败: origin=${origin}, token=${token ? String(token).substring(0, 8) + '...' : '(missing)'}`);
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Unauthorized' }));
		return;
	}

		// Cookie 接收端点
		if (req.url === '/cookies' && req.method === 'POST') {
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
					const payload: CookiePayload = JSON.parse(body);

					const hasCredentials = (payload.cookies && payload.cookies.length > 0)
						|| !!payload.kimiAuthToken
						|| !!payload.mimoCookie
						|| !!payload.glmApiKey;

					if (hasCredentials) {
						this.log(`收到凭证推送 (来源: ${payload.source}, cookies=${payload.cookies?.length ?? 0}, kimi=${!!payload.kimiAuthToken}, mimo=${!!payload.mimoCookie}, glm=${!!payload.glmApiKey})`);
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

	async dispose(): Promise<void> {
		if (this.server) {
			const server = this.server;
			this.server = null;
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
		this.log('Cookie Bridge 已停止');
	}
}
