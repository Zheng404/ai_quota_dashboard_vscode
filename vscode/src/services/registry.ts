import { ServiceDescriptor, ServiceId, QuotaProvider } from './types';

export interface ServiceRegistry {
	register(descriptor: ServiceDescriptor): void;
	getDescriptor(kind: ServiceId): ServiceDescriptor;
	getAllDescriptors(): ServiceDescriptor[];
	isValidServiceId(v: unknown): v is ServiceId;
	resolveProvider(kind: ServiceId): QuotaProvider;
}

export function createRegistry(initial: ServiceDescriptor[] = []): ServiceRegistry {
	const descriptors = new Map<ServiceId, ServiceDescriptor>();

	for (const descriptor of initial) {
		if (descriptors.has(descriptor.kind)) {
			console.warn(`Duplicate service kind: ${descriptor.kind}`);
			continue;
		}
		descriptors.set(descriptor.kind, descriptor);
	}

	function getDescriptor(kind: ServiceId): ServiceDescriptor {
		const d = descriptors.get(kind);
		if (!d) { throw new Error(`Unknown service kind: ${kind}`); }
		return d;
	}

	function getAllDescriptors(): ServiceDescriptor[] {
		return Array.from(descriptors.values());
	}

	function isValidServiceId(v: unknown): v is ServiceId {
		return typeof v === 'string' && descriptors.has(v);
	}

	function resolveProvider(kind: ServiceId): QuotaProvider {
		return getDescriptor(kind).provider;
	}

	return {
		register(d: ServiceDescriptor) {
			if (descriptors.has(d.kind)) {
				console.warn(`Duplicate service kind: ${d.kind}`);
				return;
			}
			descriptors.set(d.kind, d);
		},
		getDescriptor,
		getAllDescriptors,
		isValidServiceId,
		resolveProvider,
	};
}

// ========== 兼容层：保留旧 API 供平滑迁移 ==========

import { glmDescriptor } from './glm';
import { kimiDescriptor } from './kimi';
import { mimoDescriptor } from './mimo';
import { bridgeDescriptor } from './bridge';

const _defaultRegistry = createRegistry([glmDescriptor, kimiDescriptor, mimoDescriptor, bridgeDescriptor]);

export const getDescriptor = _defaultRegistry.getDescriptor;
export const getAllDescriptors = _defaultRegistry.getAllDescriptors;
export const isValidServiceId = _defaultRegistry.isValidServiceId;
export const resolveProvider = _defaultRegistry.resolveProvider;
