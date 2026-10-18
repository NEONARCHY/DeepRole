import { browser } from 'wxt/browser';
import { normalizeLearning, type LearningProgress } from '../core/learning';
export const LEARNING_KEY = 'deeprole_learning_v1';
export async function readLearning() { return normalizeLearning((await browser.storage.local.get(LEARNING_KEY))[LEARNING_KEY]); }
// Separate from world data and preferences: a hint must never overwrite either.
export async function saveLearning(progress: LearningProgress) { await browser.storage.local.set({ [LEARNING_KEY]: normalizeLearning(progress) }); }
