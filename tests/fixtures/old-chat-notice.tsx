import { useState } from "react";
import { createRoot } from "react-dom/client";
import { OldChatNoticeCard } from "../../src/entrypoints/shared/OldChatNotice";
import "../../src/entrypoints/content/page-widget.css";
const locale = new URL(location.href).searchParams.get("locale") === "en" ? "en" : "ru";
document.documentElement.lang = locale;
const fixture = { failed: false, stayed: false }; (window as any).oldChatFixture = fixture;
function App() {
 const [visible, setVisible] = useState(true);
 return <div className="dr-root">{visible && <OldChatNoticeCard locale={locale} notice={{ sourceChatId: "a", targetChatId: "new-chat", snapshotId: "snap", sent: false, dismissed: false }} onStay={async () => { if (fixture.failed) throw Error("fixture"); fixture.stayed = true; setVisible(false); }}/>}<form style={{ pointerEvents: "auto", position: "fixed", bottom: 16, left: 16, right: 16 }} onSubmit={e => { e.preventDefault(); document.body.dataset.sent = "true"; }}><label htmlFor="message">{locale === "ru" ? "Сообщение" : "Message"}</label><input id="message" /><button>{locale === "ru" ? "Отправить" : "Send"}</button></form></div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
