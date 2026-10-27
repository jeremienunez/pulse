# Messagerie inter-CLI autonome

Pulse fournit un service local et cinq outils MCP : `pulse_message_send`, `pulse_message_read`, `pulse_message_ack`, `pulse_message_status`, `pulse_session_capabilities`. Claude Code, Codex et une session Antigravity contrôlée peuvent échanger des messages et des réponses `replyTo`. Aucun composant Compagnion n’est requis. [Profils et limites vérifiés](cli-messaging-compatibility.md).

Le service conserve les messages dans une base SQLite privée, hors dépôt, ICM et profils natifs. Chaque session est liée à son vrai harness : PID/démarrage et session Claude, thread et métadonnées natives Codex, processus et conversation NDJSON Antigravity. Le modèle ne choisit jamais son identité source.

## Préparer les lanceurs

Node 24.15 ou ultérieur est requis pour cette fonction ; les contrôles n’installent ni Node ni CLI. Depuis un paquet extrait, remplacer `/chemin/pulse` par son emplacement :

```sh
node /chemin/pulse/scripts/pulse-messaging.mjs setup --client claude --dry-run
node /chemin/pulse/scripts/pulse-messaging.mjs setup --client codex --dry-run
node /chemin/pulse/scripts/pulse-messaging.mjs setup --client antigravity --dry-run
```

Le résultat indique les deux fichiers exacts à créer, leur contenu, les conflits et le retrait. Les fichiers différents ne sont jamais remplacés ; aucune sauvegarde n’est donc nécessaire. Retirer `--dry-run` applique ce plan. `--output /repertoire/prive/neuf` choisit une destination. Aucun fichier MCP global, profil, fournisseur ou modèle actif n’est remplacé.

Le répertoire d’état est `$XDG_STATE_HOME/pulse/messaging`, sinon `~/.local/state/pulse/messaging` ; `--state /chemin/prive` le fixe explicitement. Répertoires 0700, fichiers/socket 0600, symlinks refusés. Le propriétaire du service valide les chemins sur l’hôte ; le client MCP Antigravity gère aussi la vue des UID non mappés dans son espace isolé, sans assouplir les contrôles du store.

## Démarrer un échange volontaire

Démarrer le propriétaire dans un terminal :

```sh
node /chemin/pulse/scripts/pulse-messaging.mjs serve
```

Puis, dans trois terminaux, ouvrir les sessions explicitement raccordées :

```sh
node /chemin/pulse/scripts/pulse-messaging.mjs launch claude --alias claude --workspace /projet --delivery notify --allow codex,argon
node /chemin/pulse/scripts/pulse-messaging.mjs launch codex --alias codex --workspace /projet --delivery wake --allow claude,argon
node /chemin/pulse/scripts/pulse-messaging.mjs launch antigravity --alias argon --workspace /projet --delivery wake --allow claude,codex
```

Les lanceurs générés sont des raccourcis vers ces mêmes commandes, avec état et alias par défaut. Sans option de livraison, une liaison reste `inbox-only` ; sans `--allow`, elle ne peut envoyer à aucun destinataire. Les sessions Claude/Codex effectuent une vérification de connexion visible au lancement. Claude `notify` utilise le canal expérimental natif, son opt-in de développement et deux outils de connexion spécifiques ; la capacité reste inconnue jusqu’à l’accusé réel du canal. Aucun relais d’approbations d’outils n’est exposé.

Antigravity utilise `bwrap` sur Linux pour présenter uniquement à ce processus une configuration MCP et des règles natives autorisant les cinq outils Pulse. Les règles Ask/Deny existantes restent prioritaires ; les fichiers globaux sont conservés. Ses cinq schémas sont exposés immédiatement, afin d’éviter une découverte par commandes shell. Son processus flux appartient au lanceur ; un TUI arbitraire n’est pas repris.

Demander ensuite à un agent d’envoyer un message, par exemple avec `requestId: "bonjour"`, destinataire `codex` et un texte borné. Une réponse réutilise `pulse_message_send` avec `replyTo`. Lire n’accuse jamais réception : le destinataire déclare `received` ou `consumed`. Une réponse de courtoisie à une réponse n’est pas générée automatiquement.

## Reçus, arrêt et récupération

`stored`, acceptation du transport, reçu du harness et déclaration `consumed` restent distincts. `consumed` est une déclaration attribuée du modèle, pas une vérification indépendante de la tâche. Une réponse finale native peut devenir un message de retour si aucun retour MCP explicite n’a été envoyé.

Une émission possible sans reçu terminal crée `blocked_unknown` et bloque les nouvelles livraisons vers la cible, même avec une nouvelle clé, un autre alias ou une nouvelle génération. La reconnexion du transport utilise un délai borné avec jitter ; elle ne rejoue jamais une opération ou une génération. La récupération relit les reçus du même tour. Si nécessaire, l’opérateur peut prendre une disposition explicite :

```sh
node /chemin/pulse/scripts/pulse-messaging.mjs status
node /chemin/pulse/scripts/pulse-messaging.mjs abandon --attempt ID --reason 'Décision explicite de l’opérateur après examen'
```

Abandonner ne prétend pas annuler un effet antérieur. Aucune garantie « exactement une fois » n’est revendiquée. La concurrence est bornée à deux cibles et un tour par destinataire ; les messages sont limités à 16 Kio et la file par cible à 64.

Quitter les clients natifs ferme uniquement leurs processus possédés et retire leurs liaisons. `stop` arrête le service ; les messages restent conservés. Après fermeture des sessions concernées, `node /chemin/du/lanceur/pulse-claude.mjs --remove` retire uniquement les fichiers générés intacts. Les données et fichiers étrangers restent en place.

## Construire les paquets

Le SDK MCP 1.31.0 et esbuild 0.28.2 sont verrouillés dans `scripts/cli-messaging-tools`. Préparer ce toolchain hors source avec `npm ci --ignore-scripts`, puis :

```sh
node scripts/build-cli-messaging-runtime.mjs --toolchain /toolchain/externe --out /sortie/externe
export PULSE_MESSAGING_RUNTIME_BUNDLE=/sortie/externe/cli-messaging-runtime.mjs
node scripts/build-plugin-dist.mjs build --source /source/pulse --output /sortie/paquet-neuf
```

Le packaging vérifie l’empreinte du bundle, ses entrées source, le lock et les notices avant de le copier. Les paquets Claude/Codex partagent le format Pulse ; le générateur Antigravity ajoute ses métadonnées natives. Aucun `node_modules`, probe, store privé ou téléchargement au runtime n’est requis. [Licences embarquées](../scripts/cli-messaging/THIRD_PARTY_NOTICES.md).
