import { useEffect, useId, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Upload, X } from "lucide-react";
import { formatRecordCount, menuText } from "../../core/menu-i18n";
import { uiText } from "../../core/ui-i18n";
import { experienceText } from "../../core/experience-i18n";
import { characterDescription, characterText } from "../../core/characters";
import { BOOK_COLORS } from "../../core/defaults";
import { createId } from "../../core/id";
import { sceneText, type SceneKey } from "../../core/scene-i18n";
import { buildLoreImport, parseLoreImport, type LoreImport } from "../../core/lore-import";
import type { DataRecord, Locale, MemoryBook, MemoryEntry, SceneEntity, SceneState, StoryTemplate, WorldProfile } from "../../core/types";
import { repository } from "../../storage/repository";
import { saveEditorRecord } from "../../storage/editing";
import { changeMapActivations, changeMapCategory, changeMapLink, confirmMapPerson, placeMapEntry, removeMapBranch, saveMapLayout } from "../../storage/lore-map";
import { assignBookWorld, cloneWorldPackage, duplicateEntity, exportWorld, parseWorldPackage, removeEntity, removeWorld, type WorldPackage } from "../../storage/worlds";
import { HelpButton } from "../shared/Help";
import { LoreMap } from "./LoreMap";
import { MapWorkspace } from "./MapWorkspace";
import { LoreImportPreview } from "./LoreImportPreview";
import "./lore-import.css";
import { SceneControls } from "../shared/SceneControls";
import type { LoreNode } from "../../core/lore-map";
import type { ContextSelection, MemoryOverrides, ActivationMode } from "../../core/types";

