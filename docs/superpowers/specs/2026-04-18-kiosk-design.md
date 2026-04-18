# Kiosk app + enriched scene bundle — Design spec

> Scope : PHASE 8 (app tablette) + PHASE 9 enriched (bundle `.maison3d.zip` export/import) + prérequis refactor `@maison-3d/ha-systems`. Brainstorm approuvé (5 sections CLAUDE.md 2026-04-18).

## 1. Goal

Déployer sur une tablette murale Android (Fully Kiosk Browser) une vue 3D temps réel de la maison connectée à Home Assistant. Pas d'édition, pas de Pascal tools. L'utilisateur tape sur un objet → l'entité HA associée bascule.

Le bundle `.maison3d.zip` produit par l'éditeur est l'unique vecteur de transfert scène-→-kiosque : il doit contenir tout ce qu'il faut pour rejouer la scène sur un autre device (GLBs inclus).

## 2. Architecture

```
apps/
├── editor/           # Next.js 3002 (inchangé — on consomme juste ha-systems via package)
│   ├── ha/
│   │   ├── schema.ts, suggest.ts, mapping-helpers.ts
│   │   ├── components/HAMappingPanel.tsx
│   │   └── systems/ → MIGRE vers @maison-3d/ha-systems
│   └── scene-io/
│       ├── import.ts (existant, v1 JSON — KEEP)
│       ├── export-json.ts (existant — KEEP)
│       ├── bundle-export.ts (NEW — .maison3d.zip writer)
│       ├── bundle-import.ts (NEW — .maison3d.zip reader)
│       └── bundle-schema.ts (NEW — zod schema manifest.json)
├── kiosk/            # NEW — Next.js 3003
│   ├── app/
│   │   ├── layout.tsx, page.tsx
│   │   ├── wizard/ (HAConfig, SceneLoad, Ready)
│   │   └── viewer/KioskViewer.tsx
│   ├── components/overlays/ (Clock, HouseName, HAStatus, ResetCamera)
│   ├── state/ (kiosk-store, config-store)
│   └── bundle/ (bundle-loader wrapper autour de packages/scene-bundle)
└── …
packages/
├── ha-bridge/        # inchangé
├── glb-catalog/      # inchangé
├── ha-systems/       # NEW — extrait de apps/editor/ha/systems/
│   └── src/
│       ├── HAVisualSystem.tsx
│       ├── HAInteractionSystem.tsx
│       ├── mapping-registry.ts
│       ├── target-resolver.ts
│       ├── emissive-visual.ts
│       ├── light-effect-sync.ts
│       ├── action-handlers.ts
│       ├── animation-manager.ts
│       └── index.ts (barrel)
└── scene-bundle/     # NEW — lecteur/écrivain .maison3d.zip réutilisable
    └── src/
        ├── manifest-schema.ts (zod SceneBundleManifest v1)
        ├── writer.ts (scene+mappings+assets → Blob zip)
        ├── reader.ts (File/Blob zip → parsed bundle + IDB rehydrate)
        └── index.ts
```

**Décisions actées** :
- `apps/kiosk` = Next.js (pas Vite, pas route `/kiosk` dans editor). Raison : on partage déjà `packages/viewer` + `@pascal-app/core` dont Next.js se charge du transpile ; éviter de dupliquer cette config côté Vite.
- Port kiosk dev : **3003** (editor reste 3002).
- Package `@maison-3d/ha-systems` séparé de `@maison-3d/ha-bridge` : bridge = WebSocket + store, systems = composants R3F qui consomment le bridge. Deux responsabilités distinctes.
- Package `@maison-3d/scene-bundle` : la lecture/écriture est pure logique (zip, zod, `saveAsset`), partageable editor+kiosque.

## 3. Scene bundle format `.maison3d.zip`

