import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
// 协议单一可信源（浏览器端 JS 模块，vitest 直接 import；tsc 经 index.d.ts 解析类型）
import {
	BRIDGE_PORTS,
	BRIDGE_PORT_START,
	BRIDGE_PORT_END,
	BRIDGE_PROBE_HEADER,
	BRIDGE_PROBE_SECRET,
	BRIDGE_AUTH_HEADER,
	BRIDGE_SOURCE,
	BRIDGE_HEALTH_PATH,
	BRIDGE_DATA_PATH,
	RELAY_DEBOUNCE_MS,
	RELAY_MIN_INTERVAL_MS,
	MAX_PENDING_PAYLOADS,
	MAX_RETRY_ATTEMPTS,
	RETRY_DELAY_MS,
	TIMEOUTS,
	MSG,
	MSG_ACTIONS,
	createDataPayload,
	hasBridgeData,
} from '../../../browser-common/protocol/index.js';

// 注：原「VSCode 运行时镜像常量」段已随 esbuild 管线落地删除——
// server.ts/extension.ts 现 runtime 直 import 本模块（单一可信源），无镜像可守卫。

// ===== createDataPayload 契约 =====

describe('protocol 契约：createDataPayload', () => {
	it('全数据字段：source/timestamp/data 透传，activeKinds 集合展开为数组', () => {
		const data = [{ kind: 'kimi', serviceData: { slots: [] } }];
		const payload = createDataPayload({
			timestamp: 1714000000000,
			data,
			activeKinds: new Set(['kimi', 'mimo']),
			displayNames: { kimi: '我的 Kimi' },
		});

		expect(payload.source).toBe(BRIDGE_SOURCE);
		expect(payload.timestamp).toBe(1714000000000);
		expect(payload.data).toBe(data);
		expect(payload.activeKinds).toEqual(['kimi', 'mimo']);
		expect(payload.displayNames).toEqual({ kimi: '我的 Kimi' });
	});

	it('空入参：各字段兜底为空值，timestamp 自动填充', () => {
		const before = Date.now();
		const payload = createDataPayload({});
		const after = Date.now();

		expect(payload.source).toBe(BRIDGE_SOURCE);
		expect(payload.data).toEqual([]);
		expect(payload.activeKinds).toEqual([]);
		expect(payload.displayNames).toEqual({});
		expect(payload.timestamp).toBeGreaterThanOrEqual(before);
		expect(payload.timestamp).toBeLessThanOrEqual(after);
	});

	it('displayNames 浅拷贝：修改源对象不影响已构造的 payload', () => {
		const names: Record<string, string> = { glm: 'GLM' };
		const payload = createDataPayload({ displayNames: names });
		names.glm = 'changed';
		expect(payload.displayNames).toEqual({ glm: 'GLM' });
	});
});

// ===== hasBridgeData 契约 =====

describe('protocol 契约：hasBridgeData', () => {
	it('null / undefined → false', () => {
		expect(hasBridgeData(undefined)).toBe(false);
		expect(hasBridgeData(null)).toBe(false);
	});

	it('data 缺失或为空数组 → false', () => {
		expect(hasBridgeData({})).toBe(false);
		expect(hasBridgeData({ data: [] })).toBe(false);
	});

	it('data 非空 → true', () => {
		expect(hasBridgeData({
			data: [{ kind: 'mimo', serviceData: { slots: [] } }],
		})).toBe(true);
	});

	it('data 非数组 → false', () => {
		expect(hasBridgeData({ data: 'kimi' })).toBe(false);
		expect(hasBridgeData({ data: { kind: 'kimi' } })).toBe(false);
	});
});

// ===== 消息 action 名集合完整性 =====

