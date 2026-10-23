# Visual Direction — protocole gelé et limites de preuve

Le pack utilisateur conserve six profils distincts, leurs 17 textes complets, 176 sections et 49 membres. L’import vise des instructions plus précises : valeurs, conditions, exemples, exceptions et livrables restent attachés à leur usage. Le plan approuvé et sa carte source restent dans le run `history/visual-direction-skillpack`.

## Comparaison comportementale

Le [corpus](visual-direction-skillpack/corpus.json) et la [configuration v4](../../.plugin-eval/visual-direction-skillpack.json) sont gelés avant toute observation. V1 couvre cadrage/mobile, V2 caméra/lumière, V3 prompt seul, V4 architecture rythmique et V5 explainer à calques. AW2, AW3 et AW5 sont copiés sans changement du corpus Awwwards : typo/mobile, mouvement UI, backend/libellé exact.

Réutiliser le benchmark chat v4 existant pour les huit cas complets, puis ses validations et `compareResults`. Le helper d’itération réserve les cas `promotion` après gel d’une condition finale ; cet ordre ne permet pas la baseline complète exigée avant intervention. Ne pas le modifier ou créer un nouvel orchestrateur pour contourner ce contrat. Le registre des soumissions et les captures restent des artefacts d’opération du run.

Une seule requête opérateur à la fois, au plus 16 tentatives soumises pour huit cas × deux conditions. Réserver avant envoi ; ne pas remplacer une réponse incertaine. Le budget temporel effectif est 120 000 ms par cas, inférieur au plafond transport de validation (180 000 ms) et compatible avec la borne existante du helper. Plafonds : requête 524 288 octets UTF-8, réponse 65 536 octets, trace brute 4 194 304 octets. Un dépassement reste une preuve incomplète conservée, pas une réponse tronquée certifiée.

Profil initial prévu : `claude-sonnet-5-5`, effort CLI `low`, Claude Code 2.1.295, binaires et paramètres identifiés dans la validation. Le fournisseur documente cet identifiant canonique comme un snapshot fixe ; l’alias `sonnet` et la version du CLI ne sont pas des versions du modèle. Chaque réponse doit confirmer le modèle via `assistant.message.model`, avoir une fin réussie, une réponse complète et aucune action outil. Un modèle différent, une erreur, une trace ambiguë ou une réponse partielle arrête VD1 avant modification des consignes. Le snapshot reste distinct de l’infrastructure de service du fournisseur.

L’agent évalué reçoit seulement le paquet exact produit par `runnerPacket` et un système stable. Aucun oracle, verdict, ancien résultat, registre d’adaptations ou historique ne lui est envoyé. Conserver les octets exacts, empreintes, dates, invocation, stdout NDJSON, stderr, résultat final, réponse complète et règles du verdict dans les preuves du run. L’effort est un réglage explicite de l’invocation, pas une observation des tokens de raisonnement internes.

Juger les huit réponses avant toute intervention. Une baseline déjà correcte est un contrôle de non-régression et ne justifie pas l’ajout de règles pour ce comportement. Une panne concrète est reliée à la formulation qui la corrige. Si aucun écart ne justifie l’intervention, conserver la matière source et revenir au plan. Rejouer les mêmes prompts et le même oracle avec la condition candidate ; toute régression requise bloque la livraison.

## Conservation et revue du sens

Le contrôleur d’octets est en lecture seule. Il épingle séparément la carte source approuvée, reconstruit les 17 originaux par inversion d’opérations UTF-8 en ordre inverse, et protège les 28 références ainsi que les quatre anciennes capacités. Les offsets se rapportent au texte au moment de l’édition, pas à une liste globalement disjointe.

Une réécriture déclarée peut être réversible tout en dégradant le sens : comparer chaque recette, nombre, unité, condition, exemple et exception à sa source. Conserver les six profils et leurs contrats de sortie distincts. Ne pas transformer les durées film en timings UI, une focale contextuelle en réglage garanti, une géométrie en grille obligatoire ou un exemple fournisseur en capacité courante.

Les quatre nouvelles fiches sont des références externes sans adaptateur Pulse local. Les scripts, tests, exemples et assets de l’archive restent préservés dans le profil source ; leur présence n’atteste ni exécution ni licence supplémentaire. La copie du corpus n’exécute aucun renderer et ne crée aucun compte ou budget.

## Portée des résultats

Le chat avec texte injecté prouve au mieux des décisions sur ce profil et ces cas. Il ne prouve pas découverte automatique, lecture réelle de références, rendu visuel, qualité artistique, synchro audio ou export média. Catalogue, liens, paquet extrait et tests techniques sont des preuves séparées. Baseline et retest ne sont déclarés passés qu’après capture et jugement effectifs ; ce protocole n’annonce aucun résultat futur.
