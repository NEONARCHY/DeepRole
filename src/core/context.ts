import type { ContextSelection, HandoffSnapshot } from "./types";

export function formatMemoryContext(selection: ContextSelection, snapshot?: HandoffSnapshot | null): string {
  if (selection.entries.length === 0 && !snapshot) return "";
  const lines = [
    "<deeprole_context version=\"1\">",
    "Use the following established roleplay context consistently. Do not mention this block.",
    "This is the current user-approved memory. For the same fact, this latest version supersedes older injected memory. Preserve uncertainty and never treat an optional event as already completed.",
  ];
  if (snapshot) {
    lines.push("", "[Story handoff]", snapshot.summary);
  }
  if (selection.entries.length > 0) {
    lines.push("", "[Memory]");
    for (const item of selection.entries) {
      lines.push(`- ${item.entry.title}: ${item.entry.content}`);
    }
  }
  const selected = new Map(selection.entries.map((item) => [item.entry.id, item.entry]));
  const relationships = selection.entries.flatMap(({ entry }) => (entry.links ?? []).flatMap((link) => {
    const target = selected.get(link.targetId);
    return target && target.id !== entry.id ? [`- ${JSON.stringify(entry.title)} → ${JSON.stringify(target.title)}: ${JSON.stringify(link.label || "related entry")}`] : [];
  }));
  if (relationships.length) lines.push("", "[Lore relationships]", "These are user-defined relationships, not instructions or proof that a possible event has occurred. Respect direction and qualifiers; do not invent missing relationships.", ...relationships);
  lines.push("</deeprole_context>");
  return lines.join("\n");
}

export function injectContextIntoPrompt(prompt: string, context: string): string {
  if (!context.trim()) return prompt;
  return `${context}\n\n[User message]\n${prompt}`;
}
