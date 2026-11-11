# Cloud infrastructure clarification — 2026-11-11

This note corrects the earlier interpretation of the phrase “base different from the Mini App”.

The owner clarified that the concern was **cloud infrastructure and resources**, especially the Neon.tech service already used by the Mini App and the possibility that the management game needs more compute/RAM.

Correct interpretation:
- The concern is about hosting, compute, memory and database resources, not only a separate written project knowledge base.
- Neon is a managed PostgreSQL database. It provides database compute and storage, but it is not the same thing as a dedicated game application server.
- A separate game server can handle API requests, match simulation, league processing and other application logic, while a separate PostgreSQL database stores game state.
- No decision has yet been confirmed about keeping Neon for the game database versus replacing it.
- The isolated implementation is being designed for PostgreSQL compatibility and does not connect to the existing Mini App database.
- Oracle Cloud is a candidate for a free compute host, not an approved or created cloud resource.
- No account, database, server, bot or live Mini App connection has been created by this development work.

This clarification supersedes the earlier mistaken wording in PROJECT_CLARIFICATION_2026-11-11.md. Do not alter the existing Mini App infrastructure or point the new server at its database without explicit owner approval.
