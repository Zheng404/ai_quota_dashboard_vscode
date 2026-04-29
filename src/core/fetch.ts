import * as https from 'https';
import { URL } from 'url';

export interface HttpRequestOptions {
	method: 'GET' | 'POST';
	url: string;
	headers?: Record<string, string>;
	body?: string;
	timeout?: number;
}

/**
 * 底层 HTTPS 请求封装
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
				let body = '';
				res.on('error', reject);
				res.on('data', (c) => { body += c; });
				res.on('end', () => {
					if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
						try { resolve(JSON.parse(body)); }
						catch { reject(new Error('JSON parse error')); }
					} else {
						reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 500)}`));
					}
				});
			}
		);
		req.on('error', reject);
		req.setTimeout(options.timeout ?? 30000, () => {
			req.destroy();
			reject(new Error(`请求超时: ${u.hostname}${u.pathname}`));
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
