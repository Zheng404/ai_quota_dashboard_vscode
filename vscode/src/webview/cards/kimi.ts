// Kimi Membership 仪表盘卡片；头部、配额与刷新交互使用共享渲染器

import type { KimiServiceData } from '../../services/kimi/types';
import { escapeHtml, registerServiceTemplate, renderQuotaSection, renderServiceHeader, renderStaleNotice } from '../shared';

export function registerKimiCard(): void {
	registerServiceTemplate<KimiServiceData>('kimi', function renderCard(data) {
		const id = escapeHtml(data.id);
		const level = data.level?.trim();
		const badgeHtml = level ? '<span class="service-badge badge-kimi">会员 · ' + escapeHtml(level) + '</span>' : '';
		const membershipNote = level ? '' : '<p class="kimi-membership-note">会员等级暂不可用，配额不受影响</p>';
		return '<article class="service-card kimi-card" id="kimi-card-' + id + '" data-service-card="' + id + '" aria-labelledby="service-title-' + id + '">' +
			renderServiceHeader(data, { serviceLabel: 'Kimi Membership', badgeHtml }) +
			renderStaleNotice(data) +
			renderQuotaSection(data) + membershipNote +
			'</article>';
	});
}
