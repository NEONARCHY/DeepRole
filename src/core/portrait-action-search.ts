import { configuredActionLabel } from "./character-actions";

const normalize = (text: string) => text.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase().replace(/ё/gu, "е");

/** Search existing action names only; never select, rename or create an action. */
export function searchPortraitActions(actions: string[], query: string): string[] {
  const words = normalize(query).split(" ").filter(Boolean);
  return actions.filter(action => {
    const names = [action, configuredActionLabel("ru", action), configuredActionLabel("en", action)].map(normalize);
    return names.some(name => words.every(word => name.includes(word)));
  });
}
