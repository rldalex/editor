# Changelog

## [Unreleased]

### 2026-04-18 — feat (local uploads + site rename + Agentation wiring)

- `apps/editor/uploads/local-upload-handlers.ts` : handler local pour
  l'upload scan/floorplan (bouton "Upload scan/floorplan" du SitePanel).
  Crée un blob URL via `URL.createObjectURL(file)` + un `ScanNode`/
  `GuideNode` via `useScene.createNode`. `localDeleteAsset` revoke le
  blob URL. Câblé dans `app/page.tsx` via `sitePanelProps`.
- `apps/editor/ui-overrides/SiteRenameInjector.tsx` : override
  non-invasif pour renommer le nom du site. Pattern
  `MutationObserver` + `createPortal` (comme `HAMappingPanel`) —
  trouve le `<img alt="Site">` + son `<span>` voisin, ajoute la
  classe `group` sur le container, porte un bouton pencil + input
  inline. Même UX que `InlineRenameInput` Pascal (pencil sur hover,
  Enter sauve, Escape annule). Aucun fichier Pascal modifié.
- `apps/editor/app/layout.tsx` : prop `endpoint="http://localhost:4747"`
  sur `<Agentation />` — sans ça, les annotations du browser
  n'arrivaient pas dans le store MCP partagé. Les `agentation_*`
  tool calls Claude Code voyaient sessions vides malgré le webhook
  Auto-Send activé.
- `apps/editor/ha/components/HAMappingPanel.tsx` : retrait du texte
  "(light seule)" à côté de la case "non" du checkbox glow — le
  label affiche maintenant juste "oui" / "non".

### 2026-04-18 — feat (PHASE 5.2 + UI glow toggle)

- PHASE 5.2 : la lumière Pascal suit maintenant l'attribut `brightness`
  HA (0-255) en temps réel. `findToggleControlIndex` renommé/étendu en
  `findLightControls` qui retourne aussi le `sliderIndex` + bounds du
  control slider de l'asset (typiquement 0-100 pour un % dial).
  Nouveau `syncLightBrightness` dans `apps/editor/ha/systems/light-effect-sync.ts`
  qui normalise linéairement brightness HA → slider Pascal via
  `useInteractive.setControlValue`. Pascal's ItemLightSystem lit ce
  slider chaque frame pour lerp l'intensity du PointLight → suivi HA
  gratuit côté Pascal.
- UI : ajout d'un checkbox "Faire glow le mesh quand allumé" dans le
  panel HA Mapping, visible sous le select Visuel quand `kind:'emissive'`.
  Persisté comme `intensityOn: 1.5` (coché) / `0` (décoché). Permet de
  choisir light-only vs glow+light sans passer par la DevTools console.

### 2026-04-18 — feat (PHASE 5 + 5.1 + 6)