type T = (key: SceneKey, vars?: Record<string, string | number>) => string;
export function WorldsView(props: { locale: Locale; worlds: WorldProfile[]; entities: SceneEntity[]; templates: StoryTemplate[]; books: MemoryBook[]; entries: MemoryEntry[]; selectedWorld: string | null; activeWorldId: string | null; scene: SceneState; onScene: (scene: SceneState) => Promise<boolean>; connected: boolean; memoryList: ReactNode; onUseWorld: (id: string | null) => Promise<boolean>; onWorld: (id: string | null) => void; onChanged: () => Promise<void>; onTemplate: (id: string) => Promise<void>; onEntry: (entry: MemoryEntry | "new") => void; onBook: (book: MemoryBook) => void; confirmDeletions: boolean; selection?: ContextSelection; overrides?: MemoryOverrides; onMemoryUse?: (id: string, action: "include" | "exclude" | "reset") => Promise<void>; openMapWorldId?: string | null; onMapOpened?: () => void }) {
  const t: T = (key, vars) => sceneText(props.locale, key, vars);
  const mt = (key: Parameters<typeof menuText>[1]) => menuText(props.locale, key);
  const x = (key: Parameters<typeof experienceText>[1]) => experienceText(props.locale, key);
  const [editor, setEditor] = useState<{ kind: "world" | "entity" | "template"; id?: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [importer, setImporter] = useState(false);
  const [view, setView] = useState<"map" | "list" | "manage">("map");
  const [mapOpen, setMapOpen] = useState(false);
  const [createWorldInMap, setCreateWorldInMap] = useState(false);
  const [sceneBusy, setSceneBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function downloadWhenUnlocked(pack: WorldPackage) {
    if (mounted.current && !await repository.isLocked() && mounted.current) downloadWorld(pack);
  }
  const world = props.worlds.find((w) => w.id === props.selectedWorld);
  const worldConnected = Boolean(world && props.connected && props.activeWorldId === world.id);
  useEffect(() => {
    if (!world || props.openMapWorldId !== world.id) return;
    setView("map"); setCreateWorldInMap(false); setMapOpen(true); props.onMapOpened?.();
  }, [props.openMapWorldId, world?.id]);
  const entities = props.entities.filter((e) => e.worldId === world?.id);
  const entries = props.entries.filter((e) => e.bookId ? props.books.find((b) => b.id === e.bookId)?.worldId === world?.id : e.worldId === world?.id);
  function editNode(node: LoreNode, worldId = world?.id) {
    setMapOpen(false); setCreateWorldInMap(false);
    if (worldId) props.onWorld(worldId);
    if (node.kind === "entry") { const entry = props.entries.find((entry) => entry.id === node.recordId); if (entry) props.onEntry(entry); }
    else if (node.kind === "book") { const book = props.books.find((book) => book.id === node.recordId); if (book) props.onBook(book); }
    else { setView("manage"); setEditor({ kind: node.kind === "world" ? "world" : node.kind === "template" ? "template" : "entity", id: node.recordId }); }
  }
  async function act(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await task(); await props.onChanged(); setEditor(null); setMessage(t("done")); }
    catch (error) { setMessage(t(error instanceof Error && error.message === "memory-conflict" ? "editorConflict" : "failed")); }
    finally { setBusy(false); }
  }
  const saveWorld = (value: WorldProfile, expected: WorldProfile | null) => act(async () => { await repository.putIfUnchanged("world", value, expected); props.onWorld(value.id); });
  const saveEntity = (value: SceneEntity, linked: string[], expected: SceneEntity | null, baseEntries: MemoryEntry[]) => act(async () => {
    const affected = baseEntries.filter((e) => Boolean(e.entityIds?.includes(value.id)) !== linked.includes(e.id));
    await repository.commitChecked([{ kind: "entity", id: value.id, data: value }, ...affected.map((e) => ({ kind: "entry" as const, id: e.id, data: { ...e, entityIds: [...(e.entityIds ?? []).filter((id) => id !== value.id), ...(linked.includes(e.id) ? [value.id] : [])], updatedAt: Date.now() } }))], [], [{ kind: "entity", id: value.id, data: expected }, ...baseEntries.map((entry) => ({ kind: "entry" as const, id: entry.id, data: entry }))]);
  });
  function startNewWorld() {
    setView("map"); setImporter(false); setEditor(null); setMessage(""); setCreateWorldInMap(true); setMapOpen(true);
  }
  function closeMap() { setMapOpen(false); setCreateWorldInMap(false); }
  return <div className="view-stack worlds-view" aria-busy={busy}>
    <div className="view-title"><div><small>DeepRole</small><h1>{mt("lore")}</h1></div></div>
    <p className="dr-view-subtitle">{world ? x("mapHint") : x("startHint")}</p>
    <div className={props.worlds.length ? "button-row" : "dr-start-choices"}><button aria-label={x("create")} className={props.worlds.length ? "button secondary small" : "dr-start-choice"} onClick={startNewWorld}><strong>{x("create")}</strong>{!props.worlds.length && <small>{x("newHint")}</small>}</button><button aria-label={x("import")} className={props.worlds.length ? "button secondary small" : "dr-start-choice"} onClick={() => { setMessage(""); setImporter(true); }}><strong>{x("import")}</strong>{!props.worlds.length && <small>{x("importHint")}</small>}</button></div>
    {message && <p className="rp-status" role="status">{message}</p>}
    <WorldLibraryPicker label={t("worldLibrary")} worlds={props.worlds} selectedId={props.selectedWorld} unassigned={t("unassigned")} createLabel={x("createNewWorld")} onSelect={(id) => { props.onWorld(id); setEditor(null); }} onCreate={startNewWorld} />
    {importer && <BdsImport locale={props.locale} worlds={props.worlds} canAttach={props.connected} onClose={() => setImporter(false)} onDone={async (id, attach) => { props.onWorld(id); await props.onChanged(); const connected = !attach || await props.onUseWorld(id); setImporter(false); setMessage(connected ? t("importSuccess") : mt("savedNotAttached")); }} />}
    {editor?.kind === "world" && <WorldEditor key={editor.id ?? "new-world"} world={props.worlds.find((w) => w.id === editor.id)} t={t} busy={busy} onSave={saveWorld} onCancel={() => setEditor(null)} />}
    {world && <section className={worldConnected ? "lore-connection is-attached" : "lore-connection"} aria-label={mt("useWorld")}>
      <strong>{worldConnected ? mt("attached") : mt("libraryOnly")}</strong>
      <p>{x(worldConnected ? "connectedHint" : "libraryHint")}</p>
      {!worldConnected && <button className="button primary small" disabled={!props.connected || busy} onClick={() => { setBusy(true); void props.onUseWorld(world.id).finally(() => setBusy(false)); }}>{mt("useWorld")}</button>}
      {!props.connected && <p>{mt("noSite")}</p>}
    </section>}
    <div className="rp-view-switch" role="group" aria-label={mt("lore")}>
      <button aria-pressed={view === "map"} onClick={() => setView("map")}>{t("worldMap")}</button>
      <button aria-pressed={view === "list"} onClick={() => setView("list")}>{mt("list")}</button>
      {world && <button aria-pressed={view === "manage"} onClick={() => setView("manage")}>{mt("worldOptions")}</button>}
    </div>
    {view === "list" && props.memoryList}
    {view === "map" && world && <section className="rp-card lm-launch-card"><span className="lm-preview-orb" aria-hidden="true">✧</span><h2>{world.name}</h2><p className="rp-hint">{mt("available")}: {formatRecordCount(props.locale, entries.length)}</p><button className="button primary" onClick={() => setMapOpen(true)}>{t("mapOpen")}</button><button className="button secondary small" onClick={() => props.onEntry("new")}>{t("addMemory")}</button></section>}
    {view === "map" && !world && props.memoryList}
    {(world || createWorldInMap) && <>
      {mapOpen && <MapWorkspace key={createWorldInMap ? "create-new-world" : "selected-world"} locale={props.locale} worlds={props.worlds} initialWorldId={createWorldInMap ? null : world?.id ?? null} startInCreate={createWorldInMap} activeWorldId={props.connected ? props.activeWorldId : null} onSelect={props.onWorld} onClose={closeMap} onCreate={async (draft) => {
        const now = Date.now(); const created: WorldProfile = { id: createId("world"), ...draft, contextBudget: 2000, relevanceThreshold: 6, mapLayout: { positions: {}, expandedIds: [], customCategories: [] }, createdAt: now, updatedAt: now };
        await repository.putIfUnchanged("world", created, null); await props.onChanged(); return created;
      }} render={(world, pane) => <LoreMap embedded activePane={pane.active} onRegister={pane.onRegister} locale={props.locale} world={world} books={props.books.filter((b) => b.worldId === world.id)} entries={props.entries.filter((e) => e.bookId ? props.books.find((b) => b.id === e.bookId)?.worldId === world.id : e.worldId === world.id)} entities={props.entities.filter((e) => e.worldId === world.id)} templates={props.templates.filter((v) => v.worldId === world.id)} selection={props.activeWorldId === world.id ? props.selection : undefined} overrides={props.activeWorldId === world.id ? props.overrides : undefined} onMemoryUse={props.connected && props.activeWorldId === world.id ? props.onMemoryUse : undefined} onActivation={async (entry, activation: ActivationMode, history) => { await changeMapActivations(world.id, [entry], activation, repository, history); await props.onChanged(); }} onBranchActivation={async (entries, activation, history, branchId) => { await changeMapActivations(world.id, entries, activation, repository, history, branchId); await props.onChanged(); }} confirmDeletions={props.confirmDeletions} onClose={pane.onClose} onEdit={(node) => pane.onExit(() => editNode(node, world.id))}
        sceneControls={props.connected && props.scene.worldId === world.id ? <fieldset className="lm-scene-controls" disabled={sceneBusy}><SceneControls worldLocked compact overlay locale={props.locale} worlds={props.worlds} entities={props.entities} books={props.books} scene={props.scene} onChange={async (next) => { setSceneBusy(true); try { return await props.onScene(next); } finally { setSceneBusy(false); } }} /></fieldset> : undefined}
        connectedToChat={props.connected && props.activeWorldId === world.id} canConnect={props.connected && !sceneBusy} onConnect={async () => { setSceneBusy(true); try { return await props.onUseWorld(world.id); } finally { setSceneBusy(false); } }}
        onHistoryChanged={props.onChanged}
        onSaveEntry={async (entry, expected) => { await saveEditorRecord("entry", entry, expected); await props.onChanged(); }}
        onDeleteBranch={async (id, history) => { const layout = await removeMapBranch(world.id, id, repository, history); await props.onChanged(); return layout; }}
        onLayout={async (layout, history) => { await saveMapLayout(world.id, layout, repository, history); await props.onChanged(); }}
        onCategory={async (id, category, history, layout) => { if (layout && category) await placeMapEntry(world.id, id, category, layout, repository, history); else await changeMapCategory(world.id, id, category, repository, history); await props.onChanged(); }}
        onLink={async (from, to, link, history) => { await changeMapLink(world.id, from, to, link, repository, history); await props.onChanged(); }}
        onPerson={async (name, token, ids) => { const id = await confirmMapPerson(world.id, name, token, ids); await props.onChanged(); return id; }} />} />}
      {world && view === "manage" && <>
      <section className="rp-card"><header><h2>{world.name}</h2></header><div className="button-row">
        <HelpButton className="button secondary small" onClick={() => setEditor({ kind: "world", id: world.id })}>{t("edit")}</HelpButton>
        </div><details><summary>{uiText(props.locale, "worldTools")}</summary><div className="button-row"><HelpButton className="button secondary small" disabled={busy} onClick={() => void act(async () => { const copy = cloneWorldPackage(await exportWorld(world.id), t("copyName", { name: world.name })); await repository.mergeRecords(copy); props.onWorld(copy.find((r) => r.kind === "world")!.id); })}>{t("duplicate")}</HelpButton>
        <HelpButton className="button secondary small" disabled={busy} onClick={() => void act(async () => downloadWhenUnlocked(await exportWorld(world.id)))}>{t("export")}</HelpButton>
        <HelpButton className="button secondary small danger" disabled={busy} onClick={() => { if (window.confirm(t("deleteWorld"))) void act(async () => { await removeWorld(world.id); props.onWorld(null); }); }}>{t("delete")}</HelpButton>
      </div><p className="rp-hint">{t("importHint")}</p></details></section>
      <section className="rp-card"><header><h2>{t("books")}</h2></header>
        <p className="rp-hint">{uiText(props.locale, "booksHint")}</p>
        {props.books.filter((b) => b.worldId === world.id).map((book) => <label className="rp-check" key={book.id}><input type="checkbox" checked={book.active} disabled={busy} onChange={() => void act(() => repository.putIfUnchanged("book", { ...book, active: !book.active, updatedAt: Date.now() }, book))} />{book.name}</label>)}
        <details><summary>{t("advanced")}</summary><label className="field-label">{t("moveBook")}<select aria-label={t("moveBook")} value="" disabled={busy} onChange={(e) => { const book = props.books.find((b) => b.id === e.target.value); if (book) void act(() => assignBookWorld(book, world.id)); }}><option value="">{t("chooseBook")}</option>{props.books.filter((b) => !b.worldId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label></details>
      </section>
      <section className="rp-card"><header><h2>{t("entities")}</h2></header><HelpButton className="button primary small" onClick={() => setEditor({ kind: "entity" })}>{t("newEntity")}</HelpButton>
        {editor?.kind === "entity" && <EntityEditor locale={props.locale} key={editor.id ?? "new-entity"} worldId={world.id} entity={entities.find((e) => e.id === editor.id)} entities={entities} entries={entries} t={t} busy={busy} onSave={saveEntity} onCancel={() => setEditor(null)} />}
        {entities.map((entity) => <article key={entity.id} className="rp-item"><small>{t(entity.kind)}</small><h3>{entity.name}</h3><p>{characterDescription(entity, props.locale)}</p><small>{t("linkedMemory")}: {entries.filter((e) => e.entityIds?.includes(entity.id)).length}</small><div className="button-row">
          <HelpButton className="button secondary small" onClick={() => setEditor({ kind: "entity", id: entity.id })}>{t("edit")}</HelpButton>
          <HelpButton className="button secondary small" disabled={busy} onClick={() => void act(() => duplicateEntity(entity, t("copyName", { name: entity.name })))}>{t("duplicate")}</HelpButton>
          <HelpButton className="button secondary small" disabled={busy} onClick={() => void act(async () => downloadWhenUnlocked(await exportProfile(world.id, entity.id)))}>{t("export")}</HelpButton>
          <HelpButton className="button secondary small danger" disabled={busy} onClick={() => { if (!props.confirmDeletions || window.confirm(t("deleteEntity"))) void act(() => removeEntity(entity.id)); }}>{t("delete")}</HelpButton>
        </div></article>)}
      </section>
      <section className="rp-card"><header><h2>{t("templates")}</h2></header><p className="rp-hint">{t("templateHint")}</p><HelpButton className="button primary small" onClick={() => setEditor({ kind: "template" })}>{t("newTemplate")}</HelpButton>
        {editor?.kind === "template" && <TemplateEditor key={editor.id ?? "new-template"} worldId={world.id} template={props.templates.find((v) => v.id === editor.id)} entities={entities} t={t} busy={busy} onSave={(v, expected) => act(() => saveEditorRecord("template", v, expected))} onCancel={() => setEditor(null)} />}
        {props.templates.filter((v) => v.worldId === world.id).map((v) => <article className="rp-item" key={v.id}><h3>{v.name}</h3><p>{v.opening}</p><div className="button-row">
          <HelpButton className="button primary small" onClick={() => void props.onTemplate(v.id)}>{t("useTemplate")}</HelpButton>
          <HelpButton className="button secondary small" onClick={() => setEditor({ kind: "template", id: v.id })}>{t("edit")}</HelpButton>
          <HelpButton className="button secondary small" disabled={busy} onClick={() => void act(() => repository.put("template", { ...v, id: createId("template"), name: t("copyName", { name: v.name }), createdAt: Date.now(), updatedAt: Date.now() }))}>{t("duplicate")}</HelpButton>
          <HelpButton className="button secondary small" disabled={busy} onClick={() => void act(async () => { const pack = await exportWorld(world.id); pack.records = pack.records.filter((r) => r.kind !== "template" || r.id === v.id); await downloadWhenUnlocked(pack); })}>{t("export")}</HelpButton>
          <HelpButton className="button secondary small danger" disabled={busy} onClick={() => { if (!props.confirmDeletions || window.confirm(t("confirmDelete"))) void act(() => repository.delete("template", v.id)); }}>{t("delete")}</HelpButton>
        </div></article>)}
      </section>
      </>}
    </>}
  </div>;
}

function WorldLibraryPicker(props: { label: string; worlds: WorldProfile[]; selectedId: string | null; unassigned: string; createLabel: string; onSelect: (id: string | null) => void; onCreate: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const focusIndex = useRef<number | null>(null);
  const id = useId().replaceAll(":", "");
  const selected = props.worlds.find((world) => world.id === props.selectedId);
  const itemCount = props.worlds.length + 2;
  const selectedIndex = selected ? props.worlds.findIndex((world) => world.id === selected.id) + 1 : 0;
  useEffect(() => {
    if (!open) return;
    if (focusIndex.current !== null) { items.current[focusIndex.current]?.focus(); focusIndex.current = null; }
    const outside = (event: PointerEvent | FocusEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  function moveFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = items.current.findIndex((item) => item === document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? itemCount - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + itemCount) % itemCount;
    items.current[next]?.focus();
  }
  function select(id: string | null) { props.onSelect(id); setOpen(false); trigger.current?.focus(); }
  return <div className="dr-world-library">
    <span className="dr-world-library-label" id={id + "-label"}>{props.label}</span>
    <div className="dr-world-picker" ref={root}>
      <button ref={trigger} className="dr-world-picker-trigger" type="button" aria-label={`${props.label}: ${selected?.name ?? props.unassigned}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id + "-menu"} onClick={() => setOpen((value) => !value)} onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault(); focusIndex.current = event.key === "ArrowDown" ? selectedIndex : itemCount - 1; setOpen(true);
      }}>
        <span className={selected ? "dr-world-picker-dot" : "dr-world-picker-dot is-empty"} style={selected ? { backgroundColor: selected.color } : undefined} aria-hidden="true" />
        <span className="dr-world-picker-name">{selected?.name ?? props.unassigned}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && <div className="dr-world-picker-menu" id={id + "-menu"} role="menu" aria-labelledby={id + "-label"} onKeyDown={moveFocus}>
        <button ref={(node) => { items.current[0] = node; }} type="button" role="menuitemradio" aria-checked={!selected} onClick={() => select(null)}>
          <span className="dr-world-picker-dot is-empty" aria-hidden="true" /><span className="dr-world-picker-name">{props.unassigned}</span>{!selected && <Check size={15} aria-hidden="true" />}
        </button>
        {props.worlds.map((world, index) => <button ref={(node) => { items.current[index + 1] = node; }} type="button" role="menuitemradio" aria-checked={world.id === selected?.id} key={world.id} onClick={() => select(world.id)}>
          <span className="dr-world-picker-dot" style={{ backgroundColor: world.color }} aria-hidden="true" /><span className="dr-world-picker-name">{world.name}</span>{world.id === selected?.id && <Check size={15} aria-hidden="true" />}
        </button>)}
        <div className="dr-world-picker-divider" role="separator" />
        <button ref={(node) => { items.current[props.worlds.length + 1] = node; }} className="dr-world-picker-create" type="button" role="menuitem" onClick={() => { setOpen(false); props.onCreate(); }}><Plus size={16} aria-hidden="true" />{props.createLabel}</button>
      </div>}
    </div>
  </div>;
}

function Field(props: { name: string; help?: string; children: ReactNode }) { return <div className="field-label"><span className="help-field-title">{props.name}</span>{props.children}{props.help && <small className="rp-hint">{props.help}</small>}</div>; }
function Actions(props: { t: T; onCancel: () => void; busy: boolean; disabled?: boolean }) { return <div className="button-row"><HelpButton type="submit" className="button primary" disabled={props.busy || props.disabled}>{props.t("save")}</HelpButton><HelpButton type="button" className="button secondary" onClick={props.onCancel}>{props.t("cancel")}</HelpButton></div>; }

function WorldEditor(props: { world?: WorldProfile; t: T; busy: boolean; onSave: (w: WorldProfile, expected: WorldProfile | null) => Promise<void>; onCancel: () => void }) {
  const [base] = useState(props.world ?? null);
  const [useDescription, setUseDescription] = useState(props.world?.useDescriptionInContext ?? !props.world);
  const [name, setName] = useState(props.world?.name ?? "");
  const [description, setDescription] = useState(props.world?.description ?? "");
  const [color, setColor] = useState(props.world?.color ?? BOOK_COLORS[0]!);
  const [budget, setBudget] = useState(props.world?.contextBudget ?? 2000);
  const [threshold, setThreshold] = useState(props.world?.relevanceThreshold ?? 6);
  const t = props.t;
  return <form className="rp-editor" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; void props.onSave({ ...base, id: base?.id ?? createId("world"), name: name.trim(), description, useDescriptionInContext: useDescription, color, contextBudget: budget, relevanceThreshold: threshold, createdAt: base?.createdAt ?? Date.now(), updatedAt: Date.now() }, base); }}>
    <Field name={t("name")} help={t("worldHint")}><input aria-label={t("name")} className="input" required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
    <Field name={t("description")}><textarea aria-label={t("description")} className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
    <label className="rp-check"><input type="checkbox" aria-label={t("useDescription")} checked={useDescription} onChange={(e) => setUseDescription(e.target.checked)} />{t("useDescription")}</label>
    <div className="color-picker">{BOOK_COLORS.map((c) => <button type="button" key={c} aria-label={c} aria-pressed={c === color} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
    <details><summary>{t("advanced")}</summary><Field name={t("budget")} help={t("settingsHint")}><input aria-label={t("budget")} type="number" className="input" required min={500} max={16000} step={250} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></Field>
    <Field name={t("sensitivity")}><select aria-label={t("sensitivity")} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>{[4,6,9].map((v, i) => <option value={v} key={v}>{t((["sensitivityWide", "sensitivityBalanced", "sensitivityPrecise"] as const)[i]!)}</option>)}{threshold === 8 && <option value={8}>{t("sensitivityPrecise")}</option>}</select></Field>
    </details><Actions t={t} busy={props.busy} onCancel={props.onCancel} disabled={!name.trim()} />
  </form>;
}

function EntityEditor(props: { locale: Locale; worldId: string; entity?: SceneEntity; entities: SceneEntity[]; entries: MemoryEntry[]; t: T; busy: boolean; onSave: (v: SceneEntity, links: string[], expected: SceneEntity | null, baseEntries: MemoryEntry[]) => Promise<void>; onCancel: () => void }) {
  const [sheet, setSheet] = useState(props.entity?.characterSheet);
  const [base] = useState(props.entity ?? null); const [baseEntries] = useState(props.entries);
  const [useDescription, setUseDescription] = useState(props.entity?.useDescriptionInContext ?? !props.entity);
  const [name, setName] = useState(props.entity?.name ?? "");
  const [description, setDescription] = useState(props.entity?.description ?? "");
  const [kind, setKind] = useState<SceneEntity["kind"]>(props.entity?.kind ?? "character");
  const [aliases, setAliases] = useState(props.entity?.aliases.join(", ") ?? "");
  const [members, setMembers] = useState(props.entity?.memberIds ?? []);
  const [links, setLinks] = useState(props.entries.filter((e) => e.entityIds?.includes(props.entity?.id ?? "")).map((e) => e.id));
  const [query, setQuery] = useState("");
  const t = props.t;
  return <form className="rp-editor" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; void props.onSave({ ...base, characterSheet: sheet, id: base?.id ?? createId("entity"), worldId: props.worldId, name: name.trim(), description, useDescriptionInContext: useDescription, kind, aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean), memberIds: kind === "group" ? members : [], createdAt: base?.createdAt ?? Date.now(), updatedAt: Date.now() }, links, base, baseEntries); }}>
    <Field name={t("name")} help={t("entityHint")}><input className="input" aria-label={t("name")} required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
    <select aria-label={t("entities")} value={kind} onChange={(e) => setKind(e.target.value as SceneEntity["kind"])}>{(["character","location","group"] as const).map((v) => <option key={v} value={v}>{t(v)}</option>)}</select>
    <Field name={t("description")} help={t("entityHint")}><textarea className="textarea" aria-label={t("description")} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
    {sheet && kind === "character" && (["appearance", "personality", "goals", "background"] as const).map(key => <Field key={key} name={characterText(props.locale, key)}><textarea className="textarea" aria-label={characterText(props.locale, key)} maxLength={1200} value={sheet[key]} onChange={e => setSheet({ ...sheet, [key]: e.target.value })} /></Field>)}
    <label className="rp-check"><input type="checkbox" aria-label={t("useDescription")} checked={useDescription} onChange={(e) => setUseDescription(e.target.checked)} />{t("useDescription")}</label>
    <Field name={t("aliases")} help={t("aliasesHint")}><input className="input" aria-label={t("aliases")} value={aliases} onChange={(e) => setAliases(e.target.value)} /></Field>
    {kind === "group" && <Field name={t("members")} help={t("sceneHint")}>{props.entities.filter((v) => v.id !== props.entity?.id && v.kind !== "group").map((v) => <label className="rp-check" key={v.id}><input type="checkbox" checked={members.includes(v.id)} onChange={(e) => setMembers(toggle(members, v.id, e.target.checked))} />{v.name}</label>)}</Field>}
    <Field name={t("linkedMemory")} help={t("linksHint")}><input className="input" aria-label={t("search")} placeholder={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} /><div className="rp-link-list">{props.entries.filter((e) => `${e.title} ${e.content}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((entry) => <label className="rp-check" key={entry.id}><input type="checkbox" checked={links.includes(entry.id)} onChange={(e) => setLinks(toggle(links, entry.id, e.target.checked))} /><span><strong>{entry.title}</strong><small>{entry.content}</small></span></label>)}</div></Field>
    <Actions t={t} busy={props.busy} onCancel={props.onCancel} disabled={!name.trim()} />
  </form>;
}

function TemplateEditor(props: { worldId: string; template?: StoryTemplate; entities: SceneEntity[]; t: T; busy: boolean; onSave: (v: StoryTemplate, expected: StoryTemplate | null) => Promise<void>; onCancel: () => void }) {
  const [base] = useState(props.template ?? null);
  const [name, setName] = useState(props.template?.name ?? "");
  const [opening, setOpening] = useState(props.template?.opening ?? "");
  const [initialState, setInitialState] = useState(props.template?.initialState ?? "");
  const [focusIds, setFocusIds] = useState(props.template?.focusIds ?? []);
  const t = props.t;
  return <form className="rp-editor" onSubmit={(e) => { e.preventDefault(); if (!name.trim() || !opening.trim()) return; void props.onSave({ id: base?.id ?? createId("template"), worldId: props.worldId, name: name.trim(), opening, initialState, focusIds, createdAt: base?.createdAt ?? Date.now(), updatedAt: Date.now() }, base); }}>
    <Field name={t("name")}><input className="input" aria-label={t("name")} required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
    <Field name={t("opening")} help={t("templateHint")}><textarea className="textarea" aria-label={t("opening")} required value={opening} onChange={(e) => setOpening(e.target.value)} /></Field>
    <Field name={t("initialState")} help={t("templateHint")}><textarea className="textarea" aria-label={t("initialState")} value={initialState} onChange={(e) => setInitialState(e.target.value)} /></Field>
    <Field name={t("scene")} help={t("sceneHint")}>{props.entities.map((v) => <label className="rp-check" key={v.id}><input type="checkbox" checked={focusIds.includes(v.id)} onChange={(e) => setFocusIds(toggle(focusIds, v.id, e.target.checked))} />{v.name}</label>)}</Field>
    <Actions t={t} busy={props.busy} onCancel={props.onCancel} disabled={!name.trim() || !opening.trim()} />
  </form>;
}

function BdsImport(props: { locale: Locale; worlds: WorldProfile[]; canAttach: boolean; onClose: () => void; onDone: (worldId: string, attach: boolean) => Promise<void> }) {
  const t: T = (key, vars) => sceneText(props.locale, key, vars);
  const [attach, setAttach] = useState(props.canAttach);
  const [lore, setLore] = useState<LoreImport | null>(null);
  const items = lore?.items ?? [];
  const [acceptUnsupported, setAcceptUnsupported] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"smart" | "manual">("smart");
  const [worldId, setWorldId] = useState("");
  const [pack, setPack] = useState<WorldPackage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [committedImport, setCommittedImport] = useState<{ worldId: string; attach: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const readGeneration = useRef(0);
  const mounted = useRef(false);
  const committing = useRef(false);
  const [savingImport, setSavingImport] = useState(false);
  const requestClose = () => { if (!committing.current) props.onClose(); };
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])].filter((element) => element.getClientRects().length);
    dialog?.querySelector<HTMLElement>(".rp-import-choose")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (!committing.current) props.onClose(); return; }
      if (event.key !== "Tab") return;
      const controls = focusable(); const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => { mounted.current = false; readGeneration.current++; document.removeEventListener("keydown", onKeyDown, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  async function readFile(file: File) {
    if (committing.current || committedImport) return;
    const generation = ++readGeneration.current;
    const current = () => mounted.current && generation === readGeneration.current;
    setBusy(true); setLore(null); setAcceptUnsupported(false); setPack(null); setWorldId(""); setError(""); setFileName(file.name);
    try {
      if (file.size > 10_000_000) throw new Error();
      const text = await file.text(); if (!current()) return;
      const data = JSON.parse(text.replace(/^\uFEFF/, ""));
      if (data?.format === "deeprole-world") { const value = parseWorldPackage(text); setPack(value); setName((value.records.find((r) => r.kind === "world")!.data as WorldProfile).name); }
      else { const value = parseLoreImport(text); setLore(value); setName(value.name ?? file.name.replace(/\.json$/i, "")); }
    } catch { if (current()) setError(t("fileInvalid")); }
    finally { if (current()) setBusy(false); }
  }
  async function importRecords(build: () => DataRecord[], attachToChat: boolean) {
    if (committing.current || busy || committedImport) return;
    committing.current = true; setSavingImport(true); setBusy(true); setError("");
    let saved = false;
    try {
      const records = build(); const id = worldId || records.find(record => record.kind === "world")!.id;
      await repository.mergeRecords(records); saved = true;
      if (mounted.current) setCommittedImport({ worldId: id, attach: attachToChat });
      await props.onDone(id, attachToChat);
    }
    catch { if (mounted.current) setError(t(saved ? "importRefreshFailed" : "failed")); }
    finally { committing.current = false; if (mounted.current) { setSavingImport(false); setBusy(false); } }
  }
  async function finishImport() {
    if (!committedImport || committing.current || busy) return;
    committing.current = true; setSavingImport(true); setBusy(true); setError("");
    try { await props.onDone(committedImport.worldId, committedImport.attach); }
    catch { if (mounted.current) setError(t("importRefreshFailed")); }
    finally { committing.current = false; if (mounted.current) { setSavingImport(false); setBusy(false); } }
  }
  function onDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void readFile(file);
  }
  return <div className="modal-backdrop lore-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section ref={dialogRef} className="modal lore-import-modal" role="dialog" aria-modal="true" aria-label={t("importFile")} aria-busy={busy}>
      <header><h2>{t("importFile")}</h2><button type="button" className="icon-button" disabled={savingImport} onClick={requestClose} aria-label={t("cancel")}><X /></button></header>
      <div className="modal-body">
    {committedImport ? <div className="rp-import-recovery">
      <p className="rp-status" role="status">{t("importStored")}</p>
      {busy && <p role="status">{t("importRefreshing")}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="button-row">
        <button type="button" className="button primary" disabled={busy} onClick={() => void finishImport()}>{t("importRefresh")}</button>
        <button type="button" className="button secondary" disabled={busy} onClick={requestClose}>{t("importClose")}</button>
      </div>
    </div> : <fieldset className="rp-import-fields" disabled={savingImport} aria-label={t("importFile")}>
    <div className={`rp-import-dropzone${dragging ? " is-dragging" : ""}`} role="region" aria-label={t("importDropTitle")} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); }} onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={onDrop}>
      <Upload aria-hidden="true" /><strong>{fileName || t("importDropTitle")}</strong><p>{dragging ? t("importDropActive") : t("importDropHint")}</p>
      <button type="button" className="button secondary small rp-import-choose" disabled={busy} onClick={() => inputRef.current?.click()}>{t("chooseFile")}</button>
      <input ref={inputRef} className="rp-import-input" aria-label={t("chooseFile")} type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void readFile(file); }} />
    </div>
    {busy && <p role="status">{t(savingImport ? "importSaving" : "importReading")}</p>}
    {props.canAttach && <><label className="rp-check"><input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />{menuText(props.locale, "attachImport")}</label><p className="rp-hint">{menuText(props.locale, "attachHint")}</p></>}
    {pack && <><p role="status">{t("detectedWorld")}</p><p>{t("packagePreview", { name: (pack.records.find((r) => r.kind === "world")!.data as WorldProfile).name, count: pack.records.length })}</p><Field name={t("name")}><input className="input" aria-label={t("name")} value={name} onChange={(e) => setName(e.target.value)} /></Field></>}
    {items.length > 0 && <>
      <p role="status">{t(lore?.format === "bds" ? "detectedBds" : "detectedJson")}</p>
      <p className="rp-status">{t("previewModes", { count: items.length, always: items.filter((i) => i.activation === "always").length, smart: items.filter((i) => i.activation === "smart").length, manual: items.filter((i) => i.activation === "manual").length, disabled: items.filter((i) => !i.enabled).length })}</p>
      <p className="rp-hint rp-import-character-hint">{t("jsonPreservation")} {t("loreCardsHint")}</p>
      {!!lore?.unsupportedFields.length && <div className="rp-status" role="note"><p>{t("unsupportedImport", { fields: lore.unsupportedFields.join(", ") })}</p><label className="rp-check"><input type="checkbox" checked={acceptUnsupported} onChange={(e) => setAcceptUnsupported(e.target.checked)} />{t("acceptUnsupported")}</label></div>}
      <Field name={t("name")}><input aria-label={t("name")} className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <details><summary>{t("advanced")}</summary><Field name={t("destination")} help={t("worldHint")}><select aria-label={t("destination")} value={worldId} onChange={(e) => setWorldId(e.target.value)}><option value="">{t("newWorldImport")}</option>{props.worlds.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
      {lore?.format === "bds" && <><p>{t("alwaysMapping")}</p><Field name={t("mapping")} help={t("mappingHint")}><select aria-label={t("mapping")} value={mode} onChange={(e) => setMode(e.target.value as "smart" | "manual")}><option value="smart">{t("smart")}</option><option value="manual">{t("manual")}</option></select></Field></>}</details>
      <LoreImportPreview locale={props.locale} items={items} />
    </>}
    {error && <p role="alert">{error}</p>}
    </fieldset>}
      </div>
      {!committedImport && (pack || items.length > 0) && <footer className="rp-import-footer">
        <HelpButton className="button primary" disabled={!name.trim() || busy || !!lore?.unsupportedFields.length && !acceptUnsupported} onClick={() => {
          if (pack) void importRecords(() => cloneWorldPackage(pack, name.trim()), attach && props.canAttach);
          else if (lore) void importRecords(() => buildLoreImport(lore, name.trim(), mode, worldId || undefined), attach && props.canAttach);
        }}>{t("confirmImport")}</HelpButton>
      </footer>}
    </section>
  </div>;
}

function toggle(values: string[], id: string, checked: boolean) { return checked ? [...values, id] : values.filter((v) => v !== id); }
function downloadWorld(pack: WorldPackage) { const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `deeprole-world-${Date.now()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function exportProfile(worldId: string, entityId: string): Promise<WorldPackage> {
  const pack = await exportWorld(worldId);
  const selected = new Set([entityId]);
  const entities = pack.records.filter((r) => r.kind === "entity").map((r) => r.data as SceneEntity);
  const visit = (id: string) => { for (const member of entities.find((e) => e.id === id)?.memberIds ?? []) { if (!selected.has(member)) { selected.add(member); visit(member); } } };
  visit(entityId);
  pack.records = pack.records.filter((r) => r.kind === "world" || r.kind === "book" || (r.kind === "entity" && selected.has(r.id)) || (r.kind === "entry" && (r.data as MemoryEntry).entityIds?.some((id) => selected.has(id))));
  pack.records = pack.records.map((r) => r.kind === "entry" ? { ...r, data: { ...r.data, entityIds: ((r.data as MemoryEntry).entityIds ?? []).filter((id) => selected.has(id)) } } : r);
  const entryIds = new Set(pack.records.filter((r) => r.kind === "entry").map((r) => r.id));
  pack.records = pack.records.map((r) => r.kind === "entry" ? { ...r, data: { ...r.data, links: (r.data as MemoryEntry).links?.filter((link) => entryIds.has(link.targetId)) } } : r);
  return pack;
}
