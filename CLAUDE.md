# Maison 3D Interactive — Fork de Pascal Editor

Fork perso de github.com/pascalorg/editor pour construire ma maison en 3D et la
connecter a Home Assistant.

## Statut actuel (2026-04-18)

- PHASE 0 / 1 / 3 / 4 / 5 / 5.1 / 5.2 / 6 : DONE
  - PHASE 5/5.1/6 mergées sur main (PR #3 `feat/ha-phase-5-6`)
  - PHASE 5.2 + UI glow toggle sur `feat/ha-brightness` (2 commits, pas encore de PR)
  - `@maison-3d/ha-bridge` (WebSocket HA, hooks, store + `subscribeWithSelector`, services)
  - `apps/editor/ha/` : schema + helpers + suggest + HAMappingPanel + HABootstrap + EditorWithHA
  - Panel HA injecté DANS l'ItemPanel Pascal via `createPortal` (sélecteur DOM + MutationObserver)
  - **PHASE 5** : `HAVisualSystem` — émissive temps réel, RAF reapply pour
    survivre aux re-renders Pascal (`<Clone>` drei swap les matériaux),
    `material.version++` pour recompiler le NodeMaterial shader WebGPU
  - **PHASE 5.1** : pilotage des `LightEffect` Pascal depuis HA via
    `useInteractive.setControlValue` (toggle) + mutation directe du PointLight
    `.color` (traverse Three.js scene) pour suivre `rgb_color` HA en live.
    Indépendant du glow — `intensityOn=0` possible pour light-only.
  - **PHASE 5.2** : brightness HA (0-255) → slider Pascal (0-100) via
    `syncLightBrightness`. Pascal lerp déjà le slider vers PointLight
    intensity chaque frame → dimmer HA suivi automatiquement.
  - **UI glow toggle** : checkbox "Faire glow le mesh quand allumé" dans
    le panel HA Mapping (pilote `intensityOn: 1.5` / `0`).
  - **PHASE 6** : `HAInteractionSystem` — tap/long-press → toggle / call_service, multi-touch
    safe, feedback scale 150ms découplé de la confirmation HA,
    stopPropagation sur tap pour empêcher Pascal de re-focus la caméra
  - Spec + plan : `docs/superpowers/specs/2026-04-18-ha-visual-interaction-systems-design.md`
    et `docs/superpowers/plans/2026-04-18-ha-visual-interaction-systems.md`
- PHASE 9 (partielle) : import JSON mergé dans la PR #3
- POC `/ha-test` validé live : 2107 entités HA + toggles OK
- Validation live end-to-end PHASE 5/5.1/5.2/6 contre `homeassistant.lightshift.fr`
  via Chrome DevTools MCP : lampe Hue Spot 1 mappée, glow/light/couleur/
  brightness suivent HA en temps réel
- Collaborateur : `ttotttur` (frère) ajouté avec write access
- MCP `agentation` enregistré localement pour feedback visuel direct depuis
  l'app (server à lancer via `npx agentation-mcp server` sur port 4747)
- Prochaines étapes :
  - Ouvrir PR pour `feat/ha-brightness` (PHASE 5.2 + glow UI) → merge main
  - PHASE 7 : catalogue GLB (upload items custom) + `popup` actions
    (brightness slider, climate setpoint)
  - PHASE 8 : app kiosque (`apps/kiosk/`) pour tablette murale
  - PHASE 2 : `@maison-3d/glb-catalog` package (prérequis PHASE 7)
  - Extensions `cover` visual (volets animés) + `label` visual (affichage
    valeur sur thermostat) + visuel `unavailable` dédié

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
