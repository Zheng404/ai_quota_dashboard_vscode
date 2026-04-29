import { describe, it, expect } from 'vitest';
import { KIMI_DEFAULT_ENDPOINT } from './provider';

describe('KIMI_DEFAULT_ENDPOINT', () => {
	it('is the correct production URL', () => {
		expect(KIMI_DEFAULT_ENDPOINT).toBe('https://www.kimi.com');
	});
});
