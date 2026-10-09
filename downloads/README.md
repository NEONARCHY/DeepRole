# Download DeepRole

Version 0.1.0 is an early build installed manually. [Русская инструкция](../INSTALL.md)

| Browser | Download | Installation |
| --- | --- | --- |
| Chrome, Brave, Edge | [Chromium ZIP](deeprole-0.1.0-chrome.zip?raw=true) | Unpack and load the folder as an extension. |
| Firefox | [Firefox ZIP](deeprole-0.1.0-firefox.zip?raw=true) | Unpack and load `manifest.json` as a temporary add-on. Reload it after restarting Firefox. |

Follow the [step-by-step installation guide](../docs/INSTALL.en.md). The full source code and tests live in this repository; the separate [source archive](deeprole-0.1.0-sources.zip?raw=true) is for keeping a copy of the project.

Already using DeepRole? **Do not uninstall it just to update**: that can remove locally stored data. Make a full backup, replace the files in the folder your browser originally loaded, reload the extension on the extensions page, then refresh the DeepSeek tab. Rebuilding the repository does not update a separate folder unpacked earlier.

This build adds **optional image generation with your own API connection**, current models from the API, uploaded-image references and illustrations attached to story replies. Keys are not exported; generation requires a click and never retries automatically. [Image setup →](../docs/IMAGE-GENERATION.en.md) It also includes reply recovery, relationship stages, numeric characteristics, visible consequences, personal emotion rules and story continuation. See the walkthrough in [English](../README.md) or [Russian](../docs/README.ru.md). [Roadmap and test notes →](../ROADMAP.md)

New uploads default to a **1920 px long edge**, customizable in **Settings → Appearance**. The viewer supports wheel zoom up to **128×** and drag-to-pan; the image library has adjustable preview sizes. World exports embed saved portraits, library pictures, selfie photos and illustrations **inside one JSON file**. [Portable worlds and full backups →](../README.md#one-json-file-your-whole-visual-world)

The release archives do not contain personal images, lore or saved chat states. Your exported world JSON does contain your saved images: keep private exports somewhere safe.
