import { describe, it, expect, afterAll } from 'vitest';
import * as http from 'http';
import { httpRequest, HttpError } from './fetch';

/** 拉起一个可控行为的本地 HTTP 服务器（真实 socket，测试超时/上限语义） */
interface TestServer {
	port: number;
	close: () => Promise<void>;
}

function startServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<TestServer> {
	return new Promise((resolve, reject) => {
		const srv = http.createServer(handler);
		srv.once('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			const addr = srv.address() as { port: number };
			resolve({
				port: addr.port,
				close: () => new Promise<void>((r) => srv.close(() => r())),
			});
		});
	});
}

describe('fetch.ts 总时长上限与响应体上限', () => {
	// 每个用例独立起服务器，全部登记以便统一关闭
	const servers: TestServer[] = [];

	afterAll(async () => {
		await Promise.all(servers.map(s => s.close()));
	});

	async function useServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<TestServer> {
		const srv = await startServer(handler);
		servers.push(srv);
		return srv;
	}

	it('慢速 drip 响应（chunk 间隔 < 超时值但总时长超限）被总时长定时器中止', async () => {
		// 每 100ms 推一块，持续 2s：idle 语义下永不超时，总时长语义下 300ms 即中止
		const server = await useServer((_req, res) => {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			const timer = setInterval(() => {
				res.write('{"drip":true}');
			}, 100);
			setTimeout(() => { clearInterval(timer); res.end(); }, 2000);
			res.on('close', () => clearInterval(timer));
		});

		const start = Date.now();
		await expect(httpRequest({
			method: 'GET',
			url: `http://127.0.0.1:${server.port}/drip`,
			timeout: 300,
		})).rejects.toThrow(/请求总时长超限/);
		// 总时长上限必须真实生效：远快于服务端 2s 的完整 drip
		expect(Date.now() - start).toBeLessThan(1500);
	}, 10000);

	it('响应体累计超过 maxResponseBytes 时中止并报大小错误', async () => {
		const server = await useServer((_req, res) => {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end('x'.repeat(64 * 1024));
		});

		const err = await httpRequest({
			method: 'GET',
			url: `http://127.0.0.1:${server.port}/big`,
			maxResponseBytes: 1024,
		}).catch((e: unknown) => e as HttpError);
		expect(err).toBeInstanceOf(Error);
		expect((err as HttpError).message).toMatch(/响应体超过大小限制/);
	}, 10000);

	it('正常请求行为不变：JSON 响应解析返回', async () => {
		const server = await useServer((_req, res) => {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ ok: true }));
		});

		const result = await httpRequest<{ ok: boolean }>({
			method: 'GET',
			url: `http://127.0.0.1:${server.port}/ok`,
		});
		expect(result).toEqual({ ok: true });
	}, 10000);

	it('重试行为不变：总超时错误无 statusCode，属可重试网络错误', async () => {
		let attempts = 0;
		const server = await useServer((_req, res) => {
			attempts++;
			// 挂起不响应，触发客户端总时长超时
			res.on('close', () => {});
		});

		await expect(httpRequest({
			method: 'GET',
			url: `http://127.0.0.1:${server.port}/hang`,
			timeout: 200,
			retries: 2,
			retryDelay: 10,
		})).rejects.toThrow(/请求总时长超限/);
		expect(attempts).toBe(3); // 首次 + 2 次重试
	}, 10000);
});