describe('protocol 契约：消息 action 名集合', () => {
	it('MSG 覆盖双端实际收发的全部 action 且值唯一', () => {
		expect(Object.keys(MSG).sort()).toEqual([
			'BRIDGE_CONNECTED',
			'CHECK_CREDENTIALS',
			'CONFIG_UPDATED',
			'COOKIE_CHANGED',
			'GET_KIMI_TOKEN',
			'GET_STATUS',
			'KIMI_TOKEN_INVALID',
			'KIMI_TOKEN_UPDATED',
			'QUERY_KIMI_TOKEN',
			'RECONNECT_BRIDGE',
			'RELAY_NOW',
		]);
		expect(new Set(MSG_ACTIONS).size).toBe(Object.keys(MSG).length);
	});

	it('MSG_ACTIONS 与 Object.values(MSG) 完全一致', () => {
		expect([...MSG_ACTIONS]).toEqual(Object.values(MSG));
	});

	it('关键 action 值锁定（改名即破坏双端兼容，必须显式同步）', () => {
		expect(MSG.RELAY_NOW).toBe('relayNow');
		expect(MSG.RECONNECT_BRIDGE).toBe('reconnectBridge');
		expect(MSG.GET_STATUS).toBe('getStatus');
		expect(MSG.CONFIG_UPDATED).toBe('configUpdated');
		expect(MSG.CHECK_CREDENTIALS).toBe('checkCredentials');
		expect(MSG.COOKIE_CHANGED).toBe('cookieChanged');
		expect(MSG.BRIDGE_CONNECTED).toBe('bridgeConnected');
		expect(MSG.KIMI_TOKEN_UPDATED).toBe('kimiTokenUpdated');
		expect(MSG.GET_KIMI_TOKEN).toBe('getKimiToken');
		expect(MSG.KIMI_TOKEN_INVALID).toBe('kimiTokenInvalid');
		expect(MSG.QUERY_KIMI_TOKEN).toBe('queryKimiToken');
	});
});

// ===== 基线值锁定（protocol 单一可信源的直接断言，替代原镜像等价段）=====

describe('基线值锁定：protocol 常量值', () => {
	it('端口列表与范围', () => {
		expect(BRIDGE_PORT_START).toBe(37100);
		expect(BRIDGE_PORT_END).toBe(37110);
		expect(BRIDGE_PORTS).toHaveLength(11);
		expect(BRIDGE_PORTS[0]).toBe(37100);
		expect(BRIDGE_PORTS[BRIDGE_PORTS.length - 1]).toBe(37110);
	});

	it('请求头名 / 探测密钥 / source 标识 / 端点路径', () => {
		expect(BRIDGE_PROBE_HEADER).toBe('X-Bridge-Probe');
		expect(BRIDGE_PROBE_SECRET).toBe('aqd-bridge-probe-7f3c9e1a4b2d');
		expect(BRIDGE_AUTH_HEADER).toBe('X-Auth-Token');
		expect(BRIDGE_SOURCE).toBe('ai-quota-data-bridge');
		expect(BRIDGE_HEALTH_PATH).toBe('/health');
		expect(BRIDGE_DATA_PATH).toBe('/data');
	});

	it('relay / 重试 / 超时阈值符合现状基线（值保持现状不变）', () => {
		expect(RELAY_DEBOUNCE_MS).toBe(1500);
		expect(RELAY_MIN_INTERVAL_MS).toBe(10_000);
		expect(MAX_PENDING_PAYLOADS).toBe(50);
		expect(MAX_RETRY_ATTEMPTS).toBe(3);
		expect(RETRY_DELAY_MS).toBe(3000);
		expect(TIMEOUTS).toEqual({
			healthProbe: 2000,
			push: 5000,
			apiProbe: 5000,
			credentialProbe: 8000,
			tokenQuery: 2000,
			tabLoad: 15_000,
			tabSettle: 3000,
		});
	});
});

// ===== 漂移守卫：双端源码不得出现裸协议字面量 =====

