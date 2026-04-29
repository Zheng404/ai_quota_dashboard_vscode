// 模板组装入口：遍历 registry 拼接所有 JS 片段

import { getAllDescriptors } from '../../services/registry';
import { getSharedScript } from './shared';
import { getSettingsScript } from './settings';

export function getScript(): string {
	const descriptors = getAllDescriptors();

	// 基础共享脚本
	let script = getSharedScript();

	// 各服务的仪表盘卡片模板
	for (const desc of descriptors) {
		script += desc.templateScript;
	}

	// 设置页脚本（数据驱动）
	script += getSettingsScript(descriptors);

	return script;
}
