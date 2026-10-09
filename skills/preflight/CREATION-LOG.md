# Preflight scope correction — 2026-09-21

In frozen I2, the gpt-5.6-sol/high control response blocked a ready ICM v2 single-worker HTML prototype because br and bv were absent and proposed legacy state mirrors. The intervention separates the v2 diagnostic from frozen legacy behavior, derives requirements from the selected work, and persists only tool health in v2.

I2 passes on identical retest. Prototype startup and compact-cycle approval constraints remain passing. See [full evidence and scope](../../docs/evaluation/pulse-skills-refresh/README.md).

The absence of a relevant required runtime still blocks that operation. This change does not invent readiness evidence, approve gates, or make preflight automatic.
