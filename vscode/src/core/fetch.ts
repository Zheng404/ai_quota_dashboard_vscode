import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

/** 默认请求总时长上限 (ms) */
const DEFAULT_TIMEOUT = 30000;
/** 默认响应体大小上限 (5MB) */
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
/** 默认重试次数 */
const DEFAULT_RETRIES = 0;
/** 默认重试延迟基数 (ms) */
const DEFAULT_RETRY_DELAY = 1000;

export interface HttpRequestOptions {
	method: 'GET' | 'POST';
	url: string;
	headers?: Record<string, string>;
	body?: string;
	/** 请求总时长上限 ms（默认 30000）：慢速 drip 响应（chunk 间隔短但总时长超限）也会被中止 */
	timeout?: number;
	/** 响应体大小上限字节（默认 5MB），超出即中止请求，防异常大响应撑爆内存 */
	maxResponseBytes?: number;
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

/** doRequest 的返回结构：result 为解析后的响应体，statusCode 为真实 HTTP 响应状态码 */
interface DoRequestResult<T> {
	result: T;
	statusCode: number | undefined;
}

/** 底层 HTTP(S) 请求封装（单发，根据 URL scheme 自动选择协议） */
function doRequest<T>(options: HttpRequestOptions): Promise<DoRequestResult<T>> {
	return new Promise((resolve, reject) => {
		const u = new URL(options.url);
		const isSecure = u.protocol === 'https:';
		const requestFn = isSecure ? https.request : http.request;
		const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT;
		const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
		// 统一结算闸门：超时/错误/正常结束都经 finish() 保证只结算一次并清理总时长定时器。
		// totalTimer 在 finish 之后以 const 声明：所有回调均为异步触发，执行到声明行后才会被调用，无 TDZ 风险
		let settled = false;
		const finish = (fn: () => void): void => {
			if (settled) { return; }
			settled = true;
			clearTimeout(totalTimer);
			fn();
		};
		const req = requestFn(
			{
				hostname: u.hostname,
				port: u.port || (isSecure ? 443 : 80),
				path: u.pathname + u.search,
				method: options.method,
				headers: options.headers,
			},
			(res) => {
				const chunks: Buffer[] = [];
				let receivedBytes = 0;
				res.on('error', (err) => finish(() => reject(createHttpError(err.message, res.statusCode ?? undefined, options.url))));
				res.on('data', (chunk) => {
					// 响应体累计超限：中止连接，避免异常大响应撑爆内存
					receivedBytes += (chunk as Buffer).length;
					if (receivedBytes > maxBytes) {
						finish(() => {
							req.destroy();
							reject(createHttpError(`响应体超过大小限制(${maxBytes}B): ${u.hostname}${u.pathname}`, undefined, options.url));
						});
						return;
					}
					if (Buffer.isBuffer(chunk) || typeof chunk === 'string') {
						chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf-8'));
					} else if (chunk instanceof Uint8Array) {
						chunks.push(Buffer.from(chunk));
					}
					// Ignore other types to avoid silent data corruption
				});
			res.on('end', () => finish(() => {
				const body = Buffer.concat(chunks).toString('utf-8');
				const contentType = res.headers['content-type'] ?? '';

				if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
					// 非 JSON 响应直接返回原始文本
					if (!contentType.includes('application/json')) {
						resolve({ result: body as unknown as T, statusCode: res.statusCode });
						return;
					}
					try { resolve({ result: JSON.parse(body) as T, statusCode: res.statusCode }); }
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
			}));
			},
		);
		req.on('error', (err) => finish(() => reject(createHttpError(err.message, undefined, options.url))));
		// 总时长上限：与 idle 超时的区别在于慢速 drip 响应（chunk 间隔 < 超时值）
		// 也会被中止，避免 doPullAll 串行循环被单请求长期卡住
		const totalTimer = setTimeout(() => {
			finish(() => {
				req.destroy();
				reject(createHttpError(`请求总时长超限(>${timeoutMs}ms): ${u.hostname}${u.pathname}`, undefined, options.url));
			});
		}, timeoutMs);
		if (options.body) {
			req.write(options.body);
		}
		req.end();
	});
}

/**
 * 底层 HTTP(S) 请求封装（支持重试、日志，根据 URL scheme 自动选择协议）
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
			const { result, statusCode } = await doRequest<T>(options);
			options.onResponseLog?.({
				method: options.method,
				url: options.url,
				statusCode,
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
 * 轻量 HTTP(S) GET，返回 JSON
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
 * 轻量 HTTP(S) POST，返回 JSON
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
