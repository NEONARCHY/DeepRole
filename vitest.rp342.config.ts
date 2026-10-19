import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Opt-in independent audit, never merged with the normal test include.
export default defineConfig({ ...base, test: { ...base.test, include: ['tests/story-rp342-free-holdout.audit.ts'] } });
