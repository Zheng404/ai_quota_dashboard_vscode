import { ServiceSettingsDescriptor } from '../types';

export const GLM_SETTINGS: ServiceSettingsDescriptor = {
	keyPlaceholder: 'API 密钥',
	keyHint: '',
	showHelpButton: false,
	// GLM 沿用既有 endpoint 配置；未开放编辑时保存消息不含 endpoint，原子保存会保留旧值。
	endpointEditable: false,
	endpointPlaceholder: '',
};
