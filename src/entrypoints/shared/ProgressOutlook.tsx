import { attributeBand, attributeMeaning, attributeState } from "../../core/attributes";
import { characterCast } from "../../core/characters";
import { immersionText } from "../../core/immersion-i18n";
import { bondFor, relationshipRequirements, relationshipStage } from "../../core/relationships";
import { relationshipText } from "../../core/relationship-i18n";
import type { CharacterScene, DeepRoleSettings, Locale, SceneEntity } from "../../core/types";

/** The same locally resolved meanings that are supplied to the model. No forecasts. */
export function ProgressOutlook({ locale, entities, scene, display = "both" }: { locale: Locale; entities: SceneEntity[]; scene?: CharacterScene; display?: DeepRoleSettings["relationshipDisplay"] }) {
  const t = (key: Parameters<typeof immersionText>[1]) => immersionText(locale, key);
  const hero = entities.find(person => person.characterSheet?.protagonist);
  const people = characterCast(entities, scene).filter(person => person.characterSheet?.attributes?.length || bondFor(person, hero, scene?.states[person.id]));
  if (!people.length) return null;
  return <details className="dr-progress-outlook"><summary>{t("outlook")}</summary><p>{t("outlookHint")}</p><div className="dr-turn-feedback-body" tabIndex={0} role="region" aria-label={t("outlook")}>{people.map(person => {
    const policy = person.characterSheet?.relationships; const bond = bondFor(person, hero, scene?.states[person.id]);
    const requirements = bond ? relationshipRequirements(person, hero, bond) : null;
    const definitions = person.characterSheet?.attributes ?? []; const attributes = attributeState(definitions, scene?.states[person.id]?.attributes);
    return <article key={person.id}><strong>{person.name}</strong>{bond && <>
      <p>{display !== "numbers" && relationshipText(locale, relationshipStage(bond))}{display === "both" && " · "}{display !== "stages" && `${relationshipText(locale, "trust")} ${bond.trust} · ${relationshipText(locale, "affinity")} ${bond.affinity}`}{bond.locked && ` · ${relationshipText(locale, "locked")}`}</p>
      {policy?.stageBehavior?.[relationshipStage(bond)] && <p className="dr-outlook-meaning">{policy.stageBehavior[relationshipStage(bond)]}</p>}
      {!!policy?.milestones.length && <><h4>{t("events")}</h4><ul>{policy.milestones.map(event => <li key={event.id}><span>{bond.completed.includes(event.id) ? "✓" : "○"} {event.label}</span><small>{t(bond.completed.includes(event.id) ? "done" : "pending")} · {t(event.required !== false ? "mandatory" : "optional")}</small></li>)}</ul></>}
      {requirements && <><h4>{t("conditions")}</h4>{!requirements.adults && <p>{t("adultsMissing")}</p>}{requirements.trust > 0 && <p>{t("trustMissing")}{display !== "stages" && ` · ${bond.trust} / ${policy!.thresholds.trust}`}</p>}{requirements.affinity > 0 && <p>{t("affinityMissing")}{display !== "stages" && ` · ${bond.affinity} / ${policy!.thresholds.affinity}`}</p>}{requirements.events.length > 0 && <p>{t("eventsMissing")}: {requirements.events.map(event => event.label).join(" · ")}</p>}{requirements.adults && !requirements.trust && !requirements.affinity && !requirements.events.length && <p>{t("ready")}</p>}</>}
    </>}{!!definitions.length && <ul className="dr-outlook-attributes">{definitions.map(a => <li key={a.id}><span>{a.label} {attributes.values[a.id]} · {t(attributeBand(a, attributes.values[a.id]!))}{attributes.locked.includes(a.id) && ` · ${relationshipText(locale, "locked")}`}</span>{attributeMeaning(a, attributes.values[a.id]!) && <small>{attributeMeaning(a, attributes.values[a.id]!)}</small>}</li>)}</ul>}</article>;
  })}</div></details>;
}
