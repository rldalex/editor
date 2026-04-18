# PHASE 2 — `@maison-3d/glb-catalog` : Design

**Date** : 2026-04-18
**Status** : Draft (à valider)
**Scope** : Package `@maison-3d/glb-catalog` + intégration sidebar editor (tab custom) + seed minimal (3 GLB). Prérequis pour PHASE 7 (popup HA custom + upload items).

---

## 1. Contexte

Pascal fournit un catalogue d'items built-in (`CATALOG_ITEMS` dans `packages/editor/src/components/ui/item-catalog/catalog-items.tsx` : tesla, pillar, fences…) exposé via le **mode "Furnish"** (toolbar Pascal). Cette liste est un **const statique** : impossible à étendre sans modifier Pascal.

Pour permettre à l'utilisateur d'importer ses propres GLB (luminaires, volets, thermostats…) et les mapper à des entités HA, on a besoin d'un catalogue custom **orthogonal** au catalogue Pascal, avec :
- Upload GLB drag-drop
- Persistence locale (IndexedDB)
- Thumbnails auto-générées
- Auto-détection catégorie + domain HA depuis la convention Blender (voir `apps/editor/ha/suggest.ts`)
- Édition métadonnées + suppression
- Intégration propre avec le pipeline de placement Pascal (réutilise `ItemNode.parse` + `useEditor.setSelectedItem`)

**Non-goal** : remplacer ou merger avec le catalogue Pascal. Les deux sources coexistent.

---

## 2. Objectifs / Non-objectifs

### Objectifs
- Package `@maison-3d/glb-catalog` Pascal-agnostic (pur storage + loader + thumbnails)
- Adapter `apps/editor/glb-catalog/` qui traduit `GLBAsset` → `AssetInput` Pascal
- Panel `<GLBCatalogPanel />` monté via l'API `sidebarTabs` publique de Pascal
- Upload drag-drop + auto-détection + thumbnail auto 512×512 WebP
- Edit modal : rename + category + suggestedHADomain + delete (avec warn si items en scène utilisent ce GLB)
- 3 seeds built-in ship dans `public/items/catalog-seed/`, fusionnés virtuellement, non-supprimables
- Zéro modification des fichiers Pascal (`packages/core`, `packages/viewer`, `packages/editor`)

