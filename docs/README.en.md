<div align="center">
  <img src="../public/icons/icon-128.png" width="76" alt="DeepRole icon">
  <h1>DeepRole</h1>
  <p>Memory and characters for roleplay stories in DeepSeek.</p>
  <p><a href="../downloads/README.md">Download</a> · <a href="../INSTALL.md">Install</a> · <a href="../README.md">Русский</a></p>
</div>

DeepRole helps you keep a long story consistent. Your worlds and characters live in your browser; the extension adds selected records to the messages you send through [DeepSeek](https://chat.deepseek.com/). Changes suggested by the model become lore **only after you review and approve them**.

> Early version 0.1.0. DeepRole is an independent project, not affiliated with DeepSeek. [Back up your data](#moving-your-data) before uninstalling or moving to another computer.

## See it in action

### Pick your next move

DeepSeek can offer four ways to continue a scene. Clicking a choice only fills the message box; you can edit the text or decide not to send it.

<img src="screenshots/qa-2026-10-03-import-colors/choices-en.png" width="690" alt="Four choices in a demonstration scene">

### Keep characters in view

Character cards show who's present, their mood and saved stats. Add portraits for different emotions, or keep the default silhouettes. Portraits can be moved and resized.

<img src="screenshots/qa-2026-10-03-round7/portrait-stats.png" width="900" alt="Character portraits beside scene choices">

### Organize lore on a map

The map and list are two views of the same records: people, places, rules and events.

<img src="images/world-map.jpg" width="900" alt="Map of a fictional sample world">

### Decide what becomes memory

After an important scene, use **Update lore**. Review, edit and save only the suggestions you want.

<img src="images/memory-review.jpg" width="360" alt="Reviewing a proposed memory change">

*The images show a fictional demo world, not a private conversation. Some examples use the Russian interface.*

## Get started

1. [Download](../downloads/README.md) and [install](../INSTALL.md) the extension. Chrome, Brave and Edge use the Chromium build. The Firefox build is currently a temporary add-on.
2. Open [DeepSeek](https://chat.deepseek.com/) and go to **DeepRole → Lore**. Create an empty world or import an existing one.
3. Choose **Use in this chat**. A world in your library is not automatically connected to a conversation.
4. Use **Remember** for a fact you want to write yourself. After the story moves forward, use **Update lore** to review DeepSeek's suggestions.

Already deep into a chat with no prepared world? Create an empty world, connect it to this chat, then choose **Update lore**. DeepSeek can propose the first records from the available chat history. Check them carefully; it may miss or misunderstand details.

## How memory works

DeepSeek does not have permanent access to your whole library. DeepRole selects records for each outgoing message. **Context** shows what is prepared for the next send; it cannot prove the model will use every detail.

| Mode | What it does |
| --- | --- |
| **Always** | Included with each message in its scope. Keep essential rules short. |
| **Automatic** | Selected locally from words, names and scene context when there is room. This is not a second AI search. |
| **Manual** | Included only after you attach the record to this chat. |

Records that do not fit are **not deleted**. Later messages can select a different set. Always-on and manually attached records take space separately from automatic matches. Check an over-budget warning in **Context**.

## Characters, portraits and choices

- Characters can be added by you or created with a new DeepSeek reply. Mood, condition, goals, relationships and stats belong to a specific chat. If the model provides no valid update, DeepRole keeps the previous values.
- Each emotion can have several images, shown in a non-repeating cycle. One image can be assigned to several emotions. Custom emotion names are not translated automatically.
- Scene choices appear below a completed reply. Technical choice data is hidden while it streams. **Suggest options** is a fallback if choices did not appear automatically.

[Character and portrait guide](CHARACTERS.md) · [Scene choices guide](SCENE-CHOICES.md)

## Moving your data

| Export | Includes |
| --- | --- |
| **World export** | One world with lore records, character sheets, portraits, image library and emotion settings. |
| **Full backup** | All worlds, settings, characters and saved chat states. Use this when moving computers or before reinstalling. |

A world export does not include each chat's current mood or portrait positions. Ordinary BDS JSON transfers text memory, not images. Exports without a password are not encrypted; a full backup can be password-protected under **Settings → Files & protection**. Do not upload personal lore to GitHub.

Images stay on your device: DeepSeek receives character and emotion text, not the image files. Selected memory and service requests are still sent to DeepSeek and remain in chat history. DeepRole has no memory server or telemetry. [Privacy policy →](../PRIVACY.md)

## More information

- [Installation and updates](../INSTALL.md)
- [Characters and portraits](CHARACTERS.md)
- [Scene choices](SCENE-CHOICES.md)
- [Download builds](../downloads/README.md), [development roadmap](../ROADMAP.md) and [sample JSON lore](../examples/observatory.json)

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run build:firefox
```

The source and tests live in this repository. Automated tests do not replace a check against a live DeepSeek account; changes to the site may require an extension update.
