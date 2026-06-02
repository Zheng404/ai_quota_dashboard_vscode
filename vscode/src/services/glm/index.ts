import { ServiceDescriptor } from '../types';
import { glmProvider, glmDetailProvider, mergeGlmDetailData } from './provider';
import { getGlmTemplate } from './template';
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
	templateScript: getGlmTemplate(),
	styles: GLM_STYLES,
	settings: GLM_SETTINGS,
	statusBarRenderer: glmStatusBarRenderer,
	detailProvider: glmDetailProvider,
	mergeDetailData: mergeGlmDetailData,
	helpCommand: 'showGlmHelp',
	helpMessage: '请访问 https://open.bigmodel.cn/usercenter/apikey 获取 API Key（Bearer Token）',
};
