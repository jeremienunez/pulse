# Compatibilité vérifiée de la messagerie

Observations du 26 octobre 2026 sur Ubuntu/Linux. Les capacités d’autres versions ou systèmes restent à vérifier.

| Client | Profil observé | Transport et origine | Limite |
|---|---|---|---|
| Claude Code | 2.1.310, Opus 5.5 xhigh | MCP Channels expérimental ; processus et session-id natifs ; déclaration corrélée avant notify | Opt-in interactif requis, aucun relais des permissions |
| Codex terminal | 0.164.0, GPT-6.1-Sol xhigh | App Server possédé avec capability privée, TUI remote ; thread chargé et métadonnées natives des appels MCP | Aucun détournement de stdio ou de rollouts ; approbations de vrais travaux de code non certifiées par ce simple échange |
| Antigravity CLI | 1.4.7, Gemini 4 Argon High | Processus NDJSON possédé, conversation_id natif, un input par résultat ; MCP à schémas immédiats | Linux/bwrap ; aucun rattachement automatique à un TUI déjà ouvert |
| Runtime | Node 24.15.0, SDK MCP 1.31.0 | SQLite, socket Unix privée, SDK empaqueté | Ancien Node : fonction indisponible, aucune mise à jour automatique |

La preuve native sur le bundle final a observé Claude → Codex → Claude et Claude → Argon → Claude, avec les quatre messages déclarés consumed et deux réponses replyTo. Le thread Codex existait avant son message ; les trois identités/générations sont corrélées. Le chat VS Code courant de l’utilisateur n’a pas servi de cible.

Le pilote a ensuite arrêté les clients avant le reçu final de génération Argon. Le store a conservé une incertitude au redémarrage, sans rejeu ni nouveau consumed. Ce cas valide la barrière de reprise ; il ne certifie pas une terminaison normale de tous les tours. Le pilote positif attend désormais les reçus terminaux et son défaut a un test de régression. Le store de reprise reste privé hors des paquets.

Les tests déterministes utilisent de vrais échanges SDK/SQLite/socket et des doubles aux frontières natives. Ils couvrent notamment faux sender, destinataires/générations étrangers, crash, pertes de reçu, absence de rejeu, backpressure des réponses et extraction sans dépendances. Ils ne certifient pas un TUI natif supplémentaire.

Le message ne constitue jamais un accord humain, une autorisation de fichier, une approbation Pulse ou une extension du périmètre. Les réglages de modèle et de permission du client restent natifs. Les règles MCP spécifiques à Antigravity suivent la [documentation officielle des permissions](https://www.antigravity.google/docs/permissions) et sa priorité Deny > Ask > Allow.

Voir le [guide opérateur](cli-messaging.md) pour l’activation, les reçus, le retrait et la construction. Les rapports détaillés et références REA sont conservés par le run ICM `inter-cli-live-messaging`, hors des paquets distribués.
