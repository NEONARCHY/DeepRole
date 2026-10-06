import { turnConsequences } from "../../core/progress";
import { progressText } from "../../core/progress-i18n";
import { relationshipText } from "../../core/relationship-i18n";
import type { CharacterScene, DeepRoleSettings, Locale, SceneEntity } from "../../core/types";

export function ProgressFeedback({ locale, entities, scene, display = "both" }: { locale: Locale; entities: SceneEntity[]; scene?: CharacterScene; display?: DeepRoleSettings["relationshipDisplay"] }) {
  if (!scene?.progress) return null;
  const consequences = turnConsequences(entities, scene); const t = (key: Parameters<typeof progressText>[1]) => progressText(locale, key);
  if (!consequences.length && !scene.progress.rejected) return <details className="dr-turn-feedback"><summary>{t("unchanged")}</summary><p>{t("unchangedHint")}</p></details>;
  return <details className="dr-turn-feedback" open><summary>{t("consequences")} · {new Set(consequences.map(item => item.person.id)).size}</summary><div className="dr-turn-feedback-body">{consequences.map(item => <article key={item.person.id + item.kind}><strong>{item.person.name}</strong><div className="dr-turn-deltas">{item.changes.map(change => <span key={change.label} className={change.after < change.before ? "dr-turn-down" : "dr-turn-up"}>{item.kind === "relationship" ? relationshipText(locale, change.label as "trust" | "affinity") : change.label}{display === "stages" && item.kind === "relationship" ? (change.after > change.before ? " ↑" : " ↓") : ` ${change.after > change.before ? "+" : ""}${change.after - change.before} · ${change.after}`}</span>)}</div>{item.stages && display !== "numbers" && item.stages.before !== item.stages.after && <p>{relationshipText(locale, item.stages.before)} → {relationshipText(locale, item.stages.after)}</p>}{item.events.map(label => <p key={label}>✓ {label}</p>)}<p>{item.reason}</p><details><summary>{t("evidence")}</summary><blockquote>{item.quote}</blockquote></details></article>)}{scene.progress.rejected > 0 && <div className="dr-turn-warning"><strong>{t("rejected")}</strong><p>{t("rejectedHint")}</p></div>}</div></details>;
}
