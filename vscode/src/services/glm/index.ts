import { ServiceDescriptor } from '../types';
import { glmProvider, glmDetailProvider, mergeGlmDetailData } from './provider';
import { GLM_STYLES } from './styles';
import { GLM_SETTINGS } from './settings';
import { glmStatusBarRenderer } from './statusBar';

export const glmDescriptor: ServiceDescriptor = {
	kind: 'glm',
	displayName: 'GLM Coding Plan (CN)',
	defaultName: 'GLM',
	badgeLabel: 'GLM',
	badgeCssClass: 'badge-glm',
	provider: glmProvider,
	// 卡片模板已迁 src/webview/cards/glm.ts（构建期打包进 media/dashboard.js）
	styles: GLM_STYLES,
	settings: GLM_SETTINGS,
	statusBarRenderer: glmStatusBarRenderer,
	detailProvider: glmDetailProvider,
	mergeDetailData: mergeGlmDetailData,
	helpCommand: 'showGlmHelp',
	helpMessage: '请访问 https://open.bigmodel.cn/usercenter/apikey 获取 API Key（Bearer Token）',
};
