# DeepRole project conventions

## Continuation between computers

- At the start of work on this repository, read the current section of `CODEX-HANDOFF.md` before choosing the next implementation task. It contains the latest completed work, user decisions, verification limits, and the next task; do not hardcode a historical RP number.
- When continuing the 13 October 2026 work after a pull or computer change, also read `docs/HANDOFF-2026-10-13.md` and the newest UX/RP sections of `ROADMAP.md`. The day log maps RP223–RP238/UX238 to the actual implementation and tests. For UX work, read `docs/DESIGN-SYSTEM.md` before editing.
- When the user asks to continue after pulling or changing computers, follow that handoff and the newest ROADMAP sections. Older historical "next steps" are not current instructions. Do not overwrite uncommitted work when synchronizing Git.
- Update the handoff when finishing a meaningful milestone, so another Codex can continue without this chat history.

## DeepRole browser checks on Windows

- For DeepRole and DeepSeek UI checks, follow [the separate Edge guide](docs/CODEX-DEEPROLE-EDGE.md) and use the [portable kit](downloads/DeepRole-Edge-Codex-Work-Kit.zip) when setting up another computer. Use a dedicated Edge profile with its own extension installation.
- Activate the intended DeepSeek chat first. Open DeepRole's `sidepanel.html` as an ordinary extension tab in the same Edge window and verify both window IDs. Inspect that extension tab while keeping the chat active. Use this route if the native side panel displays a white screen.
- Leave extension installation, browser security prompts and sign-in to the user. Operate only within the user's authorized test scope. Close the Edge process owned by the session when the check is finished.

## Project conventions

- Explain changes to the user in short, plain Russian. Do not assume coding knowledge.
- Preserve user lore, ages, events and imported text. Interface changes do not authorize rewriting stored stories.
- Update ROADMAP.md after each implementation iteration, distinguishing automated tests from live-account checks.
- After completing code changes, run relevant tests, typecheck, and regenerate Chrome and Firefox build directories and ZIP packages. Do not claim that rebuilding automatically reloads the installed browser copy.
- Use the shared design system for spacing, controls, colors and readability. Reserve the strongest accent for the main action; retain distinct destructive and selected states.
- Keep essential actions and short explanations visible where a choice is made. Put only secondary tools behind explicitly named disclosures. Do not add a question-mark button beside every control.
- Memory modes use the shared MemoryModeControl and identical Russian/English names across the list, map and chat. Describe the real matching algorithm, not AI understanding.
- Verify narrow panels and both languages. A screen is not complete merely because TypeScript compiles.
