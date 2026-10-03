import { useEffect, useState, type ComponentProps } from "react";
import type { WorldsView } from "./WorldsView";
import { sceneText } from "../../core/scene-i18n";

/** Keep the map out of the initial menu download; a failed chunk must not break the other tabs. */
export function DeferredWorldsView(props: ComponentProps<typeof WorldsView>) {
  const [View, setView] = useState<typeof WorldsView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setFailed(false);
    void import("./WorldsView").then(module => {
      if (current) setView(() => module.WorldsView);
    }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, []);
  if (View) return <View {...props} />;
  return <section className="rp-status" aria-busy={!failed}>
    <p role={failed ? "alert" : "status"}>{sceneText(props.locale, failed ? "loreLoadFailed" : "loreLoading")}</p>
    {failed && <button type="button" className="button primary" onClick={() => window.location.reload()}>{sceneText(props.locale, "loreLoadRetry")}</button>}
  </section>;
}