- PHASE 5.1 : `HAVisualSystem` pilote aussi les `LightEffect` Pascal
  existants. Quand l'asset d'un item mappé déclare un `interactive.effects`
  de `kind:'light'`, l'état HA `on/off` flippe le control `kind:'toggle'`
  correspondant via `useInteractive.setControlValue`, ce qui active la
  vraie `THREE.PointLight` de Pascal (la pièce est réellement éclairée,
  pas juste l'objet qui glow). Les deux sont indépendants : `intensityOn:0`
  donne light-only sans glow, un asset sans LightEffect donne glow-only.
  - `apps/editor/ha/systems/light-effect-sync.ts` : `findToggleControlIndex`
    + `syncLightEffect` + `syncLightColor` (no-op si l'asset n'a pas de
    LightEffect)
  - La couleur réelle de la lumière (PointLight Three.js) suit en live
    l'attribut `rgb_color` de l'entité HA. Mutation du
    `registration.effect.color` dans `useItemLightPool` (clone, pas
    mutation in-place de l'asset partagé). Pascal picks up au prochain
    pool reassignment (≤200ms ou mouvement caméra).
  - D-010 : ajout de `useItemLightPool` au barrel `@pascal-app/viewer`
    (2 lignes d'export, pas de logique touchée).
- PHASE 5 fix post-validation : boucle RAF persistente de `HAVisualSystem`
  qui ré-applique l'emissive à chaque frame. Pascal `<Clone>` de drei
  re-instancie les matériaux sur ses re-renders → nos mutations étaient
  silencieusement écrasées. `target-resolver.CLONED_FLAG` permet de
  détecter les swaps et re-cloner à la volée.
- PHASE 5 fix post-validation : bump `material.version` pour forcer le
  recompile du shader `MeshStandardNodeMaterial` (WebGPU/TSL). Sans ça la
  branche émissive était optimisée out au premier compile et les mutations
  `emissive.copy()` n'avaient aucun effet.
- PHASE 5 fix post-validation : retrait du guard `if (next === prev) return`
  dans le subscribe haStore — avec `fireImmediately:true`, Zustand passe
  `prev === next` au premier call, ce qui skippait l'apply initial.

### 2026-04-18 — feat (PHASE 5 + 6)

- PHASE 5 : `HAVisualSystem` — état HA live → `mesh.material.emissive` en
  temps réel. Subscribe Zustand par binding (pas de RAF continu),
  coalescing `invalidate()` via `queueMicrotask`, pending queue + polling
  500ms + abandon 30s pour rattraper le cas GLB pas chargé au mount,
  `reconcileMappings` pour réagir aux édits du panel sans remount.
  Clé de binding = `${nodeId}::${kind}::${entityId}` (supporte plusieurs
  bindings emissive par node).
  - `apps/editor/ha/systems/animation-manager.ts` : singleton RAF
    on/off avec cancel+replace (5 tests bun:test)
  - `apps/editor/ha/systems/mapping-registry.ts` : collect + reconcile
    partagés entre les 2 systems (8 tests bun:test)
  - `apps/editor/ha/systems/target-resolver.ts` : regex
    `/glow\|emissive\|_emit$/i` + fallback Group, clone matériau
    mesh-level pour isoler de `baseMaterial` / `glassMaterial` Pascal
  - `apps/editor/ha/systems/emissive-visual.ts` : pre-parse Color +
    apply + warn-once unavailable/unknown
  - `apps/editor/ha/systems/HAVisualSystem.tsx` : assemblage
- PHASE 6 : `HAInteractionSystem` — tap/long-press → actions HA.
  `toggle` (whitelist domain : light/switch/fan/cover/input_boolean/
  automation/group), `call_service` (paramétré). `popup`/`navigate`
  rejetés explicitement au registration avec `console.error` (une
  seule log par binding invalide, pas par tap). Long-press synthétisé
  500ms avec cancel sur `move > 8px`, multi-touch safe via
  `Map<pointerId, PressEntry>`. Feedback scale 1.0→1.05→1.0 en 150ms
  découplé de la confirmation HA. Debounce 300ms par
  `(nodeId, entityId, trigger)`.
  - `apps/editor/ha/systems/action-handlers.ts` : dispatcher +
    validateAction + shouldFire (9 tests bun:test)
  - `apps/editor/ha/systems/HAInteractionSystem.tsx` : assemblage
- `packages/ha-bridge/src/store.ts` : ajout du middleware
  `subscribeWithSelector` (rétro-compatible, nécessaire aux N-subscribes
  du HAVisualSystem avec `fireImmediately`).
- `apps/editor/package.json` : `@types/three` en devDep (pour les `import
  type { Mesh, Material }` dans `target-resolver.ts`).
- `apps/editor/ha/EditorWithHA.tsx` : monte `<HAVisualSystem />` +
  `<HAInteractionSystem />` siblings de `<HABootstrap />`.

### 2026-04-18 — feat

- PHASE 9 (partielle) : import JSON de scène. Pascal ship déjà
  `Export Scene (JSON)` dans la command palette (Ctrl/Cmd+K), il manquait
  le counterpart import.
  - `apps/editor/scene-io/import.ts` : `importSceneFromFile(file)` parse +
    `applySceneGraphToEditor`. `openImportDialog()` = file picker + confirm
    avant overwrite + alert sur erreur.
  - `apps/editor/scene-io/SceneIORegistration.tsx` : enregistre la commande
    `Import Scene (JSON)` dans la palette Pascal via `useCommandRegistry`.
  - Intégré dans `EditorWithHA.tsx`.
  - Les mappings HA (`node.metadata.ha`) roundtrip gratuitement puisque
    l'export Pascal sérialise `metadata`.

### 2026-04-17 — feat

- PHASE 4 : UI HA Mapping dans l'éditeur, intégrée au panel Pascal via portal.
  - `apps/editor/ha/suggest.ts` : `suggestDomain` (préfixes Blender), `scoreMatch`
    (domain bonus + token overlap normalisé), `suggestEntities` (tri top-N).
  - `apps/editor/ha/components/HAMappingPanel.tsx` : sections HA (Entité,
    Visuel, Action) rendues via `createPortal` DANS le body du `PanelWrapper`
    Pascal, à la suite des sections built-in (Position/Rotation/Scale/…).
    `MutationObserver` suit mount/unmount du panel Pascal. Design aligné
    sur les tokens Pascal (`bg-sidebar/95`, `border-border/50`, `text-foreground`).
    v1 = emissive + toggle ; cover/label/color et call_service/popup/navigate
    affichés mais désactivés ("bientôt").
  - `apps/editor/ha/EditorWithHA.tsx` : wrapper qui injecte `HABootstrap` +
    `HAMappingPanel` en siblings du `<Editor />` Pascal.
  - `apps/editor/app/page.tsx` : 1-liner swap `Editor` → `EditorWithHA`
    (documenté en D-009).
- PHASE 3 : schema TS + helpers pour le mapping HA stocké dans `node.metadata.ha`
  (`apps/editor/ha/schema.ts`, `apps/editor/ha/mapping-helpers.ts`). Types :
  `HAVisualMapping` (emissive/cover/label/color), `HAAction`
  (toggle/call_service/popup/navigate/none), `HAEntityBinding`, `HAMapping`.
  Helpers : `getHAMapping`, `setHAMapping`, `removeHAMapping`, `hasHAMapping`.
  Pas de Zod pour éviter une 2e modif de `apps/editor/package.json` (D-008).
- Bootstrap PHASE 0 : fork du repo Pascal Editor, remotes origin (rldalex) +
  upstream (pascalorg), fichiers meta (BRIEF/CLAUDE/DECISIONS/CHANGELOG),
  audit confirmé que `BaseNode.metadata` est bien le slot pour `metadata.ha`.
- PHASE 1 : package interne `@maison-3d/ha-bridge` (connectHA, disconnectHA,
  Zustand store, hooks `useHAConnection/useHAState(s)/useHAEntity/-ies`,
  helpers `callService/toggleEntity/turnOn/turnOff`) basé sur
  `home-assistant-js-websocket@^9.5`.
- POC `/ha-test` validé end-to-end contre `homeassistant.lightshift.fr` :
  2107 entités, 1303 états live, status connected, toggles fonctionnels.
- Découvertes : port dev réel = 3002 (pas 3000), `CLAUDE.md` Pascal était
  un symlink cassé vers `AGENTS.md` inexistant, autocrlf=false sur le repo
  pour éviter le bruit EOL Windows.

## Upstream sync
- Base : pascalorg/editor@3d1005847b8bd5fc72e0969d1cb107d8b0a2fd5a (fork initial 2026-04-17)
