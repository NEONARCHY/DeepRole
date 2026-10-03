export type Locale = "ru" | "en";
export type ActivationMode = "always" | "smart" | "manual";
export type MemoryPriority = "low" | "normal" | "high";
export type RecordKind = "book" | "entry" | "binding" | "snapshot" | "world" | "entity" | "template" | "proposal" | "change";

export interface WorldProfile {
  useDescriptionInContext?: boolean;
  mapLayout?: LoreMapLayout;
  id: string;
  name: string;
  description: string;
  color: string;
  contextBudget: number;
  relevanceThreshold: number;
  createdAt: number;
  updatedAt: number;
}

export interface LoreMapLayout {
  categoryNames?: Record<string, string>;
  positions: Record<string, { x: number; y: number }>;
  expandedIds: string[];
  customCategories: { id: string; title: string; parentId: string | null }[];
}

export interface SceneEntity {
  characterSheet?: CharacterSheet;
  useDescriptionInContext?: boolean;
  id: string;
  worldId: string;
  kind: "character" | "location" | "group";
  name: string;
  description: string;
  aliases: string[];
  memberIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CharacterSheet {
  gender: "male" | "female" | "neutral";
  protagonist: boolean;
  appearance: string;
  personality: string;
  goals: string;
  background: string;
  sprites: Record<string, string>;
}

export interface CharacterStatus {
  emotion: string;
  condition: string;
  goal: string;
  relationship: string;
  stats: { label: string; value: string }[];
}

export interface CharacterScene {
  lastReply?: string;
  partnerId?: string | null;
  revision: string;
  presentIds: string[];
  states: Record<string, CharacterStatus>;
  updatedAt: number;
}

export interface SceneState {
  worldId: string | null;
  focusIds: string[];
  bookId: string | null;
}

export interface StoryTemplate {
  id: string;
  worldId: string;
  name: string;
  opening: string;
  initialState: string;
  focusIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type RecordValue = MemoryBook | MemoryEntry | ChatBinding | HandoffSnapshot | WorldProfile | SceneEntity | StoryTemplate | MemoryProposalBatch | LoreChange;
export type DataRecord = { kind: RecordKind; id: string; data: RecordValue };

export interface MemoryBook {
  id: string;
  worldId?: string | null;
  name: string;
  description: string;
  color: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MemorySource {
  type: "manual" | "selection" | "suggestion" | "handoff" | "import";
  chatId?: string;
  quote?: string;
  originalImportance?: "always" | "called";
  originalTitle?: string;
}

export interface MemoryEntry {
  mapCategory?: string;
  links?: { targetId: string; label: string; mode: "context" | "reference" }[];
  id: string;
  worldId?: string | null;
  entityIds?: string[];
  bookId: string | null;
  title: string;
  content: string;
  keywords: string[];
  activation: ActivationMode;
  priority: MemoryPriority;
  enabled: boolean;
  source: MemorySource;
  createdAt: number;
  updatedAt: number;
}

export interface ChatBinding {
  characterScenes?: Record<string, CharacterScene>;
  memoryOverrides?: MemoryOverrides;
  id: string;
  worldId?: string | null;
  focusIds?: string[];
  chatId: string;
  bookId: string | null;
  chatUrl: string;
  messageCountAtAnalysis: number;
  createdAt: number;
  updatedAt: number;
}

export interface HandoffSnapshot {
  id: string;
  worldId?: string | null;
  focusIds?: string[];
  title: string;
  summary: string;
  sourceChatId: string;
  sourceChatUrl: string;
  bookId: string | null;
  createdAt: number;
  appliedAt?: number;
}

export interface DeepRoleSettings {
  characterSheetsEnabled?: boolean;
  characterSpritesEnabled?: boolean;
  characterEmotions?: string[];
  locale: Locale;
  onboardingComplete: boolean;
  sceneChoicesEnabled?: boolean;
  showChatContextMeter: boolean;
  showMemoryContextIndicator: boolean;
  contextBudget: number;
  relevanceThreshold: number;
  suggestionInterval: number;
  suggestionsEnabled: boolean;
  recentMessageCount: number;
  animationsEnabled: boolean;
  confirmDeletions: boolean;
}

export interface MemoryCandidate {
  issue?: "stale" | "unknown-target" | "ambiguous" | "scope";
  targetEntryId?: string;
  expectedEntry?: MemoryEntry;
  id: string;
  worldId?: string | null;
  entityIds?: string[];
  title: string;
  content: string;
  keywords: string[];
  activation: ActivationMode;
  priority: MemoryPriority;
  bookId: string | null;
  selected: boolean;
}

export interface RankedMemory {
  origin?: { kind: "entry" | "world" | "entity"; id: string };
  entry: MemoryEntry;
  score: number;
  reasons: string[];
  estimatedTokens: number;
  manuallySelected: boolean;
}

export interface ContextSelection {
  overBudgetTokens?: number;
  entries: RankedMemory[];
  estimatedTokens: number;
  omittedCount: number;
}

export interface AdapterStatus {
  compatible: boolean;
  chatId: string | null;
  reason?: string;
  checkedAt: number;
}

export interface ConversationEstimate {
  estimatedTokens: number;
  messageCount: number;
  atLeast: boolean;
  source?: "history" | "page";
}

export interface DeepSeekAdapter {
  getChatId(): string | null;
  getDraft(): string;
  getRecentMessages(limit: number): string[];
  getConversationEstimate(limit?: number): ConversationEstimate;
  setDraft(value: string): boolean;
  submitDraft(): boolean;
  getStatus(): AdapterStatus;
}

export interface BackupPayload {
  format: "deeprole-backup";
  version: 1;
  exportedAt: string;
  records: Array<{
    kind: RecordKind;
    id: string;
    data: RecordValue;
  }>;
  settings: DeepRoleSettings;
}

export interface EncryptedEnvelope {
  format: "deeprole-encrypted";
  version: 1;
  algorithm: "AES-256-GCM";
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface VaultConfig {
  enabled: boolean;
  salt?: string;
  iterations?: number;
  verifier?: EncryptedEnvelope;
}

export interface ServiceRequest {
  id: string;
  chatUrl?: string;
  worldId?: string | null;
  focusIds?: string[];
  chatId?: string;
  type: "memory-analysis" | "lore-draft" | "handoff" | "continue-handoff" | "scene-choices";
  /** Opaque identity only: do not store the scene text in session metadata. */
  sceneSignature?: string;
  brief?: string;
  baseVersions?: Record<string, string>;
  startedMessageCount?: number;
  bookId: string | null;
  createdAt: number;
}

export interface MemoryOverrides { includedIds: string[]; excludedIds: string[] }

export interface MemoryProposalBatch {
  id: string;
  worldId: string | null;
  bookId: string | null;
  chatId: string | null;
  focusIds: string[];
  requestType: "memory-analysis" | "lore-draft";
  items: MemoryCandidate[];
  createdAt: number;
  updatedAt: number;
}

export interface LoreChange {
  id: string;
  worldId: string | null;
  proposalId: string;
  entries: { before: MemoryEntry | null; after: MemoryEntry }[];
  createdAt: number;
  updatedAt: number;
  undoneAt?: number;
}
