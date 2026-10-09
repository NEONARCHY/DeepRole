export type Locale = "ru" | "en";
export type ActivationMode = "always" | "smart" | "manual";
export type MemoryPriority = "low" | "normal" | "high";
export type RecordKind = "book" | "entry" | "binding" | "snapshot" | "world" | "entity" | "template" | "proposal" | "change" | "illustration" | "cast";

export interface WorldProfile {
  /** User opted into one preparation when this world first has lore. */
  autoPrepareCharacters?: boolean;
  relationshipsEnabled?: boolean;
  characterEmotions?: string[];
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
  /** Starting narrative facts extracted from approved lore; no chat progress. */
  initialStatus?: CharacterStatus;
  imageGeneration?: import("./image-generation").CharacterImagePrompt;
  /** Local photo collections. Only their names and context rules reach the model. */
  selfieCategories?: SelfieCategory[];
  /** Access to generated selfies; existing collections keep their own rules. */
  selfieAccess?: { minTrust: number; minAffinity: number };
  /** Player-edited world-wide exclusions. New world emotions are allowed by default. */
  blockedEmotions?: string[];
  attributes?: CharacterAttribute[];
  relationships?: RelationshipProfile;
  gender: "male" | "female" | "neutral";
  protagonist: boolean;
  appearance: string;
  personality: string;
  goals: string;
  background: string;
  /** A string is the legacy single portrait; arrays are emotion variations. */
  sprites: Record<string, string | string[]>;
  /** Unassigned local images. Assigned images are reused from sprites. */
  portraitLibrary?: string[];
}

export interface SelfieCategory {
  default?: boolean;
  id: string;
  name: string;
  description: string;
  minTrust: number;
  minAffinity: number;
  images: string[];
}
export interface SelfieGeneration {
  request?: import("./image-plan").ImageReplay;
  reference?: "neutral" | "suggestive";
  scene: string;
  appearance?: string;
  status: "queued" | "working" | "ready" | "failed";
  updatedAt: number;
  illustrationId?: string;
  error?: string;
  ticketId?: string;
}
export interface ScenePhoto {
  generation?: SelfieGeneration;
  worldId: string;
  entityId: string;
  messageKey: string;
  turnKey: string;
  categoryId: string;
  imageKey: string;
  createdAt: number;
}

export interface CharacterStatus {
  attributes?: AttributeState;
  /** This character's attitude to each protagonist, scoped to the current chat. */
  bonds?: Record<string, RelationshipState>;
  emotion: string;
  condition: string;
  goal: string;
  relationship: string;
  stats: { label: string; value: string }[];
}

export interface CharacterScene {
  progress?: { status: "changed" | "unchanged" | "partial"; rejected: number; turn?: string };
  relationshipNotice?: "unverified" | "limited";
  /** Local display state, never sent to the model. */
  portraitCycles?: Record<string, Record<string, PortraitCycle>>;
  lastReply?: string;
  partnerId?: string | null;
  partnerIds?: string[];
  revision: string;
  presentIds: string[];
  states: Record<string, CharacterStatus>;
  updatedAt: number;
}

export interface PortraitCycle { key: string; order: number[]; cursor: number }

/** UI-only. Never included in model context or character revisions. */
export interface PortraitPose { x: number; y: number; width: number; space?: "viewport"; dock?: "left" | "right"; /** Explicit resize overrides automatic grouping, not the rest of the cast. */ manualSize?: boolean }
export interface PortraitLayout { resetAt: number; positions: Record<string, PortraitPose> }

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

export type RecordValue = MemoryBook | MemoryEntry | ChatBinding | HandoffSnapshot | WorldProfile | SceneEntity | StoryTemplate | MemoryProposalBatch | LoreChange | import("./image-generation").Illustration | import("./cast-initialization").CastJob;
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
  illustrationAttempts?: import("./image-plan").ImageAttempt[];
  /** Local references to photos attached to specific native replies. */
  scenePhotos?: ScenePhoto[];
  /** Local visible fragments of assistant replies replaced by DeepSeek's refusal. */
  recoveredReplies?: RecoveredReply[];
  /** Checkpoint that started this branch, not a mutable link to another chat. */
  continuationSnapshotId?: string;
  portraitLayouts?: Record<string, PortraitLayout>;
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

export interface RecoveredReply {
  /** Acknowledged delivery with a subsequent user request; not a rewritten server turn. */
  contextSentAt?: number;
  messageKey: string;
  html: string;
  capturedAt: number;
  recoveredAt: number;
}

