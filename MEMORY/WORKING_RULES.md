# Working Rules — Project Memory and Development

## Memory rules
1. Read MEMORY/README.md and relevant memory documents before each task.
2. Treat MEMORY as the independent written source of truth for this management game.
3. Only owner-approved choices may be marked APPROVED.
4. Mark assistant ideas and unconfirmed values PROPOSED or OPEN.
5. Record rejected ideas as REJECTED; do not quietly revive them.
6. Append dated history when direction or decisions change.
7. Update CURRENT_STATUS.md after meaningful milestones.
8. Keep memory separate from existing Mini App code, database and documentation.
9. Never store secrets, tokens, passwords, API keys or private credentials.
10. Preserve ambiguity rather than inventing certainty.

## Repository safety
1. Work only on zamin-management-isolated unless owner explicitly directs otherwise.
2. Existing code, files, branches and systems are protected.
3. Create new files and folders. Do not edit, delete, rename, refactor or replace existing files.
4. Do not connect prototypes to existing Mini App, bot, backend, production database or live users.
5. Use mock data and isolated local/test storage only.
6. No merge, cherry-pick, deployment or integration without explicit approval for that action.
7. If a task seems to require changing an existing file, stop and explain.
8. Identify exact new paths before each implementation task.
9. Never claim a feature is tested unless a test was run and recorded.
10. Keep match rendering and heavier experiences separate from management UI.

## Handoff
At each work-session end, update CURRENT_STATUS.md and append to DEVELOPMENT_HISTORY.md. Update OPEN_QUESTIONS.md when questions are answered or discovered. Update APPROVED_DECISIONS.md only after explicit owner approval.

A future agent should be able to continue from these files without hidden chat history.