/** 从 cwd 向上查找仓库根（含 browser-common/protocol 的目录） */
function findRepoRoot(): string {
	let dir = process.cwd();
	for (;;) {
		if (fs.existsSync(path.join(dir, 'browser-common', 'protocol', 'index.js'))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			throw new Error('未找到仓库根（browser-common/protocol）');
		}
		dir = parent;
	}
}

const REPO_ROOT = findRepoRoot();

/** 递归收集目录下指定扩展名的文件（跳过命中跳过规则的路径） */
function collectFiles(rootDir: string, exts: readonly string[], isSkipped: (absPath: string) => boolean): string[] {
	const files: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (isSkipped(full)) {
				continue;
			}
			if (entry.isDirectory()) {
				walk(full);
			} else if (exts.includes(path.extname(entry.name))) {
				files.push(full);
			}
		}
	};
	walk(rootDir);
	return files;
}

/** 裸端口字面量（如 37100；端口起点必须经常量引用） */
const PORT_LITERAL_PATTERN = /\b37100\b/;

/** 生成 action 名的带引号字面量匹配（'relayNow' / "relayNow" 等） */
function actionLiteralPattern(action: string): RegExp {
	return new RegExp(`['"]${action}['"]`);
}

interface Violation {
	file: string;
	rule: string;
}

/** 扫描一组文件，返回命中的裸协议字面量违规 */
function scanFiles(files: string[]): Violation[] {
	const violations: Violation[] = [];
	for (const file of files) {
		const content = fs.readFileSync(file, 'utf-8');
		if (PORT_LITERAL_PATTERN.test(content)) {
			violations.push({ file, rule: '裸端口字面量 37100（须引用 BRIDGE_PORT_START / BRIDGE_PORTS）' });
		}
		if (content.includes(BRIDGE_PROBE_SECRET)) {
			violations.push({ file, rule: '裸探测密钥（须引用 BRIDGE_PROBE_SECRET）' });
		}
		if (content.includes(`'${BRIDGE_DATA_PATH}'`) || content.includes(`"${BRIDGE_DATA_PATH}"`)) {
			violations.push({ file, rule: `裸端点路径字面量 '${BRIDGE_DATA_PATH}'（须引用 BRIDGE_DATA_PATH）` });
		}
		for (const action of MSG_ACTIONS) {
			if (actionLiteralPattern(action).test(content)) {
				violations.push({ file, rule: `裸 action 字面量 '${action}'（须引用 MSG.*）` });
			}
		}
	}
	return violations;
}

describe('漂移守卫：协议字面量必须经常量引用', () => {
	it('vscode/src：白名单（*.test.ts）外无裸字面量', () => {
		const vscodeSrc = path.join(REPO_ROOT, 'vscode', 'src');
		const files = collectFiles(vscodeSrc, ['.ts'], (absPath) =>
			absPath.endsWith('.test.ts'));
		expect(files.length).toBeGreaterThan(0);

		const violations = scanFiles(files);
		expect(violations, `发现协议字面量漂移:\n${violations.map(v => `${v.file}: ${v.rule}`).join('\n')}`).toEqual([]);
	});

	it('browser-common：白名单（protocol/ 自身、kimi-content.js、*.test.js）外无裸字面量', () => {
		const browserCommon = path.join(REPO_ROOT, 'browser-common');
		const protocolDir = path.join(browserCommon, 'protocol');
		const kimiContent = path.join(browserCommon, 'scripts', 'kimi-content.js');
		const files = collectFiles(browserCommon, ['.js'], (absPath) =>
			absPath === protocolDir
			|| absPath.startsWith(protocolDir + path.sep)
			|| absPath === kimiContent
			|| absPath.endsWith('.test.js'));
		expect(files.length).toBeGreaterThan(0);

		const violations = scanFiles(files);
		expect(violations, `发现协议字面量漂移:\n${violations.map(v => `${v.file}: ${v.rule}`).join('\n')}`).toEqual([]);
	});
});
