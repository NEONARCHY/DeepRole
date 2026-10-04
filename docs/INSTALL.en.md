# Install DeepRole

[Русская инструкция](../INSTALL.md) · [Download builds](../downloads/README.md)

## Chrome, Brave or Edge

1. Download and unpack the [Chromium ZIP](../downloads/deeprole-0.1.0-chrome.zip?raw=true) into a folder you will keep.
2. Open your browser's extensions page, for example `chrome://extensions` or `brave://extensions`.
3. Turn on **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`.
4. Open [chat.deepseek.com](https://chat.deepseek.com/) and click the DeepRole icon.

## Firefox

1. Download and unpack the [Firefox ZIP](../downloads/deeprole-0.1.0-firefox.zip?raw=true).
2. Open `about:debugging#/runtime/this-firefox` and choose **Load Temporary Add-on**.
3. Select `manifest.json` in the unpacked folder. This temporary add-on must be loaded again after restarting Firefox.

## First use

Open **DeepRole → Lore**. Create a world or import a DeepRole world, a list of records, or memory from [Better Deepseek (BDS)](https://github.com/EdgeTypE/better-deepseek). Choose **Use in this chat** so DeepSeek receives selected memory with your next message. **Context** shows what has been selected; **Remember** saves a fact you write yourself; **Update lore** asks DeepSeek for suggestions that you review before saving.

To correct an established detail, open a character sheet and choose **Correct a lasting fact**. DeepRole submits the connected world's lore records for review and asks DeepSeek to propose replacements. Compare and approve each change. Old chat messages remain unchanged, and the model may miss indirect mentions. Worlds over 100 records or 60,000 lore characters are not partially scanned.

## Updating without losing data

Before updating, save unfinished edits and make a **full backup** under **Settings → Files & protection**. Do not uninstall the extension just to update it: browser storage may be removed with it. Replace the files in the exact folder your browser loaded, click the extension's reload button on the extensions page, then refresh the DeepSeek tab. Rebuilding the source tree does not automatically update a separately unpacked folder.

For a move to another computer, export a full backup. A single-world export carries lore, character sheets, portraits and emotion settings, but not every chat's current state or portrait layout.
