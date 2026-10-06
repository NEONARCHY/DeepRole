# Relationships and boundaries

DeepRole can track each character's trust and affinity toward your protagonist. Tracking is on by default. It gives DeepSeek a consistent starting point and shows why a relationship changed; it does not guarantee what an external model will write.

## Set up a character

Open a character and choose **Relationships**. Mark your protagonist in their profile first, so DeepRole knows whose relationships to track.

Choose starting trust and affinity, both from 0 to 100. They are independent: a character can be attracted to the protagonist without trusting them. Presets are editable starting points, not interpretations of your existing lore. Old characters receive no invented scores until you set them up.

Add personality and boundaries, then choose how quickly this character's attitude can change. Gradual allows at most 2 points per score in one reply, Balanced 5, Fast 8. These are limits, not automatic rewards. Both positive and negative changes are possible.

Use **What this character responds to** for personal reactions: one character values directness, another needs promises kept. DeepSeek receives this guidance and a short reminder of recent consequences so attitude does not start over every turn.

Starting values and boundaries belong to the world. **Now in this chat** holds the actual progress for this conversation and protagonist. Changing a starting value does not reset saved progress. You can edit current scores, mark events manually, or **Lock values in this chat** to prevent model updates.

## Numbers and stages

In **Settings → Characters**, choose stage and numbers, numbers only, or stage only. The character list shows the selected view.

The standard stage follows trust: below 25 is Guarded, 25 is Acquaintance, and 50 is Trust. Closeness requires at least 70 trust and 65 affinity. A stage is a short summary; a character's individual conditions and boundaries still take priority.

In **Behavior at each stage**, describe how this particular character behaves as trust develops. For example, they may start keeping their plans private and later share concerns. Fill only the stages you need. DeepRole selects the current description from saved scores and sends it with the next message; it does not invent a personality or force an action.

Expand **Current state** in the character panel to see what saved values mean, completed events, and every unmet condition for closeness. This view stays available between turns and includes the protagonist's characteristics. It shows the same locally resolved state sent to DeepSeek, not forecasts of what a choice will earn.

## Individual conditions for closeness

Romantic closeness is off for each character until you explicitly configure it. You must also confirm both characters are adults in the lore. This flag does not change their written age.

For a configured character, set required trust and affinity. Add important events as achievements, and enable **Required for closeness** only for actual prerequisites. Older events remain required. For example, keeping a promise may be essential for Mira, while visiting a harbor can remain a standalone achievement. Completion is remembered for this chat; optional achievements never block closeness.

Renaming an event creates a new condition. Its previous completion is not reused in this or another chat; mark the new event manually if it has already happened.

Meeting the conditions is not consent, a guaranteed outcome, or permission to override someone's personality. The instructions require unrelated adults, willingness and respected boundaries. DeepRole supplies this context to DeepSeek; it cannot override the model's own limits or enforce every narrative decision.

## What updates automatically

After a completed story reply, DeepSeek can propose small changes, a reason, and a quote from that reply. DeepRole checks the current send, world, chat, protagonist, pace, quote and event IDs before saving. It rejects stale replies, duplicates and attempts to change settings or history. Quotes inside generated choices do not count as played events. Showing or clicking an unsubmitted option does not award points.

**What changed** keeps the latest 20 changes, including manual edits. Quote checks establish that the cited words appeared in the story, not that the model understood their meaning correctly. Review surprising changes and correct or lock them when needed. A skipped proposal leaves the previous scores intact.

**Turn consequences** in the character panel shows committed changes, their reason, new stages and important events. Expand the evidence to see the cited story passage. No new numeric changes does not mean your action had no effect on the plot. If checks fail, DeepRole explains that some changes were not applied instead of silently awarding points.

In **What changed**, **Undo the latest DeepSeek change** restores values in the editor draft. Save the character to apply this correction; the original event stays in the journal. Manual corrections and locks are protected from stale replies.

You can keep editing while an answer arrives. A manual change to resolve can be saved alongside the answer's energy change; independent relationship scores and event completions also merge. Two different edits to the same value still stop with a conflict instead of silently overwriting progress. The committed journal is preserved.

Memory analysis, lore drafts, story snapshots and requests for missing choices receive read-only character context. They are not played scenes and cannot earn progress; DeepRole does not ask for a character update alongside these services.

When you request missing choices, DeepRole also includes the currently selected world memory. Keep mandatory rules such as dialogue emojis in **Always** so they are supplied to that request too. Delivery of a rule does not guarantee the external model will follow it.

Tracking adds compact relationship and characteristic context to the normal send, including at most three recent relationship reasons/quotes and two characteristic reasons/quotes for relevant characters. Full journals and images are not sent. It does not make extra model requests. The same quoted event is not rewarded again while its record is in the latest 20 journal entries; this is a literal replay check, not semantic understanding of every repeated action.

## Numeric characteristics

Open **Character → In scene → Characteristics**. You can add energy and resolve as editable examples, or create up to six scales per character, including the protagonist. Set a name, starting value, low/high meanings and maximum change per turn (1–8). Meanings tell DeepSeek how values should affect the story and available choices; they do not decide the player's actions or guarantee outcomes.

**State boundaries** defines when these meanings apply. Low includes 30 and below by default, high starts at 70, and the middle applies neither extreme. You can change both boundaries without changing a saved value. DeepRole calculates the current state locally, so an energy value below your low boundary consistently carries the meaning you wrote for exhaustion. This guides the model, rather than enforcing a dice roll or an automatic refusal.

Current values are 0–100 and belong to this chat. Lock each scale independently or edit it manually. Its separate journal records the latest 20 changes. Existing text stats are preserved and are not automatically converted into numbers. Renaming preserves progress; for a different meaning, create a new scale. Removing a scale excludes it from active context without erasing its historical record.

Changes need evidence in the completed story, not an unchosen option. Values cannot jump past the configured limit. Recovery needs a played recovery/rest event; simply sending a message is not an automatic refill. DeepRole checks the quoted words, not whether the model interpreted the event correctly.

## Create a world with connected lore

In **New world**, expand **Characters and relationships**. Add the protagonist and up to eight other characters, choose starting relationships, then create the world. DeepRole creates their sheets and an editable always-included relationship rule in one operation.

Optionally enable **Give the protagonist energy and resolve**. Energy starts at 70 and resolve at 50; both remain editable. This sets up a new world only and does not add values to existing characters or rewrite old lore.

Connect the world to a chat. Use **Ask DeepSeek to propose lore** to develop personalities, boundaries and meaningful events. A relationship brief example is available there. Review memory proposals before saving; those proposals do not silently change relationship settings. Set the agreed values and conditions in the character sheets.

Other world rules still apply to reply choices. Keep essential style rules, such as sentence-ending emoji, in **Always** memory. Model compliance is not absolute.

## Disable tracking or move your progress

Use **Settings → Characters → Relationships, characteristics and boundaries** to turn both numeric systems off without deleting values. A world also has its own tracking switch. Character sheets must be enabled for synchronization.

A world export contains character policies, characteristic definitions, starting values and images, not each chat's played progress. Use a **full backup** to transfer chat progress as well. **Continue in a new chat** carries the locally saved character scene, relationships and characteristics into an empty branch of the same world; it never overwrites an already played branch. An ordinary new chat starts from the world's initial settings.

[Русская справка](RELATIONSHIPS.ru.md)