Archive ZIP standard (via [fflate](https://github.com/101arrowz/fflate) — tree-shakable, ~8KB gzipped, pas de dépendance natives). Contenu :

```
scene.maison3d.zip
├── manifest.json        ← metadata + index des assets
├── scene.json           ← { nodes, rootNodeIds } (identique export JSON actuel)
├── ha-config.json       ← { url, lastValidated? } — sans le token
└── assets/
    ├── <uuid1>.glb      ← blobs des GLBs référencés par les ItemNodes
    ├── <uuid2>.glb
    └── thumbnails/
        └── <uuid1>.webp ← thumbs glb-catalog (optionnel)
```

**`manifest.json`** (zod validé à l'import) :

```ts
SceneBundleManifest = {
  version: 1,
  format: 'maison3d',
  createdAt: string (ISO),
  createdBy: { app: 'editor' | 'cli', version: string },
  scene: {
    nodeCount: number,
    rootCount: number,
    houseName?: string,          // affiché dans l'overlay kiosk
  },
  ha: {
    bindingCount: number,
    entities: string[],          // dédupliqué, pour sanity check côté kiosque
  },
  assets: Array<{
    uuid: string,                // = id asset Pascal, = nom fichier dans /assets
    path: string,                // ex: "assets/abc-123.glb"
    name: string,                // nom user-friendly (depuis glb-catalog)
    category?: string,           // depuis glb-catalog
    sizeBytes: number,
    thumbnail?: string,          // ex: "assets/thumbnails/abc-123.webp"
  }>,
}
```

**Règles** :
- Le token HA **n'est jamais** dans le bundle. Le kiosk a son propre token renseigné dans son wizard.
- Les assets référencés par la scène mais absents du ZIP → warning à l'import, pas une erreur. L'import ajoute les assets présents et log les manquants.
- Un asset dans le ZIP mais non référencé par la scène → silencieusement ignoré à l'import.
- L'import ZIP **réhydrate les `asset://uuid` dans l'IndexedDB Pascal** (`saveAsset(file, uuid)` si l'API l'accepte, sinon `saveAsset(file)` + patch des `node.asset.src`). À valider pendant l'implémentation.

## 4. Kiosk app

### 4.1 Bootstrap & wizard

Au premier boot (pas de config en `localStorage`) :

**Étape HAConfig** :
- Champs : URL HA (ex: `http://homeassistant.local:8123`), long-lived token (password field)
- Action "Tester" → appel `connectHA` ; si OK (status = `connected`), passe à l'étape suivante. Si fail, message inline.
- Persist : `localStorage` key `maison3d-kiosk:ha-config` = `{ url, token }`.

**Étape SceneLoad** :
- Zone drag-drop + bouton "Choisir un fichier" → accepte `.maison3d.zip`
- Affiche manifest resume (nodeCount, houseName, assetCount).
- Bouton "Charger" → `importBundle()` → hydrate IDB + `useScene` + passe à Ready.
- Persist : `localStorage` key `maison3d-kiosk:last-bundle-meta` = manifest résumé (pour recharger sans re-upload tant que l'IDB tient).

**Étape Ready** :
- Affiche Canvas kiosk plein écran.
- Bouton "Configuration" dans l'overlay pour revenir au wizard (remet config HA / re-upload bundle).

Le wizard est une simple state machine React (`'ha-config' | 'scene-load' | 'ready'`) dans `kiosk-store`. Pas de react-router (une seule "page" visible à la fois, simplicité).

### 4.2 Viewer

Canvas R3F plein écran. Utilise directement `<SceneRenderer>` de `@pascal-app/viewer` **en mode read-only** (pas de tools, pas de selection manager editor). Si Pascal n'expose pas de mode read-only via props, on monte juste `<Viewer>` sans l'EditorOverlay — à valider pendant l'implémentation.

**Systèmes montés** (depuis `@maison-3d/ha-systems`) :
- `<HAVisualSystem />` : applique emissive/color/brightness/cover sur les meshes mappés
- `<HAInteractionSystem scope="kiosk" />` : tap → exécute `tapAction` du binding. **Long-press désactivé en v1** (pas de popup, PHASE 7 différée). Le `scope` prop sert à no-op les actions `popup` côté kiosque (log warn-once par entité).

**Caméra** :
- Orbit libre (OrbitControls de drei ou `<CameraControls>` déjà utilisé par Pascal — check viewer-camera.tsx).
- Bouton flottant `⟲ Recadrer` (en bas à droite) → reset position/target vers vue par défaut (bounding box de la scène + offset).
- Position initiale par défaut : même logique que l'éditeur au premier load (centre scène + offset Y/Z).
- Pas de mode walkthrough en v1.

### 4.3 Overlays

Composants React absolute-positioned au-dessus du Canvas :

- **Clock** (top-left) : heure HH:MM, rafraîchit chaque seconde. Lit pas HA (pas besoin).
- **HouseName** (top-center) : nom depuis `manifest.scene.houseName`. Fallback : "Maison".
- **HAStatus** (top-right) : dot vert/orange/rouge + texte (`Connecté` / `Reconnexion…` / `Déconnecté`). Abonne à `useHAConnection()`.
- **ResetCamera button** (bottom-right) : icône ⟲, tap → reset caméra.
- **Config button** (bottom-left, discret) : icône ⚙, long-press → retour au wizard (évite les taps accidentels).

CSS Modules, pas de Tailwind (convention projet).

### 4.4 Performances

Cible : **30 FPS min** sur tablette Android moyenne gamme avec Fully Kiosk Browser.

- Preload GLBs à l'import bundle (pas à la demande), via `useGLTF.preload(url)` sur chaque asset `asset://uuid` résolu.
- Pas de post-processing en v1.
- Lazy wizard (dynamic import) → le bundle principal est juste Canvas + systems + overlays.

### 4.5 Config HA

`kiosk/state/config-store.ts` (Zustand avec `persist` middleware → localStorage) :

```ts
type KioskConfig = {
  ha: { url: string, token: string } | null
  bundleMeta: SceneBundleManifest | null   // last imported, pour affichage
  houseName: string | null                 // cache de manifest.scene.houseName
}
```

Pas chiffré (tablette dédiée, Fully Kiosk lui-même fait l'isolation). Ce n'est pas un secret SaaS.

## 5. Refactor : `@maison-3d/ha-systems`

**Migration path** :

1. Créer le package vide (scaffold comme `ha-bridge`).
2. Copier les 8 fichiers de `apps/editor/ha/systems/` dans `packages/ha-systems/src/`.
3. Adapter les imports : remplacer les imports depuis `@pascal-app/core`, `@pascal-app/editor`, `@maison-3d/ha-bridge` par les peer-dep équivalents.
4. Dans `apps/editor/ha/systems/index.ts`, remplacer les exports par un re-export de `@maison-3d/ha-systems` (transitoire, pour éviter de toucher tous les call-sites en une fois).
5. Ajouter `@maison-3d/ha-systems: workspace:*` à `apps/editor/package.json`.
6. Déplacer les tests (`*.test.ts`) avec les fichiers.
7. Une fois vert, supprimer les stubs d'`apps/editor/ha/systems/` et mettre à jour les call-sites directs.

**Peer-deps du package** :
- `react ^18 || ^19`, `react-dom`
- `three ^0.183`
- `@react-three/fiber`, `@react-three/drei`
- `@pascal-app/core`, `@pascal-app/viewer` (pour sceneRegistry, event bus, useInteractive)
- `@maison-3d/ha-bridge`

## 6. Testing strategy

**Unitaires** (bun test) :
- `packages/ha-systems/` : tests existants migrent (mapping-registry, action-handlers, animation-manager) + ajout coverage si gaps.
- `packages/scene-bundle/` : round-trip test — écrire un bundle, le relire, comparer nodes/mappings/assets bit-à-bit. Test de tolérance : asset manquant dans ZIP, asset surnuméraire, manifest invalide (zod error messages vérifiés).
- `apps/kiosk/state/config-store.test.ts` : persist/rehydrate.

**Intégration manuelle** :
- Export bundle depuis editor (3002) → download fichier.
- Import bundle sur kiosk (3003) dans un autre profil browser (simulation tablette) → vérifier scène rendue + HA connecté + tap toggle fonctionnel.
- Validation live contre `homeassistant.lightshift.fr` : au moins 1 light mappée, tap depuis kiosk → l'état réel change.

**Pas de e2e Playwright** en v1. Coût > bénéfice pour ce scope.

**Typecheck gate** : `turbo check-types` doit passer à chaque tâche (checklist CLAUDE.md).

## 7. Non-goals

- Long-press popups (PHASE 7 — différée).
- Multi-rooms / dashboard général.
- Édition depuis le kiosque.
- Auth multi-user (un device, un token).
- Sync temps réel du bundle editor→kiosque (pour l'instant, transfert manuel via download/upload ou partage réseau).
- PWA / offline-first au-delà de ce que Next.js fait par défaut.
- Deploiement Docker (PHASE kiosk deployment — out of scope de cette spec).

## 8. Open questions (à trancher à l'implémentation)

- **saveAsset avec uuid imposé** : est-ce que Pascal's `saveAsset(file)` permet de réutiliser un uuid existant, ou génère toujours un nouveau ? Si nouveau, il faut patcher `node.asset.src` dans le `scene.json` avec la nouvelle URL à l'import.
- **Pascal Viewer en mode read-only** : est-ce qu'il suffit de monter `<Viewer>` nu sans Editor, ou y a-t-il un prop/context à passer ? Regarder `packages/viewer/src/components/viewer/viewer.tsx`.
- **CameraControls vs OrbitControls** : aligner avec ce que l'editor utilise (pas de duplication).
- **Bundle size limit** : quid d'une maison avec 500MB de GLBs ? En v1, on accepte sans limite. Si problème perf au browser, ajouter un warning > 100MB.

## 9. Success criteria

- [ ] `turbo check-types` passe (tous packages).
- [ ] `turbo build` passe.
- [ ] Editor (`bun dev`) toujours fonctionnel, pas de régression HA.
- [ ] Bundle `.maison3d.zip` exportable depuis l'editor (bouton dans menu).
- [ ] Bundle importable sur kiosk ET sur editor (les deux chemins partagent `packages/scene-bundle`).
- [ ] Kiosk sur `localhost:3003` affiche la scène après wizard.
- [ ] Tap sur un mesh mappé → toggle HA confirmé en live.
- [ ] Overlay HA status reflète la connexion en temps réel.
- [ ] Reset camera fonctionne.
- [ ] Tests unitaires verts.
- [ ] CHANGELOG + DECISIONS mis à jour.
