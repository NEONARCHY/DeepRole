import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// A frozen independent capability audit may be red while current regression
// contracts pass. Keep its exact gold and explicit exit status independently.
// Vite mergeConfig concatenates include arrays; replace it explicitly so this
// command cannot silently run the entire default regression suite as well.
export default defineConfig({ ...base, test: { ...base.test, include: ['tests/story-rp336-narrative-holdout.audit.ts'] } });
