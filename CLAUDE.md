# Maison 3D Interactive — Fork de Pascal Editor

Fork perso de github.com/pascalorg/editor pour construire ma maison en 3D et la
connecter a Home Assistant.

## Statut actuel (2026-04-18)

- PHASE 0 / 1 / 3 / 4 : DONE, mergées sur main (PR #1 + PR #2)
  - `@maison-3d/ha-bridge` (WebSocket HA, hooks, store, services)
  - `apps/editor/ha/` : schema + helpers + suggest + HAMappingPanel + HABootstrap + EditorWithHA
  - Panel HA injecté DANS l'ItemPanel Pascal via `createPortal` (sélecteur DOM + MutationObserver)
- PHASE 9 (partielle) : import JSON ajouté, `feat/scene-io` pushée — **en attente de test
  par le frère puis merge via PR #3**. Pascal ship déjà l'export, il manquait l'import.
- POC `/ha-test` validé live : 2107 entités HA + toggles OK
- Collaborateur : `ttotttur` (frère) ajouté avec write access
- MCP `agentation` enregistré localement pour feedback visuel direct depuis l'app
- Prochaines étapes :
  - Soit PHASE 5 (`HAVisualSystem` — émissive temps réel sur les meshes mappés)
  - Soit PHASE 6 (interactions tap → toggle HA)
  - PHASE 2 (catalogue GLB custom) reste reportée (priorité 4 du BRIEF)

## Commandes essentielles (heritees de Pascal)

- `bun dev` : dev server (port editor = **3002**, pas 3000)
- `turbo build` : build tous les packages
- `turbo build --filter=@pascal-app/core` : build un package specifique
- `bun install` : install deps
- POC HA : http://localhost:3002/ha-test (apres `bun dev`)

## Architecture du monorepo

```
maison-3d/
├── apps/
│   ├── editor/           # App Next.js Pascal + extensions HA
│   │   ├── [fichiers Pascal inchanges]
│   │   ├── ha/           # AJOUTE - couche HA (mapping, systems, panels)
│   │   ├── catalog/      # AJOUTE - catalogue objets GLB
│   │   └── scene-io/     # AJOUTE - export/import scene JSON
│   └── kiosk/            # AJOUTE - app tablette (Vite ou Next.js)
├── packages/
│   ├── core/             # PASCAL - schemas, scene state, systems
│   ├── viewer/           # PASCAL - rendu R3F
│   ├── ha-bridge/        # AJOUTE - bridge Home Assistant
│   └── glb-catalog/      # AJOUTE - catalogue objets + upload
└── ...
```

## Regles d'or (respecter strictement)

1. **Ne jamais modifier les fichiers existants de Pascal** sauf absolue necessite.
   Les extensions vont dans des dossiers NOUVEAUX clairement identifies (ha/, catalog/, etc.)
2. **Le mapping HA est stocke dans `node.metadata.ha`** pour coller au modele
   Pascal sans toucher ses schemas de base.
3. **bun dev doit toujours marcher** apres chaque modification. Si Pascal casse,
   revert et reprendre.
4. **Merger upstream regulierement** : `git fetch upstream && git merge upstream/main`
   pour beneficier des updates Pascal. Gerer les conflits dans notre code, jamais
   dans le code Pascal.
5. **Commit messages** : prefixe `feat(ha):`, `feat(catalog):`, `feat(kiosk):`,
   `chore(merge):` pour le merge upstream, etc.

## Patterns cles (heritiers de Pascal)

### Scene Registry
Pascal expose `sceneRegistry` dans `@pascal-app/core`. Map<NodeId, Object3D> pour
acceder aux meshes en O(1). On l'utilise depuis nos systemes HA.

### Dirty system
Pascal marque `dirtyNodes` a chaque CRUD. Nos systemes HA peuvent en profiter
pour ne re-appliquer les visuals que sur les nodes changes.

### Event bus
Pascal emet `item:click`, `item:long-press`, etc. Notre `HAInteractionSystem`
ecoute ces events pour declencher les actions HA.

### Metadata des nodes
Le champ `metadata: JSON` des nodes Pascal est notre point d'extension. On y
stocke `{ ha: HAMapping, catalogItemId?, ... }` sans toucher au schema core.

## Convention de nommage Blender (pour objets uploades)

Pour les GLBs uploades par l'utilisateur, la convention de nommage des meshes
permet l'auto-suggestion de mapping HA :
- `light_*` -> domain `light`
- `volet_*`, `store_*`, `cover_*` -> `cover`
- `thermostat_*`, `clim_*` -> `climate`
- `prise_*`, `switch_*` -> `switch`
- `capteur_*`, `sensor_*` -> `sensor`
- `tv_*`, `media_*` -> `media_player`
- `porte_*`, `fenetre_*` -> `binary_sensor`

Voir `apps/editor/ha/suggest.ts`.

## Variables d'environnement

```
# Home Assistant
NEXT_PUBLIC_HA_URL=http://homeassistant.local:8123
NEXT_PUBLIC_HA_TOKEN=<long-lived-token>

# Mode (utile pour l'app kiosque)
NEXT_PUBLIC_DEFAULT_MODE=editor
```

`.env.local` gitignore. `.env.example` commit.

## Anti-patterns

- Modifier `packages/core/` ou `packages/viewer/` de Pascal -> toujours etendre
- Stocker le mapping HA hors de `node.metadata` -> perte de la persistence Pascal
- Traverser le scene graph pour trouver un mesh -> utiliser `sceneRegistry.get(id)`
- Re-render React toute la scene sur update HA -> passer par useFrame + registry
- Oublier de commit et tester `bun dev` apres une phase

## Checklist avant commit

- [ ] `bun dev` affiche Pascal fonctionnel
- [ ] Pas de modification de fichiers Pascal existants (sauf documente)
- [ ] Typecheck passe (`turbo typecheck` si defini, sinon tsc par package)
- [ ] CHANGELOG.md mis a jour
- [ ] DECISIONS.md mis a jour si nouveau choix architectural

## Permissions auto-acceptees (pour auto mode / dangerously-skip)

- Read/write dans apps/editor/ha/, apps/editor/catalog/, apps/editor/scene-io/,
  apps/kiosk/, packages/ha-bridge/, packages/glb-catalog/
- Read (seul) dans packages/core/, packages/viewer/, apps/editor/ (fichiers Pascal)
- Run : bun install, bun dev, bun run build, turbo build, turbo typecheck
- Run : git add, git commit (jamais push)
- NE JAMAIS : modifier packages/core ou packages/viewer sans confirmation explicite
- NE JAMAIS : toucher .env.local, rm -rf, git push --force
