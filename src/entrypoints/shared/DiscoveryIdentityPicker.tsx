import { useEffect, useId, useState } from "react";
import type { Locale } from "../../core/types";
import type { IdentityOptions, IdentitySelection } from "../../core/story-character-identity";
import { characterDiscoveryText } from "../../core/character-discovery-i18n";
import "./discovery-identity.css";

export function DiscoveryIdentityPicker({ locale, options, disabled, onLookup, onLink }: { locale: Locale; options?: IdentityOptions; disabled: boolean; onLookup: (query: string, offset: number) => void; onLink: (selection: IdentitySelection) => void }) {
 const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [selected, setSelected] = useState<string | null>(null), id = useId();
 const t = (key: Parameters<typeof characterDiscoveryText>[1]) => characterDiscoveryText(locale, key);
 const optionRevision = options?.people.map(p => p.id + ":" + p.updatedAt).join("|");
 useEffect(() => { setSelected(null); }, [options?.query, options?.offset, optionRevision]);
 const person = options?.people.find(p => p.id === selected);
 return <div className="dr-story-review-preview dr-discovery-identity">
  <button type="button" className="button secondary" disabled={disabled} aria-expanded={open} onClick={() => { setOpen(v => !v); if (!open) onLookup(query, 0); }}>{t("identityOpen")}</button>
  {open && <><p className="setting-copy">{t("identityHint")}</p>
   <label htmlFor={`${id}-query`}>{t("identitySearch")}</label>
   <form className="dr-story-review-actions" onSubmit={e => { e.preventDefault(); if (!disabled) onLookup(query, 0); }}><input id={`${id}-query`} maxLength={80} value={query} disabled={disabled} onChange={e => { setQuery(e.target.value); setSelected(null); }} /><button type="submit" className="button secondary" disabled={disabled}>{t("identityFind")}</button></form>
   {options && <><p className="setting-copy">{t("identityRange").replace("{from}", String(options.people.length ? options.offset + 1 : 0)).replace("{to}", String(options.offset + options.people.length)).replace("{total}", String(options.total))}</p>
    <fieldset className="dr-identity-options"><legend>{t("identityChoose")}</legend>{!options.people.length && <p>{t("identityEmpty")}</p>}{options.people.map(p => <label key={p.id} className="dr-identity-option"><input type="radio" name={`${id}-person`} checked={selected === p.id} disabled={disabled} onChange={() => setSelected(p.id)} /><span><strong>{p.name}</strong>{" "}<small>{p.summary || t("identityNoDescription")}</small></span></label>)}</fieldset>
    <div className="dr-story-review-actions">{options.offset > 0 && <button type="button" className="button secondary" disabled={disabled} onClick={() => onLookup(options.query, Math.max(0, options.offset - 40))}>{t("prev")}</button>}{options.next !== null && <button type="button" className="button secondary" disabled={disabled} onClick={() => onLookup(options.query, options.next!)}>{t("next")}</button>}</div>
   </>}
   <p className="setting-copy">{t("identityConfirmHint")}</p><button type="button" className="button" disabled={disabled || !person} onClick={() => { if (person) onLink({ entityId: person.id, updatedAt: person.updatedAt }); }}>{t("identityConfirm")}{person ? ` · ${person.name}` : ""}</button>
  </>}
 </div>;
}
