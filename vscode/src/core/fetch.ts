import * as https from 'https';
import { URL } from 'url';

/** 默认请求超时 (ms) */
const DEFAULT_TIMEOUT = 30000;
/** 默认重试次数 */
const DEFAULT_RETRIES = 0;
/** 默认重试延迟基数 (ms) */
const DEFAULT_RETRY_DELAY = 1000;

export interface HttpRequestOptions {
	method: 'GET' | 'POST';
	url: string;
	headers?: Record<string, string>;
	body?: string;
	timeout?: number;
	/** 重试次数（默认 0） */
	retries?: number;
	/** 重试延迟基数 ms（默认 1000，指数退避） */
	retryDelay?: number;
	/** 请求日志回调 */
	onRequestLog?: (info: { method: string; url: string }) => void;
	/** 响应日志回调 */
	onResponseLog?: (info: { method: string; url: string; statusCode?: number; durationMs: number; error?: string }) => void;
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

/** 延迟指定毫秒 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/** 底层 HTTPS 请求封装（单发） */
function doRequest<T>(options: HttpRequestOptions): Promise<T> {
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
		req.setTimeout(options.timeout ?? DEFAULT_TIMEOUT, () => {
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
 * 底层 HTTPS 请求封装（支持重试、日志）
 * 使用 Buffer 数组累积响应，避免大响应时字符串拼接性能问题
 */
export async function httpRequest<T>(options: HttpRequestOptions): Promise<T> {
	const retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);
	const retryDelay = Math.max(0, options.retryDelay ?? DEFAULT_RETRY_DELAY);
	const startTime = Date.now();

	options.onRequestLog?.({ method: options.method, url: options.url });

	let lastError: Error | undefined;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const result = await doRequest<T>(options);
			options.onResponseLog?.({
				method: options.method,
				url: options.url,
				statusCode: (result as any)?.statusCode ?? 200,
				durationMs: Date.now() - startTime,
			});
			return result;
		} catch (err) {
			lastError = err as Error;
			const isRetryable = err instanceof Error && (
				(err as HttpError).statusCode === undefined || // 网络错误
				((err as HttpError).statusCode !== undefined && (err as HttpError).statusCode! >= 500) // 服务端错误
			);
			if (attempt < retries && isRetryable) {
				const delay = retryDelay * Math.pow(2, attempt);
				await sleep(delay);
				continue;
			}
			break;
		}
	}

	options.onResponseLog?.({
		method: options.method,
		url: options.url,
		durationMs: Date.now() - startTime,
		error: lastError?.message,
	});
	throw lastError;
}

/**
 * 轻量 HTTPS GET，返回 JSON
 */
export function getJson<T>(
	url: string,
	headers: Record<string, string> = {},
	timeout = DEFAULT_TIMEOUT,
	retries = DEFAULT_RETRIES,
	logger?: { log: (msg: string) => void },
): Promise<T> {
	return httpRequest<T>({
		method: 'GET',
		url,
		headers: { 'Accept': 'application/json', ...headers },
		timeout,
		retries,
		onRequestLog: logger ? (info) => logger.log(`[HTTP] → ${info.method} ${info.url}`) : undefined,
		onResponseLog: logger ? (info) => {
			if (info.error) {
				logger.log(`[HTTP] ✗ ${info.method} ${info.url} — ${info.error} (${info.durationMs}ms)`);
			} else {
				logger.log(`[HTTP] ← ${info.method} ${info.url} ${info.statusCode ?? '?'} (${info.durationMs}ms)`);
			}
		} : undefined,
	});
}

/**
 * 轻量 HTTPS POST，返回 JSON
 */
export function postJson<T>(
	url: string,
	headers: Record<string, string> = {},
	body?: string,
	timeout = DEFAULT_TIMEOUT,
	retries = DEFAULT_RETRIES,
	logger?: { log: (msg: string) => void },
): Promise<T> {
	return httpRequest<T>({
		method: 'POST',
		url,
		headers: { 'Accept': 'application/json', ...headers },
		body,
		timeout,
		retries,
		onRequestLog: logger ? (info) => logger.log(`[HTTP] → ${info.method} ${info.url}`) : undefined,
		onResponseLog: logger ? (info) => {
			if (info.error) {
				logger.log(`[HTTP] ✗ ${info.method} ${info.url} — ${info.error} (${info.durationMs}ms)`);
			} else {
				logger.log(`[HTTP] ← ${info.method} ${info.url} ${info.statusCode ?? '?'} (${info.durationMs}ms)`);
			}
		} : undefined,
	});
}