export interface HandoffSnapshot {
  continuation?: StoryContinuation;
  memoryOverrides?: MemoryOverrides;
  /** Local structured state; the model's recap never controls these values. */
  characterScene?: CharacterScene;
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
  /** Long edge for future uploaded portraits; never rewrites stored images. */
  portraitMaxEdge?: number;
  /** Preferred library tile size; narrow layouts still fit their container. */
  portraitPreviewSize?: number;
  /** Presentation only; never changes DeepSeek's reasoning mode or requests. */
  showDeepSeekReasoning?: boolean;
  replyRecoveryEnabled?: boolean;
  contextWarningsEnabled?: boolean;
  /** User-adjustable estimate, not a guaranteed DeepSeek server limit. */
  chatContextCapacity?: number;
  relationshipsEnabled?: boolean;
  relationshipDisplay?: "both" | "numbers" | "stages";
  portraitLayoutResetAt?: number;
  characterSheetsEnabled?: boolean;
  characterSpritesEnabled?: boolean;
  characterEmotions?: string[];
  locale: Locale;
  onboardingComplete: boolean;
  sceneChoicesEnabled?: boolean;
  pinSceneChoices?: boolean;
  /** Legacy backup fields: the interface now reads/writes both sides together. */
  pinPortraitLeft?: boolean;
  pinPortraitRight?: boolean;
  adaptiveLayout?: boolean;
  /** Shared preferred HUD width; viewport adaptation never changes this preference. */
  floatingPanelWidth?: number;
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

export interface RelationshipProfile {
  initialCompleted?: string[];
  /** Optional player-authored behavior; no inferred personality or automatic rewards. */
  stageBehavior?: Partial<Record<RelationshipStage, string>>;
  /** Player-authored reactions; never a universal reward formula. */
  reactions?: string;
  enabled: boolean;
  initial: { trust: number; affinity: number };
  pace: "slow" | "balanced" | "open";
  romance: boolean;
  thresholds: { trust: number; affinity: number };
  boundaries: string;
  /** Legacy events are required. Explicit false makes a standalone achievement. */
  milestones: { id: string; label: string; required?: boolean }[];
}
export type RelationshipStage = "guarded" | "acquaintance" | "trusting" | "close";
export interface RelationshipState {
  trust: number;
  affinity: number;
  locked: boolean;
  completed: string[];
  history: RelationshipChange[];
}
export interface RelationshipChange {
  turn?: string;
  at: number;
  source: "scene" | "manual";
  before: { trust: number; affinity: number };
  after: { trust: number; affinity: number };
  reason: string;
  quote: string;
  milestones: string[];
}
export interface RelationshipPatch {
  id: string;
  hero: string;
  /** Signed changes, not absolute scores. */
  trust: number;
  affinity: number;
  reason: string;
  quote: string;
  milestones?: string[];
}

export interface CharacterAttribute {
  /** Inclusive boundaries; omitted legacy values use 30 and 70. */
  lowAt?: number;
  highAt?: number;
  id: string;
  label: string;
  initial: number;
  low: string;
  high: string;
  cap: number;
}
export interface AttributeChange {
  turn?: string;
  at: number;
  source: "scene" | "manual";
  before: Record<string, number>;
  after: Record<string, number>;
  reason: string;
  quote: string;
}
export interface AttributeState {
  values: Record<string, number>;
  locked: string[];
  history: AttributeChange[];
}
export interface AttributePatch {
  id: string;
  changes: { key: string; delta: number }[];
  reason: string;
  quote: string;
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

export interface StoryTurn { role: "user" | "assistant"; text: string }
export interface StoryContinuation {
  version: 1;
  turns: StoryTurn[];
  source: "history" | "page";
  partial: boolean;
  omittedTurns: number;
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
  characterText?: import("./character-text").CharacterTextRequest;
  characterTextLimit?: number;
  imagePlan?: boolean;
  imageAttemptId?: string;
  imageMessageKey?: string;
  continuationId?: string;
  /** Observed native reply key, never an inferred id or model-provided selector. */
  replyIdentity?: string;
  /** Last assistant key before submitting; prevents a virtualized old reply from being accepted. */
  priorReplyIdentity?: string;
  id: string;
  chatUrl?: string;
  worldId?: string | null;
  focusIds?: string[];
  chatId?: string;
  type: "memory-analysis" | "lore-draft" | "handoff" | "continue-handoff" | "scene-choices" | "character-text";
  /** Opaque identity only: do not store the scene text in session metadata. */
  sceneSignature?: string;
  brief?: string;
  /** Explicit user-selected character for a reviewed, permanent fact correction. */
  targetEntityId?: string;
  baseEntityVersion?: string;
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
  /** Full-world snapshot for targeted corrections; approval fails if it changed. */
  scanVersions?: Record<string, string>;
  profileChange?: {
    entityId: string;
    name: string;
    beforeDescription: string;
    beforeAppearance: string;
    beforePersonality: string;
    beforeGoals: string;
    beforeBackground: string;
    beforeUpdatedAt: number;
    hadCharacterSheet: boolean;
    afterDescription: string;
    afterAppearance: string;
    afterPersonality: string;
    afterGoals: string;
    afterBackground: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface LoreChange {
  id: string;
  worldId: string | null;
  proposalId: string;
  entries: { before: MemoryEntry | null; after: MemoryEntry }[];
  profileChange?: {
    entityId: string;
    beforeDescription: string;
    beforeAppearance: string;
    beforePersonality: string;
    beforeGoals: string;
    beforeBackground: string;
    beforeUpdatedAt: number;
    hadCharacterSheet: boolean;
    afterDescription: string;
    afterAppearance: string;
    afterPersonality: string;
    afterGoals: string;
    afterBackground: string;
    afterUpdatedAt: number;
  };
  createdAt: number;
  updatedAt: number;
  undoneAt?: number;
}
