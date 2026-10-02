<div align="center">
  <img src="../public/icons/icon-128.png" width="76" alt="DeepRole">
  <h1>DeepRole</h1>
  <p>Your world. Its history. Memory you control.</p>
  <p><a href="../README.md">Русский</a> · <a href="../INSTALL.md">Install</a> · <a href="../examples/observatory.json">Example lore</a> · <a href="../PRIVACY.md">Privacy</a></p>
</div>

A local-first roleplay memory companion for DeepSeek. Organize a world on an RPG-style map, send relevant records with your messages, and review suggestions before they become lore. Independent project; not affiliated with DeepSeek. Early version 0.1.0.

## Start in a minute

1. Open [DeepSeek](https://chat.deepseek.com/) and **DeepRole → Lore**.
2. **Create your world** or **Import existing lore** from BDS, DeepRole or a supported JSON record list.
3. Choose **Use in this chat**. Importing a world is not the same as connecting it.
4. Use **Remember** to save a fact. Check the context indicator to see what your next message will include.
5. After an important event: **Update lore → Review changes → Save selected changes**.

## Scene choices

With a world connected, DeepRole asks DeepSeek to end scenes with dialogue or a meaningful action opportunity with four options: warm, neutral, confrontational, and unexpected. They appear as buttons below the reply. Clicking one **fills the composer for editing**; it never sends automatically. You can switch options until you edit the inserted text; DeepRole preserves your own draft.

The **Scene choices** switch beside the context indicator applies to all chats with a connected world. The model may fail to follow the requested format, in which case no buttons appear. Choices do not award automatic relationship points or write to lore. A character's reaction depends on their personality and story context; a harsh move can appeal to one character while a kind move can provoke distrust. Save lasting consequences through the usual reviewable **Update lore** flow.

## Approximate context space

The chat indicator reads the history of the **open chat** through an internal DeepSeek route and estimates its text size. Scrolling should no longer change the result. Green, yellow, orange and red indicate decreasing estimated space. If history cannot be read, the indicator says it is using loaded messages only and retains the largest estimate seen while scrolling.

This uses [DeepSeek's published 1M-token context](https://deepseek.com/en/news/v4-preview/) as a reference, not a precise service counter. Attachments, hidden instructions, answer branches and history trimming may change the actual send limit. DeepRole does not store the history text or sign-in token; only aggregate counts reach the extension.

## Three modes

| Mode | What happens |
| --- | --- |
| **Always** | Included with every message in its memory scope. Best for essential rules. |
| **Automatic** | Selected by local word/scene scores within a budget. Not semantic AI search. BDS `called` maps here by default. |
| **Manual** | Only included after you select it for this chat. Useful for secrets. |

DeepSeek receives selected records in outgoing requests, not permanent database access. Disabling a record does not erase information already sent. Manual selections are chat-specific. Records without a world are available to chats without a connected world.

## One library, two views

![Demonstration world map](images/world-map.jpg)

The map and list edit the same records. Branch names and positions organize your world; they do not rewrite its facts. Click to inspect/edit, double-click to fold, drag with the middle mouse button or scroll to pan; Ctrl + scroll zooms. Left-button selection lets you move several cards. Ctrl+Z / Ctrl+Shift+Z undo/redo map edits. Reset restores this map session's organization, not memory text.

Reference links are visual references; activation links can bring related records into context. The link dialog explains the effect. Split view edits two worlds, but only one is active in the chat.

## Review before saving

![Reviewing proposed memory changes](images/memory-review.jpg)

Update lore sends a visible request to DeepSeek. Technical JSON is hidden while it streams, then replaced by a status message. Completed service blocks are hidden again after a page reload. The response becomes a compact list of suggestions, not an automatic database write. Open a proposal to compare before and after, edit the text, then select it. Nothing is selected initially. Conflicted updates can explicitly become new records; discarding the whole group has an extra confirmation. Existing records retain their modes and links. The last approved batch can be undone unless its records have changed since.

Models can infer too much or make mistakes. Review is essential. Empty, invalid or interrupted results do not silently overwrite lore. A casual “save this” message is not a substitute for the button and confirmation.

## Keep your data safe

- Library storage is local to this browser profile. No DeepRole memory server or telemetry.
- Selected lore and service messages are sent to DeepSeek and may remain in its history.
- The optional local vault does not encrypt previously sent chats or old plain JSON exports. Lost passwords cannot be recovered.
- Export a full backup before removing the extension. World/BDS import and backup restoration are different operations.
- Never commit personal memories, credentials or chat screenshots. This documentation uses fictional examples.

Keep one coherent topic per record, usually a few sentences. Use Always for essential rules. Longer records consume more context each time they are selected.

## Development

```sh
npm ci
npm run build
npm run build:firefox
npm run typecheck
npm test
npm run test:e2e -- --workers=1
npm run zip
npm run zip:firefox
```

Load `.output/chrome-mv3` in Chrome/Brave or `.output/firefox-mv2` in Firefox. Rebuilding does not reload an installed copy. Reload the extension, then DeepSeek. [QA report](QA-2026-10-02.md) distinguishes live model checks from local automated tests. Screenshots show the local demonstration, not personal chats.
