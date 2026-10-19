import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Explicit opt-in capability audit: preserve a first red result and its gold.
export default defineConfig({ ...base, test: { ...base.test, include: ['tests/story-rp340-long-holdout.audit.ts'] } });
