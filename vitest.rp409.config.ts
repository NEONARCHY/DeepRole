import { defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({...base,test:{...base.test,include:['tests/story-rp409.audit.ts']}});
