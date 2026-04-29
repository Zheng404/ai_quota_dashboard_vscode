import { ServiceDescriptor, ServiceId, QuotaProvider } from './types';

const descriptors = new Map<ServiceId, ServiceDescriptor>();

function register(descriptor: ServiceDescriptor): void {
	if (descriptors.has(descriptor.kind)) {
		throw new Error(`Duplicate service kind: ${descriptor.kind}`);
	}
	descriptors.set(descriptor.kind, descriptor);
}

// 注册所有已知服务（新增服务只需在此添加一行 import + register）
import { glmDescriptor } from './glm';
import { kimiDescriptor } from './kimi';
register(glmDescriptor);
register(kimiDescriptor);

/** 获取服务描述符，未知 kind 会抛异常 */
export function getDescriptor(kind: ServiceId): ServiceDescriptor {
	const d = descriptors.get(kind);
	if (!d) { throw new Error(`Unknown service kind: ${kind}`); }
	return d;
}

/** 获取所有已注册的服务描述符 */
export function getAllDescriptors(): ServiceDescriptor[] {
	return Array.from(descriptors.values());
}

/** 校验字符串是否为已知的服务类型 */
export function isValidServiceId(v: unknown): v is ServiceId {
	return typeof v === 'string' && descriptors.has(v);
}

/** 按 kind 获取 QuotaProvider */
export function resolveProvider(kind: ServiceId): QuotaProvider {
	return getDescriptor(kind).provider;
}
