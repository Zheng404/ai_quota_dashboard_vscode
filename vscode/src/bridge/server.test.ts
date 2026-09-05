import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import { DataBridgeServer, DataPayload } from './server';
import { BRIDGE_DATA_PATH, BRIDGE_SOURCE } from '../../../browser-common/protocol/index.js';

/** 探测密钥（与 server.ts 内部常量 / 浏览器扩展 constants.js 对齐，随扩展公开发布） */
const PROBE_SECRET = 'aqd-bridge-probe-7f3c9e1a4b2d';

/** 探测一个空闲端口（先占用再释放，交给 DataBridgeServer 绑定，避免固定端口与本机运行中的扩展实例冲突） */
function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = http.createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const addr = probe.address() as { port: number };
			probe.close(() => resolve(addr.port));
		});
	});
}

interface HttpResult {
	status?: number;
	body?: string;
	err?: NodeJS.ErrnoException;
}

/** 用 node http 直连 Bridge 服务器发起请求（不 mock，走真实网络栈） */
function request(options: http.RequestOptions, body?: Buffer): Promise<HttpResult> {
	return new Promise((resolve) => {
		const req = http.request(options, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (c: Buffer) => chunks.push(c));
			res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') }));
		});
		// 服务端可能提前销毁连接（如超限请求），把网络错误作为结果返回而不是让测试崩溃
		req.on('error', (err: NodeJS.ErrnoException) => resolve({ err }));
		if (body) {
			req.write(body);
		}
		req.end();
	});
}

/** 构造直连请求参数（缺省 host/port + 可覆盖的 headers） */
function mkOpts(port: number, overrides: http.RequestOptions): http.RequestOptions {
	// agent: false —— 每次请求使用独立连接，不复用 globalAgent 的 keep-alive 池。
	// 原因：超限请求会被服务端销毁 socket，该 socket 若被客户端池复用，
	// 会导致后续请求拿到已死连接（ECONNRESET），干扰互不相关的用例。
	return { host: '127.0.0.1', port, agent: false, ...overrides };
}

