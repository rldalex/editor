# Maison 3D — Brief Claude Code (v2 : Fork Pascal)

Ce document contient tout ce dont Claude Code a besoin pour forker
[pascalorg/editor](https://github.com/pascalorg/editor) et y ajouter une couche
Home Assistant + catalogue d'objets + mode kiosque.

---

## 1. Vision du projet

**Nom** : Maison 3D Interactive

**But** : Permettre a un utilisateur de construire sa maison en 3D dans l'app
(murs, dalles, toits, portes, fenetres — full editeur architectural Pascal) puis
d'y placer des objets (meubles + equipements HA depuis un catalogue ou uploadables)
qu'il mappe a ses entites Home Assistant pour :
- Visualiser l'etat de sa maison connectee en temps reel
- Controler ses equipements en touchant les objets 3D

**Deux modes** :
- **Mode Edition** (PC) : construire le batiment, placer les objets, mapper HA
- **Mode Kiosque** (tablette murale Android + Fully Kiosk Browser) : lecture
  seule + interactions HA temps reel

**Cible** : Usage perso (Alex, Marie, famille). Pas de SaaS, pas d'auth cloud.
Self-hosted Docker nginx sur le serveur maison.

---

## 2. Decision centrale : Fork complet de Pascal

On fork https://github.com/pascalorg/editor et on etend `apps/editor` avec la
couche HA. On garde :
- `@pascal-app/core` tel quel (schemas nodes, systems, scene state)
- `@pascal-app/viewer` tel quel (rendu R3F)
- `apps/editor` : on etend avec la couche HA sans casser les fichiers Pascal

**Pourquoi fork complet** :
- On veut 100% des features Pascal (walls, slabs, roofs, portes/fenetres via CSG,
  undo/redo, spatial grid)
- Usage perso donc pas de PR upstream a envoyer, le fork est notre projet prive
- On peut merger les mises a jour Pascal periodiquement via `git fetch upstream`

**Strategie d'extension** :
- Ajouter des fichiers dans `apps/editor/` dans des dossiers NOUVEAUX (ex: `apps/editor/ha/`,
  `apps/editor/catalog/`, `apps/editor/kiosk/`) pour minimiser les conflits
- NE JAMAIS modifier les fichiers existants de Pascal sauf si absolument necessaire
- Si une modification d'un fichier Pascal est requise, la documenter dans
  DECISIONS.md avec la raison

**Ajouts a faire** :
- Une nouvelle app `apps/kiosk/` pour la tablette (peut etre Vite pour legerete,
  ou reutiliser Next.js)
- Un nouveau package interne `packages/ha-bridge/` pour le bridge WebSocket HA
- Un nouveau package `packages/glb-catalog/` pour le catalogue d'objets uploadables

---

## 3. Setup initial

```bash
# Cloner le fork (sur ton compte GitHub)
# 1. Fork https://github.com/pascalorg/editor -> TON_COMPTE/maison-3d
# 2. git clone git@github.com:TON_COMPTE/maison-3d.git
# 3. cd maison-3d
# 4. git remote add upstream https://github.com/pascalorg/editor.git

# Verifier les prerequisites Pascal
bun --version  # Si absent: curl -fsSL https://bun.sh/install | bash
node --version # Node 18+

# Installer les deps Pascal
bun install

# Verifier que Pascal tourne avant toute modification
bun dev
# -> http://localhost:3002 devrait afficher Pascal Editor

# Ensuite, lancer claude :
claude --enable-auto-mode --model opus
# OU si sur Pro: claude --dangerously-skip-permissions --model opus
```

---

## 4. Prompt de bootstrap pour Claude Code

Copier-coller le bloc ci-dessous comme premier message dans Claude Code, APRES
avoir verifie que `bun dev` lance Pascal correctement :

```
Je travaille sur un fork du repo Pascal Editor (github.com/pascalorg/editor) pour
en faire mon outil perso de maison 3D connectee a Home Assistant.

Lis d'abord le fichier BRIEF.md et CLAUDE.md a la racine, qui contiennent le contexte
complet et les decisions architecturales. Lis ensuite le README.md de Pascal pour
comprendre son architecture existante.

Objectif de cette session : bootstrap de la couche HA sans casser Pascal.

Contraintes absolues :
1. NE JAMAIS modifier les fichiers existants de Pascal sauf si absolument requis
2. Toutes les extensions vont dans des dossiers NOUVEAUX
3. `bun dev` doit continuer a afficher Pascal Editor fonctionnel apres chaque phase
4. Chaque phase = un commit avec message clair "feat(ha): ..." ou "feat(catalog): ..."

Realiser les phases dans l'ordre, en validant chaque phase avant de passer a la suivante :

PHASE 0 - Audit et preparation
- Explorer la structure du repo Pascal (apps/editor, packages/core, packages/viewer)
- Comprendre comment les ItemNodes sont crees/manipules dans Pascal
- Identifier le champ metadata des nodes pour y stocker le mapping HA
- Verifier que bun dev lance Pascal sans erreur
- Creer BRIEF.md, CLAUDE.md, CHANGELOG.md, DECISIONS.md a la racine (voir section 5 du brief utilisateur)

PHASE 1 - Package ha-bridge (isole, testable independamment)
- Creer packages/ha-bridge/ avec package.json, tsconfig.json, src/
- Exports principaux :
  * connectHA(url, token), disconnectHA()
  * useHAConnection() hook React pour status
  * useHAState(entityId) hook reactif pour l'etat temps reel
  * useHAEntities() pour lister les entites (catalogue HA)
  * callService(domain, service, data, target)
- Dependances : home-assistant-js-websocket, zustand, react
- Le store Zustand interne : status, states, entities, areas

PHASE 2 - Package glb-catalog (catalogue + upload)
- Creer packages/glb-catalog/
- Responsabilites :
  * Catalogue d'objets GLB fourni par defaut (meubles, lampes, volets)
  * Upload user via drag-drop d'un GLB
  * Persistence IndexedDB des GLBs uploades (dexie.js)
  * Metadonnees par item : nom, categorie (light/cover/sensor/furniture), thumbnail, suggested HA domain
- Exports : useCatalog() hook, CatalogItem type, uploadGLB(file), getThumbnail(itemId)
- Pour les thumbnails : rendre le GLB offscreen avec three, snapshot canvas, stocker en data URL

PHASE 3 - Extension schema Pascal pour mapping HA
- NE PAS modifier packages/core de Pascal
- Creer apps/editor/ha/schema.ts qui definit :
  * HAVisualMapping : discriminated union emissive | cover | label | color
  * HAAction : discriminated union toggle | call_service | popup | navigate | none
  * HAEntityBinding : { entityId, domain, role, visual?, tapAction?, longPressAction? }
  * HAMapping : { bindings: HAEntityBinding[] }
- Le mapping HA est stocke dans le champ metadata de l'ItemNode Pascal :
  node.metadata = { ...existingMeta, ha: HAMapping }
- Creer apps/editor/ha/mapping-helpers.ts :
  * getHAMapping(node): HAMapping | undefined
  * setHAMapping(node, mapping): met a jour via useScene.updateNode
  * removeHAMapping(node)

PHASE 4 - Panel HA Mapping dans l'editeur
- Creer apps/editor/ha/components/HAMappingPanel.tsx
- Declenche quand l'utilisateur selectionne un Item et clique "Mapper a HA" dans
  le menu contextuel (ou dans le panel proprietes si plus simple)
- UI :
  * Selection entite : autocomplete filtre par domain/area, avec score de match
    base sur le nom du mesh (voir apps/editor/ha/suggest.ts)
  * Preview etat actuel : lit useHAState et affiche state + attributs
  * Config visual : selecteur type (emissive/cover/label/color) + parametres
  * Config actions : tap / long press dropdowns
  * Boutons : Tester (simule visuel sans sauver), Enregistrer, Supprimer
- Creer apps/editor/ha/suggest.ts avec scoreMatch(meshName, entity) et
  suggestEntities(meshName, entities) (logique du brief)

PHASE 5 - HAVisualSystem dans le viewer Pascal
- Creer apps/editor/ha/HAVisualSystem.tsx
- Composant sans rendu qui tourne dans useFrame
- Pour chaque ItemNode avec un ha.bindings, lit l'etat HA correspondant et
  applique les visuals sur le mesh :
  * emissive : change material.emissive + emissiveIntensity
  * cover : anime position/rotation selon attribute current_position
  * label : affiche un Drei <Html> avec la valeur
  * color : change material.color selon le state
- Utilise sceneRegistry de Pascal pour retrouver les meshes (Map<NodeId, Object3D>)
- Integre dans apps/editor via un <HAVisualSystem /> dans le scene provider

PHASE 6 - Interactions 3D -> HA actions
- Creer apps/editor/ha/HAInteractionSystem.tsx
- Ecoute les events item:click et item:long-press du bus Pascal
- Si le node a un binding HA avec tapAction/longPressAction, execute :
  * toggle : callService(domain, 'toggle', {}, { entity_id })
  * call_service : callService avec les params definis
  * popup : ouvre un panel modal (brightness slider, climate control, etc.)
  * navigate : react-router navigate

PHASE 7 - Integration catalogue GLB dans l'editeur
- Etendre le CatalogTool existant de Pascal OU creer apps/editor/catalog/
- Panel "Objets" dans l'UI de Pascal avec tabs :
  * Items Pascal built-in (portes, fenetres, etc. - existants)
  * Mon catalogue (depuis glb-catalog)
  * Upload (drag-drop zone)
- Drag-drop d'un objet du catalogue dans la scene :
  * Cree un ItemNode Pascal avec metadata.glbSource = catalogItemId
  * Le renderer Pascal doit pouvoir charger un GLB externe
    -> NECESSAIRE : etendre ItemRenderer de Pascal pour supporter glbSource
    -> Voir avec l'architecture Pascal comment faire proprement (peut-etre un
       custom renderer wrapper dans apps/editor/catalog/renderers/)

PHASE 8 - App kiosque
- Option A (recommandee) : creer apps/kiosk/ en Vite pur (plus leger)
  * Import @pascal-app/core et @pascal-app/viewer depuis le monorepo
  * Import packages/ha-bridge
  * UI minimale : Canvas plein ecran + overlay statut HA + popups action
  * Charge la scene Pascal depuis le JSON exporte par l'editeur
- Option B : reutiliser Next.js avec une route /kiosk dans apps/editor
  * Plus simple a deployer (une seule app)
  * Moins optimal perf
- Decider en PHASE 0 apres discussion avec l'utilisateur

PHASE 9 - Export/import de la maison
- Creer apps/editor/scene-io/
- Export : bouton "Exporter ma maison" qui serialise en JSON :
  * Tous les nodes de useScene (Pascal)
  * Les mappings HA (deja dans metadata donc gratuit)
  * Les references aux items du catalogue (pas les GLBs eux-memes, trop lourds)
- Import : charge un JSON dans useScene
- Le kiosque consomme ce JSON pour afficher la scene

Pour chaque phase :
- Commencer par expliquer ce qui va etre fait
- Demander confirmation si un point est ambigu
- Commit git a la fin
- Verifier que bun dev marche toujours

Commence par PHASE 0. Montre-moi l'analyse de la structure Pascal et propose
l'emplacement exact de chaque nouveau fichier avant d'ecrire du code.
```

---

## 5. Fichiers a creer a la racine du fork

Voir CLAUDE.md, DECISIONS.md, CHANGELOG.md — ces fichiers sont crees au bootstrap.

---

## 6. Ordre de priorite conseille

Apres le scaffolding (phases 0-2), je te conseille l'ordre suivant :

**Priorite 1 - Valider la faisabilite (1-2 weekends)** : PHASE 0 + PHASE 1 + un POC
minimal HA (lire l'etat d'une entite et l'afficher dans un coin). Si HA connecte
et tu vois un etat temps reel, tu as valide 80% du risque.

**Priorite 2 - Boucle fermee sur un objet (2-3 weekends)** : PHASE 3 + PHASE 4 +
PHASE 5. Objectif : placer un objet dans la scene, le mapper a `light.salon`,
voir le visuel changer en temps reel.

**Priorite 3 - Interactions (1-2 weekends)** : PHASE 6. Tap sur l'objet -> toggle HA.

**Priorite 4 - Ecosysteme (3-4 weekends)** : PHASE 2 (catalogue) + PHASE 7 (upload)
+ PHASE 9 (export/import).

**Priorite 5 - Tablette (2-3 weekends)** : PHASE 8 (kiosque) + deploiement Docker.

Total : ~3-4 mois de weekends. Le conge parental jusqu'au 23/06/2026 est
parfait pour attaquer les priorites 1-3.

---

## 7. Workflow git recommande

```bash
# Setup initial
git remote add upstream https://github.com/pascalorg/editor.git
git checkout -b main  # si pas deja fait
git branch --set-upstream-to=origin/main

# Creer une branche par PHASE
git checkout -b feat/ha-bridge
# ... Claude Code travaille ...
git log --oneline
git checkout main
git merge feat/ha-bridge

# Merger upstream periodiquement
git fetch upstream
git checkout -b chore/merge-upstream-2026-05
git merge upstream/main
# resoudre conflits, tester
git checkout main && git merge chore/merge-upstream-2026-05
```

---

## 8. Pieges a anticiper

- **Pascal evolue rapidement** (453 commits deja, releases frequentes). Merger
  upstream toutes les 2-4 semaines sinon les conflits deviennent enormes.
- **Stack Pascal** : Next.js 16 + Bun + Turborepo. Si tu n'es pas a l'aise avec
  Bun, tu peux tenter `pnpm` mais ca risque de casser des scripts Pascal. Mieux
  vaut installer Bun et s'y habituer.
- **WebGPU sur tablette** : Pascal utilise WebGPU. Verifier IMMEDIATEMENT sur la
  tablette Android avec Fully Kiosk que `editor.pascal.app` charge correctement.
  Si non, issue a regler avant tout le reste (forcer WebGL fallback).
- **Bundle size tablette** : Pascal est lourd (CSG, Drei, etc.). Pour le kiosque,
  tree-shaking agressif + lazy loading + preferer Vite a Next.js.
- **Long-lived token HA** : genere dans HA Profil > Long-Lived Access Tokens.
  Mettre dans `.env.local`, jamais commit.
- **Upload GLB + IndexedDB** : Dexie.js pour gerer la taille (un GLB de meuble
  peut faire plusieurs MB). Prevoir quota + nettoyage.

---

## 9. Procedure de fork et bootstrap

Voir CLAUDE.md pour les permissions et conventions.
