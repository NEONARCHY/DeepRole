import type { AdapterStatus, ContextSelection, MemoryCandidate, MemoryOverrides, ServiceRequest, SceneState } from "./types";
import type { RepositoryRequest } from "../storage/content-repository";
import type { ServiceActivity } from "./memory-experience";
import type { CharacterRequestReceipt } from "./characters";

import type { ContinuationFlow } from "./continuation-flow";

export interface TabSessionState {
  characterTextTurns?: { requestId: string; chatId: string; replyIdentity: string }[];
  continuation?: ContinuationFlow | null;
  characterRequest?: CharacterRequestReceipt | null;
  service?: ServiceRequest | null;
  snapshotId?: string | null;
  snapshotToken?: string | null;
  continueOnFreshChat?: boolean;
  continueUntil?: number | null;
  contextWarning?: { chatId: string; capacity: number; level: number } | null;
  contextWarnings?: { chatId: string; capacity: number; level: number }[];
  overrides?: MemoryOverrides;
}
export type TabSessionGuard = Partial<TabSessionState> & { continuationKey?: string | null; serviceId?: string | null; characterRequestId?: string | null };

export type DeepRoleMessage = import("../adapters/cast-coordinator").CastMessage
  | { type: "DR_RESUME_WORLD_GAME"; chatId: string; worldId: string }
  | ({ type: "DR_STORY_IDENTITIES" } & import("./story-identity-management").IdentityAction)
  | ({ type: "DR_STORY_MERGE" } & import("./story-character-merge").MergeAction)
  | ({ type: "DR_STORY_PROFILE" } & import("./profile-supplements").SupplementAction)
  | import("../adapters/isolated-field-coordinator").FieldMessage
  | import("./image-messages").ImageMessage
  | { type: "DR_PING" }
  | RepositoryRequest
  | { type: "DR_MIGRATE_LEGACY" }
  | { type: "DR_GET_PAGE_STATE" }
  | { type: "DR_STORY_DIAGNOSTICS" }
  | { type: "DR_STORY_GAME"; operation: "start" | "restart" | "reset" | "restore" | "sync" | "undo" | "out-of-character"; manual: "stop" | "keep"; scope?: { chatId: string; worldId: string } }
  | { type: "DR_AUTOMATION_READ"; input: import("./story-automation-review").AutomationReviewRead }
  | { type: "DR_AUTOMATION_RESOLVE"; input: import("./story-automation-review").AutomationReviewDecision }
  | { type: "DR_STORY_FACT"; input: import("../storage/story-facts").StoryFactApproval }
  | { type: "DR_STORY_REPAIR"; input: import("../storage/story-repair").StoryRepairInput; cancel?: boolean }
  | ({ type: "DR_CHARACTER_DISCOVERY" } & import("./story-character-discovery").CharacterDiscoveryAction)
  | { type: "DR_STORY_CHECKPOINT_READ" }
  | { type: "DR_STORY_REVIEW_READ"; cursor: import("./story-review").StoryReviewCursor | null }
  | { type: "DR_STORY_REVIEW_PREVIEW"; input: import("./story-review").StoryPreviewInput }
  | { type: "DR_STORY_CHECKPOINT_SAVE"; choice: import("./story-checkpoint").StoryCheckpointChoice }
  | { type: "DR_PAGE_STATE"; chatId: string | null; chatUrl: string; messageCount: number; status: AdapterStatus; scene?: SceneState; selection?: ContextSelection; overrides?: MemoryOverrides; activity?: ServiceActivity | null; generating?: boolean; warning?: string; pendingHandoff?: string }
  | { type: "DR_MEMORY_OVERRIDE"; id: string; action: "include" | "exclude" | "reset" }
  | { type: "DR_REVIEW_MEMORY"; operation: "apply"; batchId: string; items: MemoryCandidate[]; profileChoice?: { description: string; appearance: string; personality: string; goals: string; background: string } }
  | { type: "DR_REVIEW_MEMORY"; operation: "discard" | "undo"; id: string }
  | { type: "DR_SET_SCENE"; scene: SceneState }
  | { type: "DR_GET_DRAFT_SCENE" }
  | { type: "DR_SAVE_DRAFT_SCENE"; scene: SceneState }
  | { type: "DR_GET_TAB_STATE" }
  | { type: "DR_SAVE_TAB_STATE"; state: TabSessionState; expected?: TabSessionGuard }
  | { type: "DR_APPLY_TEMPLATE"; templateId: string }
  | { type: "DR_RUN_SERVICE"; request: ServiceRequest }
  | { type: "DR_APPLY_SNAPSHOT"; snapshotId: string }
  | { type: "DR_CONTINUE_STORY" }
  | { type: "DR_DATA_CHANGED" }
  | { type: "DR_CONTEXT_CHANGED"; selection?: ContextSelection }
  | { type: "DR_ADAPTER_WARNING"; context: string }
  | { type: "DR_PENDING_SUGGESTIONS"; items: MemoryCandidate[] }
  | { type: "DR_SERVICE_RESULT"; outcome: "no-changes" }
  | { type: "DR_OPEN_PANEL" }
  | { type: "DR_SAVE_SELECTION"; text: string };

export const PENDING_SUGGESTIONS_KEY = "deeprole_pending_suggestions";
export const PENDING_SERVICE_KEY = "deeprole_pending_service";
export const PENDING_SNAPSHOT_KEY = "deeprole_pending_snapshot";
export const CONTEXT_INDICATOR_POSITION_KEY = "deeprole_context_indicator_position";