describe('DataBridgeServer（真实 HTTP 直连）', () => {
	let server: DataBridgeServer;
	let port: number;
	let authToken = '';
	const received: DataPayload[] = [];

	beforeAll(async () => {
		server = new DataBridgeServer((payload) => { received.push(payload); });
		port = await server.start(await findFreePort());

		// 模拟浏览器扩展发现流程：GET /health + 正确探测密钥 → 换取会话 authToken
		const health = await request(mkOpts(port, {
			path: '/health',
			method: 'GET',
			headers: { 'X-Bridge-Probe': PROBE_SECRET },
		}));
		expect(health.status).toBe(200);
		authToken = (JSON.parse(health.body ?? '{}') as { authToken?: string }).authToken ?? '';
		expect(authToken.length).toBeGreaterThan(0);
	});

	afterAll(async () => {
		await server.dispose();
	});

	it('Host 白名单：放行 127.0.0.1 / localhost（含大写域名）', async () => {
		const viaIp = await request(mkOpts(port, {
			path: '/health',
			method: 'GET',
			headers: { Host: `127.0.0.1:${port}`, 'X-Bridge-Probe': PROBE_SECRET },
		}));
		expect(viaIp.status).toBe(200);

		const viaLocalhost = await request(mkOpts(port, {
			path: '/health',
			method: 'GET',
			headers: { Host: `LOCALHOST:${port}`, 'X-Bridge-Probe': PROBE_SECRET },
		}));
		expect(viaLocalhost.status).toBe(200);
	});

	it('Host 白名单：拦截恶意 Host（DNS rebinding 场景）→ 403', async () => {
		const evil = await request(mkOpts(port, {
			path: '/health',
			method: 'GET',
			headers: { Host: 'evil.example.com', 'X-Bridge-Probe': PROBE_SECRET },
		}));
		expect(evil.status).toBe(403);
	});

	it('Host 白名单：Host 端口不匹配 → 403', async () => {
		const mismatch = await request(mkOpts(port, {
			path: '/health',
			method: 'GET',
			headers: { Host: '127.0.0.1:49999', 'X-Bridge-Probe': PROBE_SECRET },
		}));
		expect(mismatch.status).toBe(403);
	});

	it('探测密钥错误或缺失 → 401 拒绝', async () => {
		const wrong = await request(mkOpts(port, {
			path: '/health',
			method: 'GET',
			headers: { 'X-Bridge-Probe': 'wrong-secret' },
		}));
		expect(wrong.status).toBe(401);

		const missing = await request(mkOpts(port, { path: '/health', method: 'GET' }));
		expect(missing.status).toBe(401);
	});

	it('authToken 缺失或错误 → 401 拒绝', async () => {
		const missing = await request(mkOpts(port, {
			path: BRIDGE_DATA_PATH,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
		}), Buffer.from('{}'));
		expect(missing.status).toBe(401);

		const wrong = await request(mkOpts(port, {
			path: BRIDGE_DATA_PATH,
			method: 'POST',
			headers: { 'X-Auth-Token': 'forged-token', 'Content-Type': 'application/json' },
		}), Buffer.from('{}'));
		expect(wrong.status).toBe(401);
	});

	it('/data Content-Type 非 JSON → 415', async () => {
		const res = await request(mkOpts(port, {
			path: BRIDGE_DATA_PATH,
			method: 'POST',
			headers: { 'X-Auth-Token': authToken, 'Content-Type': 'text/plain' },
		}), Buffer.from('not-json'));
		expect(res.status).toBe(415);
	});

	it('/data Content-Type 缺失 → 415', async () => {
		const res = await request(mkOpts(port, {
			path: BRIDGE_DATA_PATH,
			method: 'POST',
			headers: { 'X-Auth-Token': authToken },
		}), Buffer.from('{}'));
		expect(res.status).toBe(415);
	});

	it('/data 请求体超过 1MB 上限 → 413 或连接被服务端切断', async () => {
		// 1MB + 1KB 的 JSON 字符串字面量（Content-Type 合法，仅超限）
		const big = Buffer.alloc(1024 * 1024 + 1024, 0x61);
		const res = await request(mkOpts(port, {
			path: BRIDGE_DATA_PATH,
			method: 'POST',
			headers: { 'X-Auth-Token': authToken, 'Content-Type': 'application/json' },
		}), big);
		// 服务端写回 413 后销毁连接，客户端可能收到完整响应或连接重置，两者均视为上限生效
		expect(
			res.status === 413 || res.err?.code === 'ECONNRESET' || res.err?.code === 'EPIPE'
		).toBe(true);
		// 超限请求不应触发电机回调
		expect(received.length).toBe(0);
	});

	it('合法数据推送 → 200 且回调收到 payload', async () => {
		const payload = {
			source: BRIDGE_SOURCE,
			timestamp: Date.now(),
			data: [{ kind: 'kimi', serviceData: { slots: [{ label: '本周用量', percent: 42 }] } }],
		};
		const res = await request(mkOpts(port, {
			path: BRIDGE_DATA_PATH,
			method: 'POST',
			headers: { 'X-Auth-Token': authToken, 'Content-Type': 'application/json' },
		}), Buffer.from(JSON.stringify(payload)));
		expect(res.status).toBe(200);

		expect(received.length).toBe(1);
		expect(received[0]?.data?.[0]?.kind).toBe('kimi');
	});

	it('Y1：空 data 同步 payload（source 匹配）→ 200 且仍触发回调', async () => {
		const before = received.length;
		const payload = {
			source: BRIDGE_SOURCE,
			timestamp: Date.now(),
			data: [],
			activeKinds: [],
		};
		const res = await request(mkOpts(port, {
			path: BRIDGE_DATA_PATH,
			method: 'POST',
			headers: { 'X-Auth-Token': authToken, 'Content-Type': 'application/json' },
		}), Buffer.from(JSON.stringify(payload)));
		expect(res.status).toBe(200);
		// received 计数口径：只计 data 非空项
		expect(JSON.parse(res.body ?? '{}').received).toBe(0);
		// 空 payload 不再被 hasBridgeData 门禁拦截，消费端据 activeKinds 执行同步移除
		expect(received.length).toBe(before + 1);
		expect(received[received.length - 1]?.data).toEqual([]);
	});

	it('Y1：source 不匹配 → 400 且不触发回调', async () => {
		const before = received.length;
		const res = await request(mkOpts(port, {
			path: BRIDGE_DATA_PATH,
			method: 'POST',
			headers: { 'X-Auth-Token': authToken, 'Content-Type': 'application/json' },
		}), Buffer.from(JSON.stringify({ source: 'forged-source', timestamp: Date.now(), data: [{ kind: 'glm', serviceData: {} }] })));
		expect(res.status).toBe(400);
		expect(received.length).toBe(before);
	});
});
