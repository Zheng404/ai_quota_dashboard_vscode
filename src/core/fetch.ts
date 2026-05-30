import * as https from 'https';
import { URL } from 'url';

export interface HttpRequestOptions {
	method: 'GET' | 'POST';
	url: string;
	headers?: Record<string, string>;
	body?: string;
	timeout?: number;
}

export interface HttpError extends Error {
	statusCode?: number;
	url?: string;
	responseBody?: string;
}

function createHttpError(
	message: string,
	statusCode?: number,
	url?: string,
	responseBody?: string,
): HttpError {
	const err = new Error(message) as HttpError;
	err.statusCode = statusCode;
	err.url = url;
	err.responseBody = responseBody;
	return err;
}

/**
 * 底层 HTTPS 请求封装
 * 使用 Buffer 数组累积响应，避免大响应时字符串拼接性能问题
 */
export function httpRequest<T>(options: HttpRequestOptions): Promise<T> {
	return new Promise((resolve, reject) => {
		const u = new URL(options.url);
		const req = https.request(
			{
				hostname: u.hostname,
				port: u.port || 443,
				path: u.pathname + u.search,
				method: options.method,
				headers: options.headers,
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on('error', (err) => reject(createHttpError(err.message, res.statusCode ?? undefined, options.url)));
				res.on('data', (chunk) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); });
				res.on('end', () => {
					const body = Buffer.concat(chunks).toString('utf-8');
					const contentType = res.headers['content-type'] ?? '';

					if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
						// 非 JSON 响应直接返回原始文本
						if (!contentType.includes('application/json')) {
							resolve(body as unknown as T);
							return;
						}
						try { resolve(JSON.parse(body)); }
						catch {
							reject(createHttpError('JSON parse error', res.statusCode, options.url, body.slice(0, 500)));
						}
					} else {
						reject(createHttpError(
							`HTTP ${res.statusCode}`,
							res.statusCode ?? undefined,
							options.url,
							body.slice(0, 500),
						));
					}
				});
			},
		);
		req.on('error', (err) => reject(createHttpError(err.message, undefined, options.url)));
		req.setTimeout(options.timeout ?? 30000, () => {
			req.destroy();
			reject(createHttpError(`请求超时: ${u.hostname}${u.pathname}`, undefined, options.url));
		});
		if (options.body) {
			req.write(options.body);
		}
		req.end();
	});
}

/**
 * 轻量 HTTPS GET，返回 JSON
 */
export function getJson<T>(url: string, headers: Record<string, string> = {}, timeout = 30000): Promise<T> {
	return httpRequest<T>({
		method: 'GET',
		url,
		headers: { 'Accept': 'application/json', ...headers },
		timeout,
	});
}

/**
 * 轻量 HTTPS POST，返回 JSON
 */
export function postJson<T>(url: string, headers: Record<string, string> = {}, body?: string, timeout = 30000): Promise<T> {
	return httpRequest<T>({
		method: 'POST',
		url,
		headers: { 'Accept': 'application/json', ...headers },
		body,
		timeout,
	});
}
