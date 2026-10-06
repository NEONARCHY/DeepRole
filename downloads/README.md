# Download DeepRole

Version 0.1.0 is an early build installed manually. [Русская инструкция](../INSTALL.md)

| Browser | Download | Installation |
| --- | --- | --- |
| Chrome, Brave, Edge | [Chromium ZIP](deeprole-0.1.0-chrome.zip?raw=true) | Unpack and load the folder as an extension. |
| Firefox | [Firefox ZIP](deeprole-0.1.0-firefox.zip?raw=true) | Unpack and load `manifest.json` as a temporary add-on. Reload it after restarting Firefox. |

Follow the [step-by-step installation guide](../docs/INSTALL.en.md). The full source code and tests live in this repository; the separate [source archive](deeprole-0.1.0-sources.zip?raw=true) is for keeping a copy of the project.

Already using DeepRole? **Do not uninstall it just to update**: that can remove locally stored data. Make a full backup, replace the files in the folder your browser originally loaded, reload the extension on the extensions page, then refresh the DeepSeek tab. Rebuilding the repository does not update a separate folder unpacked earlier.

This build adds **automatic hidden-reply recovery and automatic delivery of the recovered fragment with your next message**. Local copies and delivery markers survive reloads. It also includes relationship stages, numeric characteristics, visible consequences, personal emotion rules and one-click story continuation. See the feature walkthrough in [English](../README.md) or [Russian](../docs/README.ru.md), with screenshots in both languages. [Roadmap and test notes →](../ROADMAP.md)

The release archives do not contain personal images, lore or saved chat states.
