# DeepRole project conventions

## Continuation between computers

- At the start of work on this repository, read `CODEX-HANDOFF.md` before choosing the next implementation task. It contains the latest completed work, user decisions, verification limits, and the concrete next RP-04 task.
- When the user asks to continue after pulling or changing computers, follow that handoff and the newest ROADMAP sections. Older historical "next steps" are not current instructions. Do not overwrite uncommitted work when synchronizing Git.
- Update the handoff when finishing a meaningful milestone, so another Codex can continue without this chat history.

## Project conventions

- Explain changes to the user in short, plain Russian. Do not assume coding knowledge.
- Preserve user lore, ages, events and imported text. Interface changes do not authorize rewriting stored stories.
- Update ROADMAP.md after each implementation iteration, distinguishing automated tests from live-account checks.
- After completing code changes, run relevant tests, typecheck, and regenerate Chrome and Firefox build directories and ZIP packages. Do not claim that rebuilding automatically reloads the installed browser copy.
- Use the shared design system for spacing, controls, colors and readability. Reserve the strongest accent for the main action; retain distinct destructive and selected states.
- Keep essential actions and short explanations visible where a choice is made. Put only secondary tools behind explicitly named disclosures. Do not add a question-mark button beside every control.
- Memory modes use the shared MemoryModeControl and identical Russian/English names across the list, map and chat. Describe the real matching algorithm, not AI understanding.
- Verify narrow panels and both languages. A screen is not complete merely because TypeScript compiles.