### Non-objectifs (reportés)
- Édition scale/offset/rotation/attachTo (reste à l'auto-détection + valeurs par défaut). Reporté à PHASE 7+ si besoin.
- Sync cloud / multi-device.
- Catalogue partageable entre users.
- Search / tags avancés (filtre par catégorie suffit v1).
- Preview 3D interactive dans le catalog panel (thumbnail statique suffit).

---

## 3. Architecture

### 3.1 Vue d'ensemble

```
packages/glb-catalog/                    # NOUVEAU package
├── src/
│   ├── schema.ts                        # GLBAsset zod schema, Category, HADomainHint
│   ├── storage/
│   │   ├── indexeddb.ts                 # dexie schema + CRUD
│   │   └── seeds.ts                     # virtual merge des built-ins
│   ├── thumbnails/
│   │   ├── render.ts                    # WebGL2 offscreen renderer + bbox auto-frame
│   │   └── resize.ts                    # helper image→256×256 WebP (pour override user)
│   ├── detect/
│   │   ├── gltf-meshes.ts               # parse GLTF header, extract mesh names
│   │   └── resolve.ts                   # mesh-name-first + filename-fallback + uncategorized
│   ├── hooks/
│   │   └── use-catalog.ts               # subscribe dexie + seeds → list
│   ├── api.ts                           # uploadGLB, deleteGLB, updateGLB, getBlob, getThumbnail
│   └── index.ts                         # re-exports

apps/editor/glb-catalog/                 # NOUVEAU adapter côté app
├── GLBCatalogPanel.tsx                  # le panel sidebarTab (tile grid + upload zone)
├── CatalogTile.tsx                      # 1 item (thumbnail + name + badge category)
├── EditItemModal.tsx                    # modal d'édition (rename, category, domain, delete)
├── UploadZone.tsx                       # drag-drop + file picker + progress
├── to-asset-input.ts                    # GLBAsset → AssetInput (shape Pascal)
├── GLBCatalogBootstrap.tsx              # scan useScene + hydrate blob URLs depuis IndexedDB
├── asset-src-resolver.ts                # Map<id, blobUrl> ref-counted + getResolvedSrc()
├── renderers/
│   └── ItemRendererWrapper.tsx          # wrapper Pascal ItemRenderer qui resolve glb-catalog://
└── index.ts

apps/editor/app/page.tsx                 # EXTENDED : ajout de l'onglet { id: 'catalog', component: GLBCatalogPanel }

public/items/catalog-seed/               # NOUVEAU assets statiques ship
├── light-ceiling.glb
├── light-ceiling.thumb.webp             # thumbnail pré-générée (éviter overhead render au boot)
├── volet-simple.glb
├── volet-simple.thumb.webp
├── prise-simple.glb
└── prise-simple.thumb.webp
```

### 3.2 Principes de séparation

- **Package core Pascal-agnostic** : `@maison-3d/glb-catalog` ne dépend que de `three`, `dexie`, `zod`. Pas de Pascal, pas de React-Three-Fiber. Réutilisable hors Pascal.
- **Adapter séparé** : `apps/editor/glb-catalog/` tient le React, le pontage `AssetInput`, et l'UX Pascal-like (mêmes primitives shadcn/ui que HAMappingPanel).
- **Pas de dépendance circulaire** : le package ne sait pas que Pascal existe ; l'adapter import le package et traduit.

---

## 4. Data model

### 4.1 `GLBAsset` (stocké en IndexedDB)

```ts
export type Category =
  | 'light'
  | 'cover'
  | 'sensor'
  | 'furniture'
  | 'uncategorized'

export type HADomainHint =
  | 'light' | 'switch' | 'cover' | 'fan' | 'climate' | 'sensor' | null

export interface GLBAsset {
  id: string                       // nanoid 16 chars
  builtin: boolean                 // true = seed read-only ; false = user upload
  name: string                     // user-editable ; défaut = filename sans extension
  category: Category               // auto-detected, user-editable
  suggestedHADomain: HADomainHint  // auto-detected, user-editable
  filename: string                 // original drop filename (immutable)
  meshNames: string[]              // extracted at upload, used for HA entity suggestion later
  createdAt: number                // Date.now()
  updatedAt: number
  // Blob references via separate dexie tables (voir §5) pour perfs large files
}

export interface GLBAssetWithBlobs extends GLBAsset {
  glbBlob: Blob                    // le GLB brut
  thumbnailBlob: Blob              // WebP 256×256 (rendu stocké 512×512 pour HiDPI)
}
```

### 4.2 `CatalogItem` (shape virtuelle, merge seeds + custom)

```ts
export interface CatalogItem extends GLBAsset {
  blobUrl: string                  // URL.createObjectURL du glbBlob OU URL statique pour seeds
  thumbnailUrl: string             // idem pour thumb
}
```

`builtin: true` items ont `blobUrl = '/items/catalog-seed/light-ceiling.glb'` (URL relative servie depuis `public/`) et `thumbnailUrl = '/items/catalog-seed/light-ceiling.thumb.webp'`. Pas de `URL.createObjectURL`, pas d'entrée IndexedDB.

---

## 5. Storage (IndexedDB via dexie)

```ts
// packages/glb-catalog/src/storage/indexeddb.ts
import Dexie, { type EntityTable } from 'dexie'

class CatalogDB extends Dexie {
  assets!: EntityTable<GLBAsset, 'id'>
  blobs!: EntityTable<{ id: string; glb: Blob; thumb: Blob }, 'id'>

  constructor() {
    super('maison3d-glb-catalog')
    this.version(1).stores({
      assets: 'id, category, createdAt',   // indexes
      blobs: 'id',                         // id = même que assets (FK)
    })
  }
}
```

**Rationale deux tables** :
- `assets` reste léger (metadata only) → scans rapides pour list + filter
- `blobs` lazy-loaded uniquement au placement ou au preview (évite de pump ~50MB en RAM au boot)

**Seeds** : pas en IndexedDB. Servis depuis `public/items/catalog-seed/` via URLs statiques. Mergés virtuellement côté `useCatalog()`. Impossible à supprimer (pas d'entrée DB). Évite double-stockage et re-seed après delete volontaire.

---

## 6. API surface

### 6.1 `@maison-3d/glb-catalog`

```ts
// Exports depuis index.ts

// Types
export type { GLBAsset, CatalogItem, Category, HADomainHint }

// Hook React
export function useCatalog(filter?: { category?: Category }): {
  items: CatalogItem[]
  isLoading: boolean
}

// Async CRUD
export async function uploadGLB(file: File): Promise<GLBAsset>
// - Valide extension (.glb / .gltf)
// - Valide taille (< 200 MB, même limite que local-upload-handlers.ts)
// - Parse GLTF header → meshNames
// - Détecte category + suggestedHADomain via detect/resolve.ts
// - Rend thumbnail WebGL2 offscreen (spinner pendant ~300ms)
// - Écrit assets + blobs en IndexedDB
// - Retourne le GLBAsset stocké

export async function updateGLBMeta(
  id: string,
  patch: Partial<Pick<GLBAsset, 'name' | 'category' | 'suggestedHADomain'>>,
): Promise<void>
// Rejette si builtin

export async function replaceThumbnail(id: string, image: File): Promise<void>
// User override : resize 256×256 WebP, écrase thumb blob. Rejette si builtin.

export async function regenerateThumbnail(id: string): Promise<void>
// Re-run render auto. Rejette si builtin.

export async function deleteGLB(id: string): Promise<void>
// Rejette si builtin. Pas de cascade scene : les ItemNode Pascal gardent
// leur reference (asset.src sera un blob URL devenu dangling → Pascal
// affichera un fallback / nothing). Le check "combien d'items utilisent
// ce GLB ?" est fait au NIVEAU UI avant confirm dialog (voir §7.3).

// Utility
export function getBlobUrl(asset: CatalogItem): string
// URL.createObjectURL du cache interne (ref-counted pour éviter leak)
```

### 6.2 Adapter `apps/editor/glb-catalog/`

```ts
// to-asset-input.ts
import type { AssetInput } from '@pascal-app/core'
import type { CatalogItem } from '@maison-3d/glb-catalog'

export function toAssetInput(item: CatalogItem): AssetInput {
  return {
    id: item.id,
    category: mapToPascalCategory(item.category), // 'light' → 'appliance' etc. — mapping détaillé §11
    tags: [item.category, item.suggestedHADomain ?? 'unknown'].filter(Boolean),
    name: item.name,
    thumbnail: item.thumbnailUrl,
    src: item.blobUrl,
    scale: [1, 1, 1],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: [1, 1, 1], // placeholder ; Pascal calcule via GLTF loader si absent
    // attachTo: undefined → floating placement par défaut (voir §7.4)
  }
}
```

---

## 7. UX flows

### 7.1 Upload

1. User ouvre onglet **Catalogue** dans la sidebar Pascal
2. Au top du panel : zone drop + bouton "Upload GLB" (file picker fallback)
3. User drop 1 fichier `.glb` (validation extension + size 200MB max, comme `local-upload-handlers.ts`)
4. **Phase "preparing"** (< 50ms) : parse GLTF header offline → extrait `meshNames`
5. **Phase "detecting"** (< 10ms) : `resolve()` auto-détecte category + domain
6. **Phase "rendering"** (100-500ms, spinner visible) : WebGL2 offscreen render 512×512 → downsample WebP 256×256
7. **Phase "storing"** (< 50ms) : dexie put `assets` + `blobs`
8. Tile apparaît dans la grille, focus dessus, badge `Nouveau`

Si erreur (ex: fichier corrompu, WebGL2 unsupported) : toast inline dans la zone drop, pas de persistence.

### 7.2 Edit

1. User clique bouton crayon sur une tile OU double-clic sur la tile
2. Modal dialog `<EditItemModal>` :
   - Field `name` (text input)
   - Field `category` (select : light / cover / sensor / furniture / uncategorized)
   - Field `suggestedHADomain` (select : light / switch / cover / fan / climate / sensor / none)
   - Bouton "Re-générer thumbnail" (run render auto)
   - Bouton "Remplacer thumbnail" (file picker image → resize 256×256)
   - Bouton "Supprimer" (rouge, confirmation step §7.3)
   - "Enregistrer" / "Annuler"
3. Au changement de `category`, `suggestedHADomain` est pré-rempli avec la valeur évidente (light→light, cover→cover, etc.) MAIS éditable indépendamment après
4. Fields désactivés si `builtin: true` (seeds pas éditables), sauf bouton "Cloner comme custom" en bas (reporté à backlog)

### 7.3 Delete

1. Bouton rouge "Supprimer" dans Edit modal
2. Confirmation dialog :
   - "Supprimer `nom-du-glb` ?"
   - Check : combien de `ItemNode` dans `useScene` ont `metadata.glbSource === id` → affiché en orange : "**3 items de la scène utilisent ce GLB**. Ils deviendront invisibles."
   - Boutons "Supprimer quand même" / "Annuler"
3. Confirm → `deleteGLB(id)` → items en scène restent dans la DB mais leur `asset.src` pointe vers un blob URL révoqué. Pascal retombe sur son placeholder default.

### 7.4 Placement dans la scène

1. User clique une tile dans le panel Catalogue (pas le bouton edit)
2. Handler : `useEditor.getState().setSelectedItem(toAssetInput(item))`
3. User bascule en mode Furnish (ou est déjà dedans)
4. Pascal's placement-coordinator prend le relais : ghost preview sur grid, clic dans la scène pour poser
5. `ItemNode` créé avec `asset.src = "glb-catalog://<id>"` (scheme custom, **pas** un blob URL) + `metadata.glbSource = <id>` (source de vérité unique pour le link catalog↔scène). Voir §11.4 pour la résolution au render.

**Rationale `metadata.glbSource`** plutôt que `asset.id` : `asset.id` reste natif Pascal (ex: `'tesla'` pour les built-ins). `metadata.glbSource` est notre champ custom cohérent avec le pattern existant `metadata.ha` de PHASE 5/6. Le check delete §7.3 scan `node.metadata.glbSource === id`, **pas** `asset.id`.

---

## 8. Thumbnail rendering

### 8.1 Renderer WebGL2 offscreen

```ts
// packages/glb-catalog/src/thumbnails/render.ts
import { Box3, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const SIZE_INTERNAL = 512  // rendu HiDPI
const SIZE_STORED = 256    // downsample final (ou stocker 512 et downsample au display, voir §8.3)

export async function renderThumbnail(glbBlob: Blob): Promise<Blob> {
  const canvas = 'OffscreenCanvas' in window
    ? new OffscreenCanvas(SIZE_INTERNAL, SIZE_INTERNAL)
    : createDetachedCanvas(SIZE_INTERNAL, SIZE_INTERNAL)  // fallback main thread

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setClearColor(0x2c2c2e, 1)  // fond Pascal-like

  const scene = new Scene()
  const gltf = await new GLTFLoader().parseAsync(await glbBlob.arrayBuffer(), '')
  scene.add(gltf.scene)

  // Lighting standard : ambient + key light 3/4
  scene.add(new AmbientLight(0xffffff, 0.6))
  const key = new DirectionalLight(0xffffff, 0.8)
  key.position.set(2, 3, 2)
  scene.add(key)

  // Auto-frame via bounding box
  const bbox = new Box3().setFromObject(gltf.scene)
  const size = bbox.getSize(new Vector3())
  const center = bbox.getCenter(new Vector3())
  const diagonal = size.length()

  const camera = new PerspectiveCamera(40, 1, diagonal * 0.1, diagonal * 10)
  camera.position.set(
    center.x + diagonal * 1.0,
    center.y + diagonal * 0.8,
    center.z + diagonal * 1.3,
  )
  camera.lookAt(center)

  renderer.render(scene, camera)
  const rawBlob = await canvasToBlob(canvas, 'image/webp', 0.85)

  // Downsample 512 → 256 via OffscreenCanvas 2d ctx
  const down = await downsampleToWebp(rawBlob, SIZE_STORED, 0.85)

  renderer.dispose()
  return down
}
```

### 8.2 Fallback sans OffscreenCanvas

```ts
function createDetachedCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c  // jamais appended au DOM → detached
}
```

Bloque le main thread ~200-500ms. Acceptable : upload est une action explicite rare.

### 8.3 Format de stockage

- Stockage final : **WebP 256×256, qualité 0.85, ~15-25 KB/thumbnail**
- Rendu interne à 512×512 puis downsample : meilleure netteté sur display HiDPI (tablette Retina/AMOLED)
- Format WebP supporté nativement par tous les browsers Chromium (Fully Kiosk = OK)

### 8.4 Seeds : thumbnails pré-générées

Pour les 3 seeds built-in, on ship `light-ceiling.thumb.webp` (etc.) directement dans `public/items/catalog-seed/`. Évite de ré-exécuter le renderer au boot (performance + éviter un path de `render.ts` pour des assets statiques).

---

## 9. Seeds — stratégie virtual-merge

### 9.1 Contenu

3 GLB minimalistes modélisés en Blender (primitives default + baseMaterial blanc) avec des mesh names conventionnels, pour servir de **fixtures PHASE 5/6/7** aussi :

| Fichier | Mesh names | Category | HA domain |
|---------|------------|----------|-----------|
| `light-ceiling.glb` | `light_ceiling`, `glow_lampshade` | `light` | `light` |
| `volet-simple.glb` | `volet_cadre`, `volet_tablier_emit` | `cover` | `cover` |
| `prise-simple.glb` | `prise_socle`, `prise_led_emit` | `furniture` | `switch` |

(Naming double : `glow_*` et suffixe `_emit` déclenchent le matcher PHASE 5 `target-resolver.ts` regex `/glow|emissive|_emit$/i`. Les seeds servent donc aussi de fixtures emissive : même un volet peut être mappé à une visual emissive de debug.)

### 9.2 Merge logique

```ts
// packages/glb-catalog/src/storage/seeds.ts
const BUILTIN_SEEDS: GLBAsset[] = [
  {
    id: 'seed-light-ceiling',
    builtin: true,
    name: 'Lampe plafond (exemple)',
    category: 'light',
    suggestedHADomain: 'light',
    filename: 'light-ceiling.glb',
    meshNames: ['light_ceiling', 'glow_lampshade'],
    createdAt: 0,
    updatedAt: 0,
  },
  // ...
]

export function mergeWithSeeds(customAssets: GLBAsset[]): CatalogItem[] {
  const customs: CatalogItem[] = customAssets.map((a) => ({
    ...a,
    blobUrl: getBlobUrl(a),
    thumbnailUrl: getThumbUrl(a),
  }))
  const builtins: CatalogItem[] = BUILTIN_SEEDS.map((a) => ({
    ...a,
    blobUrl: `/items/catalog-seed/${a.filename}`,
    thumbnailUrl: `/items/catalog-seed/${a.filename.replace(/\.glb$/, '.thumb.webp')}`,
  }))
  return [...builtins, ...customs]
}
```

### 9.3 Non-suppressibilité

- `deleteGLB(id)` throw si `id` starts with `seed-`
- UI : bouton "Supprimer" grisé + tooltip "Les GLB built-in ne peuvent pas être supprimés"

---

## 10. Auto-détection

### 10.1 Ordre de précédence

1. **Mesh names** : on scanne les meshes du GLB dans l'ordre d'apparition, premier match gagne
2. **Filename fallback** : si aucun mesh ne match, on scanne le filename (sans extension)
3. **Rien** : `category: 'uncategorized'`, `suggestedHADomain: null`

### 10.2 Table de correspondance étendue

Extension de `apps/editor/ha/suggest.ts` — on **ajoute** une fonction `suggestCategoryAndDomain(name: string)` qui retourne `{ category: Category; domain: HADomainHint } | null`.

| Prefix | Category | HA domain |
|--------|----------|-----------|
| `light_`, `lampe_`, `lamp_` | `light` | `light` |
| `volet_`, `store_`, `cover_`, `rideau_` | `cover` | `cover` |
| `thermostat_`, `clim_`, `climate_`, `chauffage_` | `sensor` | `climate` |
| `prise_`, `switch_`, `plug_` | `furniture` | `switch` |
| `capteur_`, `sensor_` | `sensor` | `sensor` |
| `ventilo_`, `fan_` | `furniture` | `fan` |
| `tv_`, `media_`, `speaker_`, `enceinte_` | `furniture` | `null` (media_player pas dans le subset v1) |
| `porte_`, `fenetre_`, `fenêtre_`, `window_`, `door_` | `furniture` | `null` (binary_sensor pas dans le subset v1) |

**Ordre explicite dans le code** (spécifique → général) pour éviter les collisions (ex: `thermostat_` doit match avant `capteur_` hypothétique).

### 10.3 Rationale category ≠ domain

- `category` = **axe visuel/physique** pour le filtering UX (onglets "Lumières" / "Volets" dans le panel)
- `suggestedHADomain` = **axe HA** pour suggérer des entités au moment du mapping (HAMappingPanel)

Ex: une prise murale smart = `category: 'furniture'` (c'est un meuble) mais `suggestedHADomain: 'switch'` (c'est commandé comme un switch).

### 10.4 Réutilisation de `suggest.ts`

On garde le fichier existant intact et on **ajoute** dedans (même module) :

```ts
// apps/editor/ha/suggest.ts (extension, pas refactor)
const PREFIX_TO_CATEGORY_DOMAIN: Array<{
  prefixes: string[]
  category: Category
  domain: HADomainHint
}> = [ /* table §10.2 */ ]

export function suggestCategoryAndDomain(name: string): {
  category: Category
  domain: HADomainHint
} {
  const lower = name.toLowerCase()
  for (const entry of PREFIX_TO_CATEGORY_DOMAIN) {
    if (entry.prefixes.some((p) => lower.startsWith(p))) {
      return { category: entry.category, domain: entry.domain }
    }
  }
  return { category: 'uncategorized', domain: null }
}
```

Appelé par `packages/glb-catalog/src/detect/resolve.ts` via import croisé :

```ts
// packages/glb-catalog/src/detect/resolve.ts
import type { Category, HADomainHint } from '../schema'

// Injection d'API externe : le package glb-catalog reste Pascal-agnostic
export interface CategoryResolver {
  resolve(name: string): { category: Category; domain: HADomainHint }
}

export function resolveAssetMeta(
  meshNames: string[],
  filename: string,
  resolver: CategoryResolver,
): { category: Category; domain: HADomainHint; matchedFrom: 'mesh' | 'filename' | 'none' } {
  for (const mesh of meshNames) {
    const { category, domain } = resolver.resolve(mesh)
    if (category !== 'uncategorized') return { category, domain, matchedFrom: 'mesh' }
  }
  const baseName = filename.replace(/\.(glb|gltf)$/i, '')
  const { category, domain } = resolver.resolve(baseName)
  if (category !== 'uncategorized') return { category, domain, matchedFrom: 'filename' }
  return { category: 'uncategorized', domain: null, matchedFrom: 'none' }
}
```

L'adapter injecte `suggestCategoryAndDomain` comme `resolver`. Package reste Pascal-agnostic (juste une interface), règle d'orientation DI respectée.

---

## 11. Intégration Pascal

### 11.1 Sidebar tab registration

Dans `apps/editor/app/page.tsx` (notre code, pas Pascal) :

```tsx
import { GLBCatalogPanel } from '../glb-catalog/GLBCatalogPanel'

const SIDEBAR_TABS: (SidebarTab & { component: React.ComponentType })[] = [
  { id: 'site', label: 'Scene', component: () => null },
  { id: 'catalog', label: 'Catalogue', component: GLBCatalogPanel },
]
```

Pascal render ça nativement via `editor-layout-v2.tsx:207` — aucune modif Pascal.

### 11.2 Placement handoff

Au clic sur une tile :

```tsx
// GLBCatalogPanel.tsx
const handleTileClick = (item: CatalogItem) => {
  useEditor.getState().setSelectedItem(toAssetInput(item))
  // Optionnel : switcher en mode Furnish si pas déjà dedans
  // (à vérifier si Pascal le fait automatiquement au setSelectedItem)
}
```

### 11.3 Mapping category → Pascal `AssetInput['category']`

**Vérifié** : `AssetInput.category` est `z.string()` (schema `packages/core/src/schema/nodes/item.ts:79`) — pas d'enum fermé côté Pascal. Les valeurs observées dans `CATALOG_ITEMS` Pascal : `'outdoor'`, `'window'`, `'door'`, `'appliance'`, `'kitchen'`, etc.

Comme l'user accède à nos GLB via **notre** onglet Catalogue (pas via le mode Furnish Pascal), on veut **isoler complètement** nos GLB des tabs Pascal built-in. On set une valeur unique non-collisionnante :

```ts
toAssetInput(item).category = 'custom-glb'
```

Conséquence voulue : les GLB custom sont **invisibles depuis le Furnish mode Pascal** (aucune de ses tabs ne match `'custom-glb'`). Unique accès via notre onglet Catalogue. Pas de mélange de sources, pas de Tesla qui cohabite avec la lampe custom.

Notre vraie category reste visible via `tags: [item.category, item.suggestedHADomain ?? 'unknown']`, récupérable côté runtime si besoin.

### 11.4 Scene hydration (blob URLs volatiles) — **in-scope PHASE 2**

**Contrainte** : `URL.createObjectURL` produit un blob URL vivant **uniquement dans la session courante**. Si la scène Pascal est persistée avec `asset.src = "blob:http://..."`, le reload → URL dangling → Pascal tente de fetch une URL invalide → crash ou placeholder.

**Solution retenue** : scheme custom `glb-catalog://<id>` stocké en DB, résolu au render via wrapper.

#### 11.4.1 Au placement (write path)

```ts
toAssetInput(item).src = `glb-catalog://${item.id}`
// + metadata.glbSource = item.id sur le ItemNode au moment de createNode
```

La chaîne `glb-catalog://xyz` passe la validation zod `asset.src: z.string()` (c'est une string valide, juste un scheme non standard). Pascal persiste tel quel.

#### 11.4.2 Au render (read path) — `ItemRendererWrapper`

```tsx
// apps/editor/glb-catalog/renderers/ItemRendererWrapper.tsx
import { useAssetSrc } from '../asset-src-resolver'

export function ItemRendererWrapper({ node }: { node: ItemNode }) {
  const resolvedSrc = useAssetSrc(node.asset.src)  // resolve "glb-catalog://xyz" → "blob:http://.../abc"
  if (!resolvedSrc) return null  // pas encore hydraté, ou id inconnu → placeholder

  const patchedNode = { ...node, asset: { ...node.asset, src: resolvedSrc } }
  return <PascalItemRenderer node={patchedNode} />
}
```

Le wrapper est inséré dans le render pipeline Pascal via un mécanisme à investiguer — deux options :
- **Option 1** : Pascal expose un hook / registry type `registerItemRenderer(filter, component)` → on register notre wrapper pour les nodes dont `asset.src.startsWith('glb-catalog://')`. **À confirmer** en PHASE 2 impl.
- **Option 2** : si Pascal n'a pas d'API d'extension, on wrap le `<Viewer>` Pascal dans un component qui intercepte via React context ou via un override du ItemRenderer global. Plus invasif, à éviter.

Si aucune des deux options n'est propre, fallback : **patcher `asset.src` au moment du load via un `applySceneGraphToEditor` adapter** (notre code, pas Pascal). Pascal expose déjà `applySceneGraphToEditor` dans `@pascal-app/editor` (vu dans `index.tsx:22`). On wrappe ça pour résoudre les `glb-catalog://` URIs avant injection dans `useScene`.

#### 11.4.3 Bootstrap — `<GLBCatalogBootstrap />`

```tsx
// apps/editor/glb-catalog/GLBCatalogBootstrap.tsx
export function GLBCatalogBootstrap() {
  useEffect(() => {
    const unsub = useScene.subscribe((state) => {
      const neededIds = new Set<string>()
      for (const node of Object.values(state.nodes)) {
        const gsrc = node.metadata?.glbSource as string | undefined
        if (gsrc) neededIds.add(gsrc)
      }
      hydrateBlobUrls(neededIds)  // populate asset-src-resolver cache
    })
    return unsub
  }, [])
  return null
}
```

`hydrateBlobUrls(ids)` :
1. Fetch manquants depuis dexie
2. `URL.createObjectURL(blob)` pour chacun, stocke dans `Map<id, url>`
3. Ref-count : incr à chaque ItemNode qui référence, decr au unmount, `revokeObjectURL` quand count=0
4. Pour les `builtin: true` (seeds), pas de lookup IndexedDB → URL statique `/items/catalog-seed/...`

Monté dans `EditorWithHA` en sibling de `<HABootstrap />`.

#### 11.4.4 Décision sur l'approche de wrapping renderer

Le spec acte : **approche wrapper `applySceneGraphToEditor` adapter** (solution sans investigation Pascal incertaine). Flow :
1. Au boot, notre code appelle `applySceneGraphToEditor(sceneGraphAvecResolvedSrc)`
2. Pour chaque node à src `glb-catalog://xyz`, on remplace par le blob URL resolved
3. Pascal ne voit que des URLs valides, pas de modification de son render path

Au placement live (user clic tile), le blob URL est déjà vivant (hydrateBlobUrls l'a créé) → `setSelectedItem` passe le blob URL directement, et `metadata.glbSource` garde l'ID pour le check delete.

**Seul risque résiduel** : si l'user drag un item déjà en scène et que `commit` re-crée le node (voir `use-draft-node.ts` create mode), le node re-créé doit préserver `metadata.glbSource`. À vérifier que Pascal propage `metadata` intactement.

---

## 12. Modifications externes

- `apps/editor/app/page.tsx` : +1 entry dans `SIDEBAR_TABS` (déjà modifié récemment pour `sitePanelProps`)
- `apps/editor/ha/suggest.ts` : ajouter `suggestCategoryAndDomain()` (extension additive, pas de refactor)
- `apps/editor/package.json` : +1 dep `@maison-3d/glb-catalog` (workspace)
- **Zéro** modification `packages/core`, `packages/viewer`, `packages/editor`

---

## 13. Risks & open questions

1. **Mode Furnish automatique au `setSelectedItem`** — à vérifier en implémentation : est-ce que Pascal bascule tout seul ou faut-il `useEditor.setMode('furnish')` manuellement ?
2. **Propagation `metadata.glbSource` au re-create du draft node** — voir §11.4.4 dernier paragraphe. À tester sur `use-draft-node.ts` commit path (delete+recreate).
3. **Mécanisme d'extension du render pipeline Pascal** — §11.4.2 : preferred approach est l'adapter `applySceneGraphToEditor` au boot. Si le flow nécessite aussi une résolution live (ex: scene edits pendant la session), prévoir un wrapper renderer injecté ailleurs. À cadrer en début d'impl.
4. **OffscreenCanvas + WebGL2 sur iOS Safari** — pas bloquant puisque cible = Chrome desktop + Fully Kiosk Android. Fallback detached canvas suffit pour le dev Safari occasionnel.
5. **Limite IndexedDB** — ~50MB default sur Chrome sans prompt. 200MB/GLB max × ~100 items = hit quota fast. Mitigation : v1 pas de check proactif, v2 (PHASE 8+) ajouter métrique "Espace utilisé" dans le panel.
6. **GLTFLoader deps** — vérifier que `three/examples/jsm/loaders/GLTFLoader.js` est disponible dans le stack actuel (Pascal déjà l'utilise probablement)

---

## 14. Success criteria (acceptance v1)

- [ ] `bun install` ajoute `@maison-3d/glb-catalog` sans erreur
- [ ] `bun dev` tourne, onglet "Catalogue" visible dans la sidebar
- [ ] Au premier boot, 3 seeds s'affichent avec **leurs thumbnails chargées** (pas de placeholder cassé) depuis `/items/catalog-seed/*.thumb.webp`
- [ ] Drag-drop d'un `.glb` sur le panel → tile apparaît en < 1s avec thumbnail rendered, category + domain auto-détectés
- [ ] Clic sur une tile → `useEditor.selectedItem` set → Pascal en mode Furnish place l'item en scène
- [ ] Item placé en scène est rendu correctement (GLB chargé depuis blob URL resolved par `ItemRendererWrapper` / adapter `applySceneGraphToEditor`)
- [ ] **Reload test** : je place 3 items (1 seed, 2 custom), je reload la page → les 3 items réapparaissent au même endroit, rendus correctement (pas de placeholder dangling). Scène persiste cross-session.
- [ ] Edit modal permet rename, change category, change HA domain, supprimer (avec confirm + warn usage)
- [ ] Supprimer un GLB encore utilisé en scène → les `ItemNode` restent mais le rendu tombe sur placeholder (pas de crash)
- [ ] Les 3 seeds ne sont pas supprimables (bouton grisé)
- [ ] Typecheck passe (`turbo typecheck`)
- [ ] Bundle size de `@maison-3d/glb-catalog` < 50 KB gzipped (vérif en build)

---

## 15. Next steps

Après validation de ce spec → invoquer `superpowers:writing-plans` pour découper l'implémentation en tasks granulaires + ordre de dépendance.
