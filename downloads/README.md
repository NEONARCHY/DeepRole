# Download DeepRole

Version 0.1.0 is an early build installed manually. [Русская инструкция](../INSTALL.md)

The latest build adds **emotion/action search when assigning images**: filter the primary action and extra-action lists by partial standard or custom names, while keeping selected images and assignments. [Character guide](../docs/CHARACTERS.md). [Current Edge archive](DeepRole-Edge-emotion-search-20261012.zip?raw=true).

It also fixes **large world/backup exports**: each photo travels once, files are assembled in parts, and large imports are read incrementally. Pixels and action assignments are preserved. A synthetic 280 MiB library with 24 characters and 40 photos was exported and restored in Edge. [File guide](../docs/PORTABLE-FILES.md). [Previous dated archive](DeepRole-Edge-large-export-20261012.zip?raw=true).

It also includes **Story → Game accompaniment**: automatic source-backed memory, new character discovery and protected profile additions during normal play. A durable review queue follows the lore across continuation chats; routine turns need no extra model request. [Modes and limits](../docs/AUTOMATIC-MEMORY.md). [Previous dated archive](DeepRole-Edge-automatic-memory-20261012.zip?raw=true).

The shared-game build shares one game per lore: progress, relationships, merged characters, aliases and memory selection follow the current chat. **Continue here** resumes older chats from the latest state; **Start game over** archives progress with undo before new changes. Character header icons are square. [Guide](../docs/WORLD-GAME.md). [Dated shared-game archive](DeepRole-Edge-shared-game-20261012.zip?raw=true).

The earlier character-guidance build adds visible guidance beside current character state, relationships, characteristics and event marks. Notices reflect locked values and disabled tracking; lasting profile fields are explained separately. [Character guide](../docs/CHARACTERS.md). [Dated guidance archive](DeepRole-Edge-character-guidance-20261012.zip?raw=true).

The earlier settings build keeps titles and controls visible and places explanations behind **?** buttons. Click or use the keyboard to expand them; Escape closes them. [Dated settings archive](DeepRole-Edge-settings-help-20261012.zip?raw=true).

The current October 12 build adds **Story → Characters → Names and aliases / Merge duplicate characters**. Merges now follow the lore’s shared game across continuation chats, keep source profiles for history and require explicit data sources; undo protects manual edits. [Behaviour and checkpoint limits](../docs/CHARACTERS.md). [Dated merge UI archive](DeepRole-Edge-story-merge-20261012.zip?raw=true).

The October 12 UX build adds **Story** to the main menu: scene recording status, memory, characters and saved scenes. Reviews keep edits during normal panel navigation. [UX changes and limits](../docs/UX-AUDIT-2026-10-12.md). [Dated Edge archive](DeepRole-Edge-story-ux-20261012.zip?raw=true).

| Browser | Download | Installation |
| --- | --- | --- |
| Chrome, Brave, Edge | [Chromium ZIP](deeprole-0.1.0-chrome.zip?raw=true) | Unpack and load the folder as an extension. |
| Firefox | [Firefox ZIP](deeprole-0.1.0-firefox.zip?raw=true) | Unpack and load `manifest.json` as a temporary add-on. Reload it after restarting Firefox. |

Follow the [step-by-step installation guide](../docs/INSTALL.en.md). The full source code and tests live in this repository; the separate [source archive](deeprole-0.1.0-sources.zip?raw=true) is for keeping a copy of the project.

Already using DeepRole? **Do not uninstall it just to update**: that can remove locally stored data. Make a full backup, replace the files in the folder your browser originally loaded, reload the extension on the extensions page, then refresh the DeepSeek tab. Rebuilding the repository does not update a separate folder unpacked earlier.

This build adds **optional image generation with your own API connection**, current models from the API, uploaded-image references and illustrations attached to story replies. Keys are not exported; generation requires a click and never retries automatically. [Image setup →](../docs/IMAGE-GENERATION.en.md) It also includes reply recovery, relationship stages, numeric characteristics, visible consequences, personal emotion rules and story continuation. See the walkthrough in [English](../README.md) or [Russian](../docs/README.ru.md). [Roadmap and test notes →](../ROADMAP.md)

Optional **Review references before generation** in **Settings → Images** previews the cast and offers **Auto / Ordinary / Alternate** per character. Confirm changed choices to privately revise the frame description before the image request. Cancel makes no image request; pending reviews survive reload. Character profiles can save a reference preference. **Change references** prepares another review, while **Try again** repeats the original request exactly.

Each upload asks whether to **Keep originals**, use **High quality** (1920 px by default, customizable in **Settings → Appearance**) or **Save space** (up to 1280 px). Neutral and alternative reference previews have their own remembered size slider. The viewer supports wheel zoom up to **128×** and drag-to-pan; the image library has adjustable preview sizes. World exports embed saved portraits, library pictures, selfie photos and illustrations **inside one JSON file**. [Portable worlds and full backups →](../README.md#one-json-file-your-whole-visual-world)

The release archives do not contain personal images, lore or saved chat states. Your exported world JSON does contain your saved images: keep private exports somewhere safe.

Local image libraries now have no DeepRole storage, photo-count or import-size quotas. The extension requests `unlimitedStorage`; physical capacity depends on your browser and disk. Existing stored images remain unchanged.
