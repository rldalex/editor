# PHASE 2 — `@maison-3d/glb-catalog` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a user-uploadable GLB catalogue (drag-drop, IndexedDB persistence, auto thumbnails, auto HA-domain detection) plugged into Pascal's editor sidebar as a new "Catalogue" tab.

**Architecture:** New workspace package `@maison-3d/glb-catalog` (Pascal-agnostic core: schema + storage + thumbnail render + auto-detect). Adapter layer in `apps/editor/glb-catalog/` (React UI + `AssetInput` conversion). Blob storage reuses Pascal's existing `asset://<uuid>` infrastructure (`saveAsset`/`loadAssetUrl` in `@pascal-app/core`), thumbnails + metadata in our own dexie DB. Pascal's `ItemRenderer` already patched (D-011) to resolve `asset://` via `useResolvedAssetUrl`.

**Tech Stack:** Bun, Turborepo, Next.js 16, React 19, TypeScript 5.9, zod 4, dexie 4, three r17x, `@pascal-app/core`/`viewer`/`editor`, Tailwind + shadcn/ui primitives (réutilisés depuis Pascal).

**Spec:** `docs/superpowers/specs/2026-04-18-glb-catalog-design.md`

---

## File structure

```
packages/glb-catalog/                             # NEW package
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                                  # re-exports
    ├── schema.ts                                 # zod schemas + type exports
    ├── storage/
    │   ├── db.ts                                 # dexie schema + CRUD
    │   └── seeds.ts                              # BUILTIN_SEEDS + merge
    ├── thumbnails/
    │   ├── render.ts                             # WebGL2 offscreen GLB → WebP
    │   └── resize.ts                             # image file → 256×256 WebP
    ├── detect/
    │   ├── gltf-meshes.ts                        # parse GLB → mesh names
    │   └── resolve.ts                            # resolveAssetMeta (DI resolver)
    ├── hooks/
    │   └── use-catalog.ts                        # subscribe dexie + seeds
    ├── api.ts                                    # uploadGLB, update, delete, etc.
    └── __tests__/
        ├── schema.test.ts
        ├── detect-resolve.test.ts
        └── seeds.test.ts

apps/editor/glb-catalog/                          # NEW adapter (apps/editor)
├── index.ts
├── to-asset-input.ts
├── category-resolver.ts                          # bridge vers apps/editor/ha/suggest.ts
├── GLBCatalogPanel.tsx                           # main panel (sidebar tab)
├── CatalogTile.tsx                               # 1 item tile
├── UploadZone.tsx                                # drag-drop + file picker
└── EditItemModal.tsx                             # edit metadata + delete

apps/editor/app/page.tsx                          # MODIFIED : +1 SIDEBAR_TABS entry
apps/editor/ha/suggest.ts                         # MODIFIED : +suggestCategoryAndDomain()
apps/editor/package.json                          # MODIFIED : +workspace dep

apps/editor/public/items/catalog-seed/            # NEW static assets (3 GLB + 3 thumbs)
├── light-ceiling.glb
├── light-ceiling.thumb.webp
├── volet-simple.glb
├── volet-simple.thumb.webp
├── prise-simple.glb
└── prise-simple.thumb.webp
```

---

## Task 1: Scaffold `@maison-3d/glb-catalog` package

**Files:**
- Create: `packages/glb-catalog/package.json`
- Create: `packages/glb-catalog/tsconfig.json`
- Create: `packages/glb-catalog/src/index.ts` (placeholder)
- Modify: `apps/editor/package.json` (add workspace dep)

- [ ] **Step 1: Create `packages/glb-catalog/package.json`**

```json
{
  "name": "@maison-3d/glb-catalog",
  "version": "0.1.0",
  "description": "GLB catalog package for Maison 3D fork — user uploads, thumbnails, auto HA-domain detection",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc --build",
    "dev": "tsc --build --watch",
    "check-types": "tsc --noEmit",
    "test": "bun test"
  },
  "peerDependencies": {
    "react": "^18 || ^19"
  },
  "dependencies": {
    "dexie": "^4",
    "nanoid": "^5",
    "three": "^0.180",
    "zod": "^4",
    "zustand": "^5"
  },
  "devDependencies": {
    "@pascal/typescript-config": "*",
    "@types/react": "^19.2.2",
    "@types/three": "^0.180",
    "typescript": "5.9.3"
  }
}
```

- [ ] **Step 2: Create `packages/glb-catalog/tsconfig.json`**

```json
{
  "extends": "@pascal/typescript-config/react-library.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false,
    "composite": true,
    "incremental": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "src/__tests__"]
}
```

- [ ] **Step 3: Create `packages/glb-catalog/src/index.ts` placeholder**

```ts
export {}
```

- [ ] **Step 4: Add workspace dep to `apps/editor/package.json`**

Locate the `"dependencies"` block and add this entry (alphabetical order — just before `"@maison-3d/ha-bridge"`):
```json
"@maison-3d/glb-catalog": "workspace:*",
```

- [ ] **Step 5: Run `bun install`**

```
bun install
```
Expected: installs dexie, nanoid, three, and links the workspace package. No errors.

- [ ] **Step 6: Verify typecheck**

```
cd packages/glb-catalog && bun x tsc --build
```
Expected: no errors, `dist/index.d.ts` + `dist/index.js` emitted.

- [ ] **Step 7: Commit**

```
git add packages/glb-catalog/ apps/editor/package.json bun.lock
git commit -m "chore(glb-catalog): scaffold package skeleton"
```

---

## Task 2: Schema + types (TDD)

**Files:**
- Create: `packages/glb-catalog/src/schema.ts`
- Create: `packages/glb-catalog/src/__tests__/schema.test.ts`

- [ ] **Step 1: Write failing test `schema.test.ts`**

```ts
import { describe, expect, test } from 'bun:test'
import {
  Category,
  GLBAsset,
  HADomainHint,
} from '../schema'

describe('Category', () => {
  test('accepts all valid categories', () => {
    for (const v of ['light', 'cover', 'sensor', 'furniture', 'uncategorized']) {
      expect(() => Category.parse(v)).not.toThrow()
    }
  })
  test('rejects unknown category', () => {
    expect(() => Category.parse('appliance')).toThrow()
  })
})

describe('HADomainHint', () => {
  test('accepts all domain hints + null', () => {
    for (const v of ['light', 'switch', 'cover', 'fan', 'climate', 'sensor', null]) {
      expect(() => HADomainHint.parse(v)).not.toThrow()
    }
  })
  test('rejects unknown domain', () => {
    expect(() => HADomainHint.parse('media_player')).toThrow()
  })
})

describe('GLBAsset', () => {
  test('parses a minimal valid asset', () => {
    const parsed = GLBAsset.parse({
      id: 'abc123',
      builtin: false,
      name: 'Test',
      category: 'light',
      suggestedHADomain: 'light',
      filename: 'test.glb',
      meshNames: ['light_a'],
      pascalAssetUrl: 'asset://uuid-xyz',
      createdAt: 0,
      updatedAt: 0,
    })
    expect(parsed.id).toBe('abc123')
  })
  test('rejects missing required fields', () => {
    expect(() => GLBAsset.parse({ id: 'abc' })).toThrow()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```
cd packages/glb-catalog && bun test
```
Expected: FAIL with "Cannot find module '../schema'" or similar.

- [ ] **Step 3: Implement `schema.ts`**

```ts
import { z } from 'zod'

export const Category = z.enum([
  'light',
  'cover',
  'sensor',
  'furniture',
  'uncategorized',
])
export type Category = z.infer<typeof Category>

export const HADomainHint = z.union([
  z.enum(['light', 'switch', 'cover', 'fan', 'climate', 'sensor']),
  z.null(),
])
export type HADomainHint = z.infer<typeof HADomainHint>

export const GLBAsset = z.object({
  id: z.string(),
  builtin: z.boolean(),
  name: z.string(),
  category: Category,
  suggestedHADomain: HADomainHint,
  filename: z.string(),
  meshNames: z.array(z.string()),
  pascalAssetUrl: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type GLBAsset = z.infer<typeof GLBAsset>

export interface CatalogItem extends GLBAsset {
  thumbnailUrl: string
}
```

- [ ] **Step 4: Run test, verify pass**

```
cd packages/glb-catalog && bun test
```
Expected: 6 pass.

- [ ] **Step 5: Commit**

```
git add packages/glb-catalog/src/schema.ts packages/glb-catalog/src/__tests__/schema.test.ts
git commit -m "feat(glb-catalog): add schema + types (GLBAsset, Category, HADomainHint)"
```

---

## Task 3: Extend `apps/editor/ha/suggest.ts` with `suggestCategoryAndDomain()` (TDD)

**Files:**
- Modify: `apps/editor/ha/suggest.ts` (append)
- Create: `apps/editor/ha/suggest-category.test.ts`

- [ ] **Step 1: Write failing test `suggest-category.test.ts`**

```ts
import { describe, expect, test } from 'bun:test'
import { suggestCategoryAndDomain } from './suggest'

describe('suggestCategoryAndDomain', () => {
  test('light_ prefix → light category + light domain', () => {
    expect(suggestCategoryAndDomain('light_salon')).toEqual({
      category: 'light',
      domain: 'light',
    })
  })
  test('volet_ prefix → cover + cover', () => {
    expect(suggestCategoryAndDomain('volet_cuisine')).toEqual({
      category: 'cover',
      domain: 'cover',
    })
  })
  test('thermostat_ prefix matches before capteur_ hypothetical', () => {
    expect(suggestCategoryAndDomain('thermostat_salon')).toEqual({
      category: 'sensor',
      domain: 'climate',
    })
  })
  test('prise_ prefix → furniture + switch (divergence category/domain)', () => {
    expect(suggestCategoryAndDomain('prise_bureau')).toEqual({
      category: 'furniture',
      domain: 'switch',
    })
  })
  test('media_ prefix → furniture + null (subset v1 exclut media_player)', () => {
    expect(suggestCategoryAndDomain('media_tv')).toEqual({
      category: 'furniture',
      domain: null,
    })
  })
  test('unknown prefix → uncategorized + null', () => {
    expect(suggestCategoryAndDomain('unknown_foo')).toEqual({
      category: 'uncategorized',
      domain: null,
    })
  })
  test('case-insensitive', () => {
    expect(suggestCategoryAndDomain('LIGHT_SALON')).toEqual({
      category: 'light',
      domain: 'light',
    })
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```
cd apps/editor && bun test ha/suggest-category.test.ts
```
Expected: FAIL with "suggestCategoryAndDomain is not exported from './suggest'".

- [ ] **Step 3: Extend `apps/editor/ha/suggest.ts`**

Append at the end of the file (keep existing exports untouched):

```ts
// --- PHASE 2 glb-catalog : auto-détection category + domain from mesh/filename ---

/**
 * Category used by @maison-3d/glb-catalog. Duplicated here to avoid a workspace
 * cycle (glb-catalog will import `suggestCategoryAndDomain` via a DI wrapper).
 * Must stay in sync with `Category` in `@maison-3d/glb-catalog/src/schema.ts`.
 */
type Category = 'light' | 'cover' | 'sensor' | 'furniture' | 'uncategorized'
type HADomainHint = 'light' | 'switch' | 'cover' | 'fan' | 'climate' | 'sensor' | null

const PREFIX_TO_CATEGORY_DOMAIN: Array<{
  prefixes: string[]
  category: Category
  domain: HADomainHint
}> = [
  // Order matters: specific before generic.
  { prefixes: ['thermostat_', 'clim_', 'climate_', 'chauffage_'], category: 'sensor', domain: 'climate' },
  { prefixes: ['light_', 'lampe_', 'lamp_'], category: 'light', domain: 'light' },
  { prefixes: ['volet_', 'store_', 'cover_', 'rideau_'], category: 'cover', domain: 'cover' },
  { prefixes: ['prise_', 'switch_', 'plug_'], category: 'furniture', domain: 'switch' },
  { prefixes: ['capteur_', 'sensor_'], category: 'sensor', domain: 'sensor' },
  { prefixes: ['ventilo_', 'fan_'], category: 'furniture', domain: 'fan' },
  { prefixes: ['tv_', 'media_', 'speaker_', 'enceinte_'], category: 'furniture', domain: null },
  { prefixes: ['porte_', 'fenetre_', 'fenêtre_', 'window_', 'door_'], category: 'furniture', domain: null },
]

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

- [ ] **Step 4: Run test, verify pass**

```
cd apps/editor && bun test ha/suggest-category.test.ts
```
Expected: 7 pass.

- [ ] **Step 5: Commit**

```
git add apps/editor/ha/suggest.ts apps/editor/ha/suggest-category.test.ts
git commit -m "feat(ha): extend suggest.ts with suggestCategoryAndDomain for glb-catalog"
```

---

## Task 4: Mesh name extraction from GLB (TDD with fixture)

**Files:**
- Create: `packages/glb-catalog/src/detect/gltf-meshes.ts`
- Create: `packages/glb-catalog/src/__tests__/fixtures/mini.glb` (binary, voir step 1)
- Create: `packages/glb-catalog/src/__tests__/detect-gltf-meshes.test.ts`

- [ ] **Step 1: Generate a minimal GLB fixture**

Use an inline script to create a minimal GLB with 2 named meshes. Save as `src/__tests__/fixtures/mini.glb`.

```
cd packages/glb-catalog && mkdir -p src/__tests__/fixtures && node -e "
const { Buffer } = require('buffer')
const fs = require('fs')

// Minimal GLB with 2 meshes named 'light_test' and 'glow_part'
const json = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0, 1] }],
  nodes: [
    { name: 'light_test', mesh: 0 },
    { name: 'glow_part', mesh: 0 },
  ],
  meshes: [{
    primitives: [{ attributes: { POSITION: 0 }, mode: 0 }],
  }],
  accessors: [{ componentType: 5126, count: 1, type: 'VEC3', bufferView: 0 }],
  bufferViews: [{ buffer: 0, byteLength: 12, byteOffset: 0 }],
  buffers: [{ byteLength: 12 }],
}
const jsonStr = JSON.stringify(json)
const jsonBuf = Buffer.from(jsonStr.padEnd(Math.ceil(jsonStr.length / 4) * 4, ' '))
const binBuf = Buffer.alloc(12) // 12 bytes of zeros (1 vec3)

const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0)       // magic 'glTF'
header.writeUInt32LE(2, 4)                 // version
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8)

const jsonChunkHeader = Buffer.alloc(8)
jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0)
jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4) // 'JSON'

const binChunkHeader = Buffer.alloc(8)
binChunkHeader.writeUInt32LE(binBuf.length, 0)
binChunkHeader.writeUInt32LE(0x004e4942, 4)  // 'BIN'

fs.writeFileSync(
  'src/__tests__/fixtures/mini.glb',
  Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binBuf]),
)
console.log('mini.glb written')
"
```

- [ ] **Step 2: Write failing test `detect-gltf-meshes.test.ts`**

```ts
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { extractMeshNames } from '../detect/gltf-meshes'

describe('extractMeshNames', () => {
  test('extracts mesh names from GLB fixture', async () => {
    const buf = readFileSync(
      new URL('./fixtures/mini.glb', import.meta.url),
    )
    const blob = new Blob([buf])
    const names = await extractMeshNames(blob)
    expect(names).toContain('light_test')
    expect(names).toContain('glow_part')
  })
  test('returns [] for non-GLB blob', async () => {
    const blob = new Blob(['not a glb'])
    const names = await extractMeshNames(blob)
    expect(names).toEqual([])
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

```
cd packages/glb-catalog && bun test detect-gltf-meshes
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 4: Implement `detect/gltf-meshes.ts`**

```ts
/**
 * Parse a GLB blob header to extract node/mesh names without loading meshes
 * into Three.js. Reads the GLTF JSON chunk only.
 *
 * Returns names in scene-tree order (depth-first traversal).
 * Returns [] on parse error or non-GLB blob.
 */
export async function extractMeshNames(blob: Blob): Promise<string[]> {
  try {
    const buf = await blob.arrayBuffer()
    const view = new DataView(buf)

    // GLB magic = 'glTF' = 0x46546c67 (little-endian read)
    if (view.getUint32(0, true) !== 0x46546c67) return []
    if (view.getUint32(4, true) !== 2) return []

    // First chunk after 12-byte header
    const jsonChunkLength = view.getUint32(12, true)
    const jsonChunkType = view.getUint32(16, true)
    if (jsonChunkType !== 0x4e4f534a) return [] // 'JSON'

    const jsonBytes = new Uint8Array(buf, 20, jsonChunkLength)
    const jsonStr = new TextDecoder().decode(jsonBytes)
    const gltf = JSON.parse(jsonStr) as {
      nodes?: Array<{ name?: string; mesh?: number }>
      meshes?: Array<{ name?: string }>
    }

    const names: string[] = []
    for (const node of gltf.nodes ?? []) {
      if (node.name && typeof node.mesh === 'number') names.push(node.name)
    }
    for (const mesh of gltf.meshes ?? []) {
      if (mesh.name) names.push(mesh.name)
    }
    // De-dup while preserving order
    return [...new Set(names)]
  } catch {
    return []
  }
}
```

- [ ] **Step 5: Run test, verify pass**

```
cd packages/glb-catalog && bun test detect-gltf-meshes
```
Expected: 2 pass.

- [ ] **Step 6: Commit**

```
git add packages/glb-catalog/src/detect/gltf-meshes.ts packages/glb-catalog/src/__tests__/detect-gltf-meshes.test.ts packages/glb-catalog/src/__tests__/fixtures/mini.glb
git commit -m "feat(glb-catalog): parse GLB header to extract mesh/node names"
```

---

## Task 5: Detection resolver (DI, TDD)

**Files:**
- Create: `packages/glb-catalog/src/detect/resolve.ts`
- Create: `packages/glb-catalog/src/__tests__/detect-resolve.test.ts`

- [ ] **Step 1: Write failing test `detect-resolve.test.ts`**

```ts
import { describe, expect, test } from 'bun:test'
import { resolveAssetMeta, type CategoryResolver } from '../detect/resolve'

const fakeResolver: CategoryResolver = {
  resolve: (name) => {
    if (name.startsWith('light_')) return { category: 'light', domain: 'light' }
    if (name.startsWith('volet_')) return { category: 'cover', domain: 'cover' }
    return { category: 'uncategorized', domain: null }
  },
}

describe('resolveAssetMeta', () => {
  test('mesh names first, filename ignored when mesh matches', () => {
    const r = resolveAssetMeta(['light_test', 'glow_part'], 'unrelated.glb', fakeResolver)
    expect(r).toEqual({ category: 'light', domain: 'light', matchedFrom: 'mesh' })
  })
  test('filename fallback when no mesh matches', () => {
    const r = resolveAssetMeta(['Cube.001'], 'volet-cuisine.glb', fakeResolver)
    expect(r).toEqual({ category: 'cover', domain: 'cover', matchedFrom: 'filename' })
  })
  test('strips .glb extension from filename', () => {
    const r = resolveAssetMeta([], 'light_suspendu.glb', fakeResolver)
    expect(r.category).toBe('light')
  })
  test('strips .gltf extension too', () => {
    const r = resolveAssetMeta([], 'light_suspendu.gltf', fakeResolver)
    expect(r.category).toBe('light')
  })
  test('uncategorized when nothing matches', () => {
    const r = resolveAssetMeta(['foo'], 'bar.glb', fakeResolver)
    expect(r).toEqual({ category: 'uncategorized', domain: null, matchedFrom: 'none' })
  })
})
```

- [ ] **Step 2: Run test, verify fail**

```
cd packages/glb-catalog && bun test detect-resolve
```

- [ ] **Step 3: Implement `detect/resolve.ts`**

```ts
import type { Category, HADomainHint } from '../schema'

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
    if (category !== 'uncategorized') {
      return { category, domain, matchedFrom: 'mesh' }
    }
  }
  const baseName = filename.replace(/\.(glb|gltf)$/i, '')
  const { category, domain } = resolver.resolve(baseName)
  if (category !== 'uncategorized') {
    return { category, domain, matchedFrom: 'filename' }
  }
  return { category: 'uncategorized', domain: null, matchedFrom: 'none' }
}
```

- [ ] **Step 4: Run test, verify pass**

```
cd packages/glb-catalog && bun test detect-resolve
```
Expected: 5 pass.

- [ ] **Step 5: Commit**

```
git add packages/glb-catalog/src/detect/resolve.ts packages/glb-catalog/src/__tests__/detect-resolve.test.ts
git commit -m "feat(glb-catalog): detection resolver (mesh-first + filename fallback)"
```

---

## Task 6: Seeds + virtual merge (TDD)

**Files:**
- Create: `packages/glb-catalog/src/storage/seeds.ts`
- Create: `packages/glb-catalog/src/__tests__/seeds.test.ts`

- [ ] **Step 1: Write failing test `seeds.test.ts`**

```ts
import { describe, expect, test } from 'bun:test'
import { BUILTIN_SEEDS, mergeWithSeeds } from '../storage/seeds'

describe('BUILTIN_SEEDS', () => {
  test('has 3 seeds all marked builtin', () => {
    expect(BUILTIN_SEEDS.length).toBe(3)
    for (const s of BUILTIN_SEEDS) {
      expect(s.builtin).toBe(true)
      expect(s.id).toMatch(/^seed-/)
    }
  })
  test('covers light, cover, furniture categories', () => {
    const cats = BUILTIN_SEEDS.map((s) => s.category)
    expect(cats).toContain('light')
    expect(cats).toContain('cover')
    expect(cats).toContain('furniture')
  })
})

describe('mergeWithSeeds', () => {
  test('prepends builtins before customs', () => {
    const merged = mergeWithSeeds([])
    expect(merged.length).toBe(3)
    expect(merged.every((m) => m.builtin)).toBe(true)
  })
  test('customs appear after builtins', () => {
    const custom = {
      id: 'custom-1',
      builtin: false,
      name: 'Custom',
      category: 'light' as const,
      suggestedHADomain: 'light' as const,
      filename: 'x.glb',
      meshNames: [],
      pascalAssetUrl: 'asset://uuid',
      createdAt: 1,
      updatedAt: 1,
    }
    const merged = mergeWithSeeds([custom], (asset) => `/thumb/${asset.id}.webp`)
    expect(merged.length).toBe(4)
    expect(merged[3].id).toBe('custom-1')
    expect(merged[3].thumbnailUrl).toBe('/thumb/custom-1.webp')
  })
  test('builtin thumbnailUrl is empty (overridden at runtime by useCatalog)', () => {
    const merged = mergeWithSeeds([])
    for (const s of merged) {
      expect(s.thumbnailUrl).toBe('')
    }
  })
})
```

- [ ] **Step 2: Run test, verify fail**

```
cd packages/glb-catalog && bun test seeds
```

- [ ] **Step 3: Implement `storage/seeds.ts`**

```ts
import type { CatalogItem, GLBAsset } from '../schema'

const SEED_DIR = '/items/catalog-seed'

export const BUILTIN_SEEDS: GLBAsset[] = [
  {
    id: 'seed-light-ceiling',
    builtin: true,
    name: 'Lampe plafond (exemple)',
    category: 'light',
    suggestedHADomain: 'light',
    filename: 'light-ceiling.glb',
    meshNames: ['light_ceiling', 'glow_lampshade'],
    pascalAssetUrl: `${SEED_DIR}/light-ceiling.glb`,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'seed-volet-simple',
    builtin: true,
    name: 'Volet simple (exemple)',
    category: 'cover',
    suggestedHADomain: 'cover',
    filename: 'volet-simple.glb',
    meshNames: ['volet_cadre', 'volet_tablier_emit'],
    pascalAssetUrl: `${SEED_DIR}/volet-simple.glb`,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'seed-prise-simple',
    builtin: true,
    name: 'Prise simple (exemple)',
    category: 'furniture',
    suggestedHADomain: 'switch',
    filename: 'prise-simple.glb',
    meshNames: ['prise_socle', 'prise_led_emit'],
    pascalAssetUrl: `${SEED_DIR}/prise-simple.glb`,
    createdAt: 0,
    updatedAt: 0,
  },
]

/**
 * Merge built-in seeds with user-uploaded customs. Builtins first, then customs
 * in input order. Each item gains a `thumbnailUrl`:
 *   - seed → `/items/catalog-seed/<filename>.thumb.webp`
 *   - custom → resolved via `thumbnailUrlForAsset(asset)` (typically a blob URL)
 */
export function mergeWithSeeds(
  customs: GLBAsset[],
  thumbnailUrlForAsset: (asset: GLBAsset) => string = () => '',
): CatalogItem[] {
  const builtins: CatalogItem[] = BUILTIN_SEEDS.map((a) => ({
    ...a,
    // Builtin thumbnails sont générés au runtime via ensureSeedThumbnails()
    // et injectés par useCatalog en override. Placeholder vide ici.
    thumbnailUrl: '',
  }))
  const custom: CatalogItem[] = customs.map((a) => ({
    ...a,
    thumbnailUrl: thumbnailUrlForAsset(a),
  }))
  return [...builtins, ...custom]
}
```

- [ ] **Step 4: Run test, verify pass**

```
cd packages/glb-catalog && bun test seeds
```
Expected: 5 pass.

- [ ] **Step 5: Commit**

```
git add packages/glb-catalog/src/storage/seeds.ts packages/glb-catalog/src/__tests__/seeds.test.ts
git commit -m "feat(glb-catalog): BUILTIN_SEEDS + mergeWithSeeds"
```

---

## Task 7: IndexedDB storage (dexie)

**Files:**
- Create: `packages/glb-catalog/src/storage/db.ts`

No unit test : dexie requires a real IDB (fake-indexeddb would add deps for little gain v1). Covered by the integration smoke test in Task 15.

- [ ] **Step 1: Implement `storage/db.ts`**

```ts
import Dexie, { type EntityTable } from 'dexie'
import type { GLBAsset } from '../schema'

interface ThumbnailRow {
  id: string // FK vers GLBAsset.id
  thumb: Blob
}

class CatalogDB extends Dexie {
  assets!: EntityTable<GLBAsset, 'id'>
  thumbnails!: EntityTable<ThumbnailRow, 'id'>

  constructor() {
    super('maison3d-glb-catalog')
    this.version(1).stores({
      assets: 'id, category, createdAt',
      thumbnails: 'id',
    })
  }
}

let _db: CatalogDB | null = null

export function getDB(): CatalogDB {
  if (!_db) _db = new CatalogDB()
  return _db
}

// --- Low-level CRUD ---

export async function dbListAssets(): Promise<GLBAsset[]> {
  return getDB().assets.orderBy('createdAt').toArray()
}

export async function dbGetAsset(id: string): Promise<GLBAsset | undefined> {
  return getDB().assets.get(id)
}

export async function dbPutAsset(asset: GLBAsset, thumb: Blob): Promise<void> {
  const db = getDB()
  await db.transaction('rw', db.assets, db.thumbnails, async () => {
    await db.assets.put(asset)
    await db.thumbnails.put({ id: asset.id, thumb })
  })
}

export async function dbUpdateAsset(
  id: string,
  patch: Partial<GLBAsset>,
): Promise<void> {
  await getDB().assets.update(id, { ...patch, updatedAt: Date.now() })
}

export async function dbReplaceThumbnail(id: string, thumb: Blob): Promise<void> {
  await getDB().thumbnails.put({ id, thumb })
}

export async function dbDeleteAsset(id: string): Promise<void> {
  const db = getDB()
  await db.transaction('rw', db.assets, db.thumbnails, async () => {
    await db.assets.delete(id)
    await db.thumbnails.delete(id)
  })
}

export async function dbGetThumbnail(id: string): Promise<Blob | undefined> {
  const row = await getDB().thumbnails.get(id)
  return row?.thumb
}
```

- [ ] **Step 2: Typecheck**

```
cd packages/glb-catalog && bun x tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add packages/glb-catalog/src/storage/db.ts
git commit -m "feat(glb-catalog): dexie schema + low-level CRUD"
```

---

## Task 8: Thumbnail renderer (WebGL2 offscreen)

**Files:**
- Create: `packages/glb-catalog/src/thumbnails/render.ts`
- Create: `packages/glb-catalog/src/thumbnails/resize.ts`

No unit test : exercises GPU APIs not available in bun. Covered by smoke test Task 15.

- [ ] **Step 1: Implement `thumbnails/render.ts`**

```ts
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const SIZE_INTERNAL = 512
const SIZE_STORED = 256
const QUALITY = 0.85

function createCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof window !== 'undefined' && 'OffscreenCanvas' in window) {
    return new OffscreenCanvas(w, h)
  }
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

async function canvasToWebpBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/webp', quality })
  }
  return new Promise<Blob>((resolve, reject) => {
    ;(canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/webp',
      quality,
    )
  })
}

async function downsampleBlob(
  sourceBlob: Blob,
  targetSize: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(sourceBlob)
  const canvas = createCanvas(targetSize, targetSize)
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) throw new Error('2d context unavailable')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, targetSize, targetSize)
  bitmap.close()
  return canvasToWebpBlob(canvas, QUALITY)
}

/**
 * Render a GLB blob to a 256×256 WebP thumbnail using a 3/4 auto-framed view.
 * Pipeline : render 512×512 WebGL2 offscreen → downsample canvas 2d → WebP.
 */
export async function renderThumbnail(glbBlob: Blob): Promise<Blob> {
  const canvas = createCanvas(SIZE_INTERNAL, SIZE_INTERNAL)
  const renderer = new WebGLRenderer({
    canvas: canvas as HTMLCanvasElement,
    antialias: true,
    alpha: false,
  })
  renderer.setClearColor(0x2c2c2e, 1)
  renderer.setSize(SIZE_INTERNAL, SIZE_INTERNAL, false)

  const scene = new Scene()
  const arrayBuffer = await glbBlob.arrayBuffer()
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '')
  scene.add(gltf.scene)

  scene.add(new AmbientLight(0xffffff, 0.7))
  const key = new DirectionalLight(0xffffff, 0.9)
  key.position.set(2, 3, 2)
  scene.add(key)

  const bbox = new Box3().setFromObject(gltf.scene)
  const size = bbox.getSize(new Vector3())
  const center = bbox.getCenter(new Vector3())
  const diagonal = Math.max(size.length(), 0.1) // guard tiny/empty

  const camera = new PerspectiveCamera(40, 1, diagonal * 0.05, diagonal * 20)
  camera.position.set(
    center.x + diagonal * 1.0,
    center.y + diagonal * 0.8,
    center.z + diagonal * 1.3,
  )
  camera.lookAt(center)

  renderer.render(scene, camera)
  const rawBlob = await canvasToWebpBlob(canvas, QUALITY)
  renderer.dispose()

  return downsampleBlob(rawBlob, SIZE_STORED)
}
```

- [ ] **Step 2: Implement `thumbnails/resize.ts`**

```ts
const TARGET_SIZE = 256
const QUALITY = 0.85

/**
 * User-provided image file → 256×256 WebP Blob (center-cropped if not square).
 */
export async function resizeImageToThumbnail(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const canvas = 'OffscreenCanvas' in window
    ? new OffscreenCanvas(TARGET_SIZE, TARGET_SIZE)
    : (() => {
        const c = document.createElement('canvas')
        c.width = TARGET_SIZE
        c.height = TARGET_SIZE
        return c
      })()
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) throw new Error('2d context unavailable')

  const s = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - s) / 2
  const sy = (bitmap.height - s) / 2
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, s, s, 0, 0, TARGET_SIZE, TARGET_SIZE)
  bitmap.close()

  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/webp', quality: QUALITY })
  }
  return new Promise<Blob>((resolve, reject) => {
    ;(canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/webp',
      QUALITY,
    )
  })
}
```

- [ ] **Step 3: Typecheck**

```
cd packages/glb-catalog && bun x tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```
git add packages/glb-catalog/src/thumbnails/
git commit -m "feat(glb-catalog): thumbnail renderer (WebGL2 offscreen) + user image resize"
```

---

## Task 9: Public API (upload/update/delete)

**Files:**
- Create: `packages/glb-catalog/src/api.ts`

**Vérifications préalables (ne pas skip)** :
- Pascal's `asset://` delete : `ASSET_PREFIX = 'asset_data:'` (confirmé via `packages/core/src/lib/asset-storage.ts:3`). Pas de `deleteAsset()` exposé — on utilise `del(\`asset_data:\${uuid}\`)` via `idb-keyval` directement.

- [ ] **Step 1: Implement `api.ts`**

```ts
import { loadAssetUrl, saveAsset } from '@pascal-app/core'
import { nanoid } from 'nanoid'
import { type CategoryResolver, resolveAssetMeta } from './detect/resolve'
import { extractMeshNames } from './detect/gltf-meshes'
import { type GLBAsset } from './schema'
import {
  dbDeleteAsset,
  dbGetAsset,
  dbListAssets,
  dbPutAsset,
  dbReplaceThumbnail,
  dbUpdateAsset,
} from './storage/db'
import { renderThumbnail } from './thumbnails/render'
import { resizeImageToThumbnail } from './thumbnails/resize'

export const MAX_GLB_SIZE = 200 * 1024 * 1024 // 200 MB

// --- Peer-dep to @pascal-app/core ---
// This package treats @pascal-app/core as a hard runtime dep (imports above).
// It's intentional: the reason this package exists in our fork is precisely
// to plug into Pascal's asset:// store. Outside the fork, re-implement
// saveAsset/loadAssetUrl equivalents before using.

export interface UploadOptions {
  resolver: CategoryResolver
  onPhase?: (phase: 'preparing' | 'detecting' | 'rendering' | 'storing') => void
}

export async function uploadGLB(file: File, opts: UploadOptions): Promise<GLBAsset> {
  if (file.size > MAX_GLB_SIZE) {
    throw new Error(`File is too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is 200 MB.`)
  }
  if (!/\.(glb|gltf)$/i.test(file.name)) {
    throw new Error('Invalid file type. Only .glb / .gltf accepted.')
  }

  opts.onPhase?.('preparing')
  const meshNames = await extractMeshNames(file)

  opts.onPhase?.('detecting')
  const { category, domain } = resolveAssetMeta(meshNames, file.name, opts.resolver)

  opts.onPhase?.('rendering')
  const thumbBlob = await renderThumbnail(file)

  opts.onPhase?.('storing')
  const pascalAssetUrl = await saveAsset(file)
  const now = Date.now()
  const asset: GLBAsset = {
    id: nanoid(16),
    builtin: false,
    name: file.name.replace(/\.(glb|gltf)$/i, ''),
    category,
    suggestedHADomain: domain,
    filename: file.name,
    meshNames,
    pascalAssetUrl,
    createdAt: now,
    updatedAt: now,
  }
  await dbPutAsset(asset, thumbBlob)
  return asset
}

export async function updateGLBMeta(
  id: string,
  patch: Partial<Pick<GLBAsset, 'name' | 'category' | 'suggestedHADomain'>>,
): Promise<void> {
  const existing = await dbGetAsset(id)
  if (!existing) throw new Error(`Asset ${id} not found`)
  if (existing.builtin) throw new Error('Built-in seeds cannot be edited')
  await dbUpdateAsset(id, patch)
}

export async function replaceThumbnail(id: string, image: File): Promise<void> {
  const existing = await dbGetAsset(id)
  if (!existing) throw new Error(`Asset ${id} not found`)
  if (existing.builtin) throw new Error('Built-in seeds cannot be edited')
  const thumb = await resizeImageToThumbnail(image)
  await dbReplaceThumbnail(id, thumb)
}

export async function regenerateThumbnail(id: string): Promise<void> {
  const existing = await dbGetAsset(id)
  if (!existing) throw new Error(`Asset ${id} not found`)
  if (existing.builtin) throw new Error('Built-in seeds cannot be edited')
  const blobUrl = await loadAssetUrl(existing.pascalAssetUrl)
  if (!blobUrl) throw new Error('Could not load GLB from Pascal store')
  const glbBlob = await fetch(blobUrl).then((r) => r.blob())
  const thumb = await renderThumbnail(glbBlob)
  await dbReplaceThumbnail(id, thumb)
}

export async function deleteGLB(id: string): Promise<void> {
  const existing = await dbGetAsset(id)
  if (!existing) throw new Error(`Asset ${id} not found`)
  if (existing.builtin) throw new Error('Built-in seeds cannot be deleted')
  // Delete blob from Pascal's idb-keyval (key pattern = 'asset_data:<uuid>')
  const uuid = existing.pascalAssetUrl.replace(/^asset:\/\//, '')
  const { del } = await import('idb-keyval')
  await del(`asset_data:${uuid}`)
  await dbDeleteAsset(id)
}

export async function listAssets(): Promise<GLBAsset[]> {
  return dbListAssets()
}
```

- [ ] **Step 2: Add `idb-keyval` + `@pascal-app/core` deps to package.json**

Modify `packages/glb-catalog/package.json` — add to `dependencies`:
```json
"@pascal-app/core": "workspace:*",
"idb-keyval": "^6",
```

- [ ] **Step 3: `bun install` + typecheck**

```
bun install && cd packages/glb-catalog && bun x tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```
git add packages/glb-catalog/src/api.ts packages/glb-catalog/package.json bun.lock
git commit -m "feat(glb-catalog): public API (uploadGLB, update, delete, regenerate)"
```

---

## Task 10: `useCatalog` hook

**Files:**
- Create: `packages/glb-catalog/src/hooks/use-catalog.ts`

- [ ] **Step 1: Implement `use-catalog.ts`**

```ts
import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import type { CatalogItem, Category, GLBAsset } from '../schema'
import { dbGetThumbnail } from '../storage/db'
import { mergeWithSeeds } from '../storage/seeds'
import { getDB } from '../storage/db'

// Simple ref-counted blob URL cache for custom thumbnails
const thumbUrlCache = new Map<string, { url: string; refs: number }>()

function getThumbUrl(asset: GLBAsset, thumb: Blob | undefined): string {
  if (asset.builtin) return '' // overridden by mergeWithSeeds
  if (!thumb) return ''
  const cached = thumbUrlCache.get(asset.id)
  if (cached) {
    cached.refs += 1
    return cached.url
  }
  const url = URL.createObjectURL(thumb)
  thumbUrlCache.set(asset.id, { url, refs: 1 })
  return url
}

function releaseThumb(id: string) {
  const entry = thumbUrlCache.get(id)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs <= 0) {
    URL.revokeObjectURL(entry.url)
    thumbUrlCache.delete(id)
  }
}

export function useCatalog(filter?: { category?: Category }): {
  items: CatalogItem[]
  isLoading: boolean
} {
  const [assets, setAssets] = useState<GLBAsset[]>([])
  const [thumbs, setThumbs] = useState<Map<string, Blob>>(new Map())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const obs = liveQuery(() => getDB().assets.orderBy('createdAt').toArray())
    const sub = obs.subscribe({
      next: async (list) => {
        setAssets(list)
        // Fetch thumbnails for all customs
        const next = new Map<string, Blob>()
        for (const a of list) {
          const t = await dbGetThumbnail(a.id)
          if (t) next.set(a.id, t)
        }
        setThumbs(next)
        setIsLoading(false)
      },
      error: (err) => {
        console.error('useCatalog: liveQuery failed', err)
        setIsLoading(false)
      },
    })
    return () => sub.unsubscribe()
  }, [])

  const items = useMemo(() => {
    const merged = mergeWithSeeds(assets, (asset) => getThumbUrl(asset, thumbs.get(asset.id)))
    return filter?.category ? merged.filter((i) => i.category === filter.category) : merged
  }, [assets, thumbs, filter?.category])

  // Cleanup : when component unmounts OR asset list shrinks, release stale URLs
  useEffect(() => {
    return () => {
      for (const id of thumbUrlCache.keys()) releaseThumb(id)
    }
  }, [])

  return { items, isLoading }
}
```

- [ ] **Step 2: Typecheck**

```
cd packages/glb-catalog && bun x tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add packages/glb-catalog/src/hooks/use-catalog.ts
git commit -m "feat(glb-catalog): useCatalog hook (dexie liveQuery + thumbnail refs)"
```

---

## Task 11: Package barrel `index.ts`

**Files:**
- Modify: `packages/glb-catalog/src/index.ts`

- [ ] **Step 1: Replace placeholder with full re-exports**

```ts
// Schema + types
export type { CatalogItem, Category, GLBAsset, HADomainHint } from './schema'
export { Category as CategorySchema, GLBAsset as GLBAssetSchema, HADomainHint as HADomainHintSchema } from './schema'

// API
export {
  MAX_GLB_SIZE,
  type UploadOptions,
  deleteGLB,
  listAssets,
  regenerateThumbnail,
  replaceThumbnail,
  updateGLBMeta,
  uploadGLB,
} from './api'

// Hook
export { useCatalog } from './hooks/use-catalog'

// Detection (exposed for adapter bridging)
export type { CategoryResolver } from './detect/resolve'
```

- [ ] **Step 2: Build package**

```
cd packages/glb-catalog && bun x tsc --build
```
Expected: no errors, dist/ populated.

- [ ] **Step 3: Commit**

```
git add packages/glb-catalog/src/index.ts
git commit -m "feat(glb-catalog): public exports"
```

---

## Task 12: Adapter — `apps/editor/glb-catalog/` scaffold

**Files:**
- Create: `apps/editor/glb-catalog/category-resolver.ts`
- Create: `apps/editor/glb-catalog/to-asset-input.ts`
- Create: `apps/editor/glb-catalog/index.ts`

- [ ] **Step 1: Create `category-resolver.ts`** (bridge vers `ha/suggest.ts`)

```ts
import { suggestCategoryAndDomain } from '../ha/suggest'
import type { CategoryResolver } from '@maison-3d/glb-catalog'

export const haConventionResolver: CategoryResolver = {
  resolve: (name) => suggestCategoryAndDomain(name),
}
```

- [ ] **Step 2: Create `to-asset-input.ts`**

```ts
import type { AssetInput } from '@pascal-app/core'
import type { CatalogItem } from '@maison-3d/glb-catalog'

export function toAssetInput(item: CatalogItem): AssetInput {
  return {
    id: item.id,
    category: 'custom-glb',
    tags: [item.category, item.suggestedHADomain ?? 'unknown'].filter(Boolean) as string[],
    name: item.name,
    thumbnail: item.thumbnailUrl,
    src: item.pascalAssetUrl,
    scale: [1, 1, 1],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: [1, 1, 1],
  }
}
```

- [ ] **Step 3: Create `index.ts` placeholder**

```ts
export { haConventionResolver } from './category-resolver'
export { toAssetInput } from './to-asset-input'
```

- [ ] **Step 4: Typecheck apps/editor**

```
cd apps/editor && bun x tsc --noEmit 2>&1 | grep glb-catalog
```
Expected: no errors related to glb-catalog files.

- [ ] **Step 5: Commit**

```
git add apps/editor/glb-catalog/
git commit -m "feat(editor): glb-catalog adapter scaffold (resolver + toAssetInput)"
```

---

## Task 13: UI — `CatalogTile.tsx`

**Files:**
- Create: `apps/editor/glb-catalog/CatalogTile.tsx`

- [ ] **Step 1: Implement `CatalogTile.tsx`**

```tsx
'use client'

import type { CatalogItem } from '@maison-3d/glb-catalog'
import clsx from 'clsx'

interface Props {
  item: CatalogItem
  onClick: (item: CatalogItem) => void
  onEdit: (item: CatalogItem) => void
}

export function CatalogTile({ item, onClick, onEdit }: Props) {
  const domainLabel = item.suggestedHADomain ?? '—'
  return (
    <button
      className={clsx(
        'group relative flex aspect-square w-full flex-col overflow-hidden rounded-md border border-border/50 bg-[#2C2C2E] text-left transition-colors hover:border-border',
      )}
      onClick={() => onClick(item)}
      type="button"
    >
      <img
        alt={item.name}
        className="h-full w-full flex-1 object-cover"
        loading="lazy"
        src={item.thumbnailUrl}
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
        <span className="truncate font-medium text-foreground text-xs">{item.name}</span>
        <span className="shrink-0 rounded bg-accent/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {domainLabel}
        </span>
      </div>
      {!item.builtin && (
        <button
          aria-label={`Modifier ${item.name}`}
          className="absolute top-1.5 right-1.5 hidden h-6 w-6 items-center justify-center rounded bg-accent/80 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:flex group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(item)
          }}
          type="button"
        >
          <svg
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
      )}
      {item.builtin && (
        <span className="absolute top-1.5 right-1.5 rounded bg-primary/80 px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground">
          ex
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Typecheck**

```
cd apps/editor && bun x tsc --noEmit 2>&1 | grep CatalogTile
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add apps/editor/glb-catalog/CatalogTile.tsx
git commit -m "feat(editor): CatalogTile UI component"
```

---

## Task 14: UI — `UploadZone.tsx`

**Files:**
- Create: `apps/editor/glb-catalog/UploadZone.tsx`

- [ ] **Step 1: Implement `UploadZone.tsx`**

```tsx
'use client'

import { uploadGLB } from '@maison-3d/glb-catalog'
import clsx from 'clsx'
import { useRef, useState } from 'react'
import { haConventionResolver } from './category-resolver'

type Phase = 'idle' | 'preparing' | 'detecting' | 'rendering' | 'storing' | 'error'

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  preparing: 'Analyse du GLB…',
  detecting: 'Détection auto…',
  rendering: 'Rendu thumbnail…',
  storing: 'Enregistrement…',
  error: '',
}

export function UploadZone() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)
    try {
      await uploadGLB(file, {
        resolver: haConventionResolver,
        onPhase: (p) => setPhase(p),
      })
      setPhase('idle')
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  return (
    <div
      className={clsx(
        'flex shrink-0 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-6 text-center transition-colors',
        dragOver ? 'border-primary/70 bg-primary/10' : 'border-border/50 bg-[#2C2C2E]',
        phase !== 'idle' && phase !== 'error' && 'pointer-events-none opacity-60',
      )}
      onDragLeave={() => setDragOver(false)}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) void handleFile(file)
      }}
    >
      <input
        accept=".glb,.gltf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
        ref={inputRef}
        type="file"
      />
      <span className="font-medium text-foreground text-sm">
        {phase === 'idle'
          ? 'Glisse un .glb ici'
          : phase === 'error'
            ? 'Erreur'
            : PHASE_LABEL[phase]}
      </span>
      <span className="text-muted-foreground text-xs">ou</span>
      <button
        className="rounded-md bg-accent px-3 py-1.5 font-medium text-foreground text-xs hover:bg-accent/70"
        disabled={phase !== 'idle' && phase !== 'error'}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        Choisir un fichier
      </button>
      {error && <span className="text-red-400 text-xs">{error}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```
cd apps/editor && bun x tsc --noEmit 2>&1 | grep UploadZone
```

- [ ] **Step 3: Commit**

```
git add apps/editor/glb-catalog/UploadZone.tsx
git commit -m "feat(editor): UploadZone drag-drop + file picker"
```

---

## Task 15: UI — `EditItemModal.tsx`

**Files:**
- Create: `apps/editor/glb-catalog/EditItemModal.tsx`

- [ ] **Step 1: Implement `EditItemModal.tsx`**

```tsx
'use client'

import {
  type CatalogItem,
  type Category,
  type HADomainHint,
  deleteGLB,
  regenerateThumbnail,
  replaceThumbnail,
  updateGLBMeta,
} from '@maison-3d/glb-catalog'
import { useScene } from '@pascal-app/core'
import { useRef, useState } from 'react'

const CATEGORY_OPTIONS: Array<{ value: Category; label: string }> = [
  { value: 'light', label: 'Lumière' },
  { value: 'cover', label: 'Volet' },
  { value: 'sensor', label: 'Capteur' },
  { value: 'furniture', label: 'Meuble' },
  { value: 'uncategorized', label: 'Non classé' },
]

const DOMAIN_OPTIONS: Array<{ value: HADomainHint; label: string }> = [
  { value: 'light', label: 'light' },
  { value: 'switch', label: 'switch' },
  { value: 'cover', label: 'cover' },
  { value: 'fan', label: 'fan' },
  { value: 'climate', label: 'climate' },
  { value: 'sensor', label: 'sensor' },
  { value: null, label: '—' },
]

const DEFAULT_DOMAIN_FOR_CATEGORY: Record<Category, HADomainHint> = {
  light: 'light',
  cover: 'cover',
  sensor: 'sensor',
  furniture: null,
  uncategorized: null,
}

interface Props {
  item: CatalogItem
  onClose: () => void
}

export function EditItemModal({ item, onClose }: Props) {
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState<Category>(item.category)
  const [domain, setDomain] = useState<HADomainHint>(item.suggestedHADomain)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Usage count : match par asset.src === pascalAssetUrl (bijectif, robuste).
  // On n'ajoute PAS metadata.glbSource au ItemNode (Pascal ne propage pas
  // AssetInput.metadata vers ItemNode.metadata — on éviterait d'avoir à
  // intercepter createNode). Le match URL suffit.
  const usageCount = useScene((s) => {
    let count = 0
    for (const node of Object.values(s.nodes)) {
      if (node.type !== 'item') continue
      const itemNode = node as { asset?: { src?: string } }
      if (itemNode.asset?.src === item.pascalAssetUrl) count += 1
    }
    return count
  })

  const handleSave = async () => {
    setError(null)
    try {
      await updateGLBMeta(item.id, {
        name: name.trim() || item.name,
        category,
        suggestedHADomain: domain,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  const handleDelete = async () => {
    setError(null)
    try {
      await deleteGLB(item.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const handleCategoryChange = (next: Category) => {
    setCategory(next)
    setDomain(DEFAULT_DOMAIN_FOR_CATEGORY[next])
  }

  const handleReplaceThumbnail = (file: File) => {
    setError(null)
    replaceThumbnail(item.id, file).catch((err) =>
      setError(err instanceof Error ? err.message : 'Replace thumbnail failed'),
    )
  }

  const handleRegenerate = () => {
    setError(null)
    regenerateThumbnail(item.id).catch((err) =>
      setError(err instanceof Error ? err.message : 'Regenerate failed'),
    )
  }

  const isBuiltin = item.builtin

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="flex w-96 flex-col gap-3 rounded-md border border-border/50 bg-[#1C1C1E] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-medium text-foreground text-sm">Modifier l'item</h2>

        {isBuiltin && (
          <p className="rounded bg-accent/40 px-2 py-1.5 text-muted-foreground text-xs">
            Cet item est un exemple built-in, il n'est pas modifiable.
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Nom</span>
          <input
            className="rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            disabled={isBuiltin}
            onChange={(e) => setName(e.target.value)}
            type="text"
            value={name}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Catégorie</span>
          <select
            className="rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            disabled={isBuiltin}
            onChange={(e) => handleCategoryChange(e.target.value as Category)}
            value={category}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Domain HA suggéré</span>
          <select
            className="rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            disabled={isBuiltin}
            onChange={(e) => setDomain((e.target.value || null) as HADomainHint)}
            value={domain ?? ''}
          >
            {DOMAIN_OPTIONS.map((o) => (
              <option key={o.value ?? 'null'} value={o.value ?? ''}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {!isBuiltin && (
          <div className="flex gap-2">
            <input
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleReplaceThumbnail(f)
                e.target.value = ''
              }}
              ref={imageInputRef}
              type="file"
            />
            <button
              className="flex-1 rounded-md bg-accent px-3 py-1.5 font-medium text-foreground text-xs hover:bg-accent/70"
              onClick={() => imageInputRef.current?.click()}
              type="button"
            >
              Remplacer thumbnail
            </button>
            <button
              className="flex-1 rounded-md bg-accent px-3 py-1.5 font-medium text-foreground text-xs hover:bg-accent/70"
              onClick={handleRegenerate}
              type="button"
            >
              Re-générer
            </button>
          </div>
        )}

        {error && <span className="text-red-400 text-xs">{error}</span>}

        <div className="flex items-center justify-between gap-2 pt-1">
          {isBuiltin ? (
            <button
              className="rounded-md px-3 py-1.5 text-muted-foreground text-xs disabled:opacity-40"
              disabled
              title="Les items built-in ne peuvent pas être supprimés"
              type="button"
            >
              Supprimer
            </button>
          ) : !confirmDelete ? (
            <button
              className="rounded-md px-3 py-1.5 text-red-400 text-xs hover:bg-red-500/20"
              onClick={() => setConfirmDelete(true)}
              type="button"
            >
              Supprimer
            </button>
          ) : (
            <div className="flex flex-col gap-1">
              {usageCount > 0 && (
                <span className="text-orange-400 text-[11px]">
                  {usageCount} item{usageCount > 1 ? 's' : ''} de la scène utilise{usageCount > 1 ? 'nt' : ''} ce GLB
                </span>
              )}
              <div className="flex gap-2">
                <button
                  className="rounded-md bg-red-500/80 px-3 py-1.5 font-medium text-white text-xs hover:bg-red-500"
                  onClick={handleDelete}
                  type="button"
                >
                  Confirmer
                </button>
                <button
                  className="rounded-md bg-accent px-3 py-1.5 text-foreground text-xs hover:bg-accent/70"
                  onClick={() => setConfirmDelete(false)}
                  type="button"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              className="rounded-md bg-accent px-3 py-1.5 text-foreground text-xs hover:bg-accent/70"
              onClick={onClose}
              type="button"
            >
              Annuler
            </button>
            {!isBuiltin && (
              <button
                className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs hover:bg-primary/80"
                onClick={handleSave}
                type="button"
              >
                Enregistrer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```
cd apps/editor && bun x tsc --noEmit 2>&1 | grep EditItemModal
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add apps/editor/glb-catalog/EditItemModal.tsx
git commit -m "feat(editor): EditItemModal (rename/category/domain/delete with usage warn)"
```

---

## Task 16: UI — `GLBCatalogPanel.tsx`

**Files:**
- Create: `apps/editor/glb-catalog/GLBCatalogPanel.tsx`
- Modify: `apps/editor/glb-catalog/index.ts` (export panel)

- [ ] **Step 1: Implement `GLBCatalogPanel.tsx`**

```tsx
'use client'

import { type CatalogItem, useCatalog } from '@maison-3d/glb-catalog'
import { useEditor } from '@pascal-app/editor'
import { useState } from 'react'
import { CatalogTile } from './CatalogTile'
import { EditItemModal } from './EditItemModal'
import { UploadZone } from './UploadZone'
import { toAssetInput } from './to-asset-input'

export function GLBCatalogPanel() {
  const { items, isLoading } = useCatalog()
  const [editing, setEditing] = useState<CatalogItem | null>(null)

  const handleTileClick = (item: CatalogItem) => {
    const editor = useEditor.getState()
    editor.setSelectedItem(toAssetInput(item))
    if (editor.phase !== 'furnish') editor.setPhase('furnish')
    if (editor.mode !== 'build') editor.setMode('build')
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <UploadZone />
      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground text-xs">Chargement…</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((item) => (
            <CatalogTile
              item={item}
              key={item.id}
              onClick={handleTileClick}
              onEdit={setEditing}
            />
          ))}
        </div>
      )}
      {editing && <EditItemModal item={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
```

- [ ] **Step 2: Update `apps/editor/glb-catalog/index.ts`**

```ts
export { haConventionResolver } from './category-resolver'
export { GLBCatalogPanel } from './GLBCatalogPanel'
export { toAssetInput } from './to-asset-input'
```

- [ ] **Step 3: Typecheck**

```
cd apps/editor && bun x tsc --noEmit 2>&1 | grep GLBCatalogPanel
```
Expected: no errors. (L'API `useEditor.setPhase/setMode` a été vérifiée dans le spike — voir Task 17 header.)

- [ ] **Step 4: Commit**

```
git add apps/editor/glb-catalog/GLBCatalogPanel.tsx apps/editor/glb-catalog/index.ts
git commit -m "feat(editor): GLBCatalogPanel wiring catalog + upload + edit modal"
```

---

## Task 17: Wire up sidebar tab

**Files:**
- Modify: `apps/editor/app/page.tsx`

**Vérifications préalables (ne pas skip)** :
- `useEditor` API (confirmé via `packages/editor/src/store/use-editor.tsx`) :
  - `phase: 'site' | 'structure' | 'furnish'`, setter `setPhase(phase)`
  - `mode: 'select' | 'edit' | 'delete' | 'build'`, setter `setMode(mode)`
  - Le code Task 16 `editor.setPhase('furnish')` + `editor.setMode('build')` est correct.

- [ ] **Step 1: Add Catalogue tab to `SIDEBAR_TABS`**

Replace existing `SIDEBAR_TABS`:

```tsx
'use client'

import { type SidebarTab, ViewerToolbarLeft, ViewerToolbarRight } from '@pascal-app/editor'
import { EditorWithHA } from '../ha/EditorWithHA'
import { GLBCatalogPanel } from '../glb-catalog'
import { localDeleteAsset, localUploadAsset } from '../uploads/local-upload-handlers'

const SIDEBAR_TABS: (SidebarTab & { component: React.ComponentType })[] = [
  {
    id: 'site',
    label: 'Scene',
    component: () => null, // Built-in SitePanel handles this
  },
  {
    id: 'catalog',
    label: 'Catalogue',
    component: GLBCatalogPanel,
  },
]

const SITE_PANEL_PROPS = {
  projectId: 'local-editor',
  onUploadAsset: localUploadAsset,
  onDeleteAsset: localDeleteAsset,
}

export default function Home() {
  return (
    <div className="h-screen w-screen">
      <EditorWithHA
        layoutVersion="v2"
        projectId="local-editor"
        sidebarTabs={SIDEBAR_TABS}
        sitePanelProps={SITE_PANEL_PROPS}
        viewerToolbarLeft={<ViewerToolbarLeft />}
        viewerToolbarRight={<ViewerToolbarRight />}
      />
    </div>
  )
}
```

- [ ] **Step 2: `bun dev` + verify tab visible**

```
bun dev
```
Ouvrir http://localhost:3002 → cliquer sur l'onglet "Catalogue" dans la sidebar → doit afficher l'UploadZone + la grille vide.

- [ ] **Step 3: Commit**

```
git add apps/editor/app/page.tsx
git commit -m "feat(editor): add Catalogue tab to sidebar"
```

---

## Task 18: Seeds — 3 GLB minimalistes + thumbnails générées au premier boot

**Files:**
- Create: `apps/editor/public/items/catalog-seed/light-ceiling.glb`
- Create: `apps/editor/public/items/catalog-seed/volet-simple.glb`
- Create: `apps/editor/public/items/catalog-seed/prise-simple.glb`
- Modify: `packages/glb-catalog/src/storage/seeds.ts` (ajout `ensureSeedThumbnails()`)
- Modify: `packages/glb-catalog/src/storage/db.ts` (ajout table `seedThumbnails`)
- Modify: `packages/glb-catalog/src/hooks/use-catalog.ts` (hydrate au mount)

**Choix** : au lieu de ship des `.thumb.webp` placeholders (risque de bytes invalides), les thumbnails des seeds sont **générées au premier boot** via `renderThumbnail(fetch(glb))` et persistées dans une table dexie dédiée `seedThumbnails` (keyed par seed id). Coût : ~1s de latence first-boot ; 0 après. Plus de problème de placeholder invalide + teste automatiquement `renderThumbnail` sur les fixtures.

**NOTE UTILISATEUR** : Les 3 GLB sont minimalistes (1 triangle par mesh) pour dé-bloquer. À remplacer par de vrais GLB Blender (mesh names conservés) en post-plan.

- [ ] **Step 1: Créer le dossier**

```
mkdir -p apps/editor/public/items/catalog-seed
```

- [ ] **Step 2: Générer les 3 GLB minimalistes via script**

Créer un fichier temp `scripts/generate-seeds.mjs` (racine repo) :

```js
import { writeFileSync } from 'fs'
import { resolve } from 'path'

const seeds = [
  { filename: 'light-ceiling.glb', meshes: ['light_ceiling', 'glow_lampshade'] },
  { filename: 'volet-simple.glb', meshes: ['volet_cadre', 'volet_tablier_emit'] },
  { filename: 'prise-simple.glb', meshes: ['prise_socle', 'prise_led_emit'] },
]

function makeGLB(meshNames) {
  const json = {
    asset: { version: '2.0', generator: 'maison-3d seed' },
    scene: 0,
    scenes: [{ nodes: meshNames.map((_, i) => i) }],
    nodes: meshNames.map((name, i) => ({ name, mesh: i })),
    meshes: meshNames.map(() => ({
      primitives: [{ attributes: { POSITION: 0 }, mode: 4 }],
    })),
    accessors: [
      {
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        bufferView: 0,
        min: [-0.5, 0, -0.5],
        max: [0.5, 1, 0.5],
      },
    ],
    bufferViews: [{ buffer: 0, byteLength: 36, byteOffset: 0 }],
    buffers: [{ byteLength: 36 }],
  }
  const jsonStr = JSON.stringify(json)
  const padded = jsonStr.padEnd(Math.ceil(jsonStr.length / 4) * 4, ' ')
  const jsonBuf = Buffer.from(padded)

  const positions = new Float32Array([0, 0, 0, 0, 1, 0, 0.5, 0, 0])
  const binBuf = Buffer.from(positions.buffer)
  const binPadded = Buffer.concat([binBuf, Buffer.alloc((4 - (binBuf.length % 4)) % 4)])

  const total = 12 + 8 + jsonBuf.length + 8 + binPadded.length
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(total, 8)

  const jhead = Buffer.alloc(8)
  jhead.writeUInt32LE(jsonBuf.length, 0)
  jhead.writeUInt32LE(0x4e4f534a, 4)

  const bhead = Buffer.alloc(8)
  bhead.writeUInt32LE(binPadded.length, 0)
  bhead.writeUInt32LE(0x004e4942, 4)

  return Buffer.concat([header, jhead, jsonBuf, bhead, binPadded])
}

for (const seed of seeds) {
  const out = resolve('apps/editor/public/items/catalog-seed', seed.filename)
  writeFileSync(out, makeGLB(seed.meshes))
  console.log(`Wrote ${seed.filename}`)
}
```

Exécuter :
```
node scripts/generate-seeds.mjs
rm scripts/generate-seeds.mjs
```

Vérifier : `ls apps/editor/public/items/catalog-seed/` → 3 fichiers `.glb`, pas de `.webp`.

- [ ] **Step 3: Ajouter la table `seedThumbnails` dans `storage/db.ts`**

Éditer `packages/glb-catalog/src/storage/db.ts` :

```diff
 class CatalogDB extends Dexie {
   assets!: EntityTable<GLBAsset, 'id'>
   thumbnails!: EntityTable<ThumbnailRow, 'id'>
+  seedThumbnails!: EntityTable<ThumbnailRow, 'id'>

   constructor() {
     super('maison3d-glb-catalog')
-    this.version(1).stores({
+    this.version(2).stores({
       assets: 'id, category, createdAt',
       thumbnails: 'id',
+      seedThumbnails: 'id',
     })
   }
 }
```

Ajouter à la fin du fichier :

```ts
export async function dbGetSeedThumbnail(id: string): Promise<Blob | undefined> {
  const row = await getDB().seedThumbnails.get(id)
  return row?.thumb
}

export async function dbPutSeedThumbnail(id: string, thumb: Blob): Promise<void> {
  await getDB().seedThumbnails.put({ id, thumb })
}
```

- [ ] **Step 4: Ajouter `ensureSeedThumbnails()` dans `storage/seeds.ts`**

Ajouter à la fin de `packages/glb-catalog/src/storage/seeds.ts` :

```ts
import { renderThumbnail } from '../thumbnails/render'
import { dbGetSeedThumbnail, dbPutSeedThumbnail } from './db'

/**
 * Fetch + render + cache thumbnails for all BUILTIN_SEEDS. Idempotent :
 * skip seeds déjà en cache. Safe to call multiple times (useCatalog le fait
 * au mount).
 */
export async function ensureSeedThumbnails(): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  for (const seed of BUILTIN_SEEDS) {
    let thumb = await dbGetSeedThumbnail(seed.id)
    if (!thumb) {
      try {
        const resp = await fetch(seed.pascalAssetUrl)
        if (!resp.ok) throw new Error(`seed fetch failed: ${resp.status}`)
        const glbBlob = await resp.blob()
        thumb = await renderThumbnail(glbBlob)
        await dbPutSeedThumbnail(seed.id, thumb)
      } catch (err) {
        console.warn(`ensureSeedThumbnails: ${seed.id} failed`, err)
        continue
      }
    }
    result.set(seed.id, URL.createObjectURL(thumb))
  }
  return result
}
```

- [ ] **Step 5: Modifier `use-catalog.ts` pour hydrater les seed thumbnails au mount**

Éditer `packages/glb-catalog/src/hooks/use-catalog.ts`. Remplacer **intégralement** le corps :

```ts
import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import type { CatalogItem, Category, GLBAsset } from '../schema'
import { dbGetThumbnail } from '../storage/db'
import { ensureSeedThumbnails, mergeWithSeeds } from '../storage/seeds'
import { getDB } from '../storage/db'

// Blob URL cache : keep URLs alive until deleteGLB explicit revoke or session end.
// No ref-counting : < 100 items attendus, ~80 KB × N = négligeable.
const thumbUrlCache = new Map<string, string>()

function getOrCreateThumbUrl(assetId: string, thumb: Blob): string {
  const existing = thumbUrlCache.get(assetId)
  if (existing) return existing
  const url = URL.createObjectURL(thumb)
  thumbUrlCache.set(assetId, url)
  return url
}

export function revokeThumbUrl(assetId: string): void {
  const url = thumbUrlCache.get(assetId)
  if (url) {
    URL.revokeObjectURL(url)
    thumbUrlCache.delete(assetId)
  }
}

export function useCatalog(filter?: { category?: Category }): {
  items: CatalogItem[]
  isLoading: boolean
} {
  const [assets, setAssets] = useState<GLBAsset[]>([])
  const [customThumbs, setCustomThumbs] = useState<Map<string, Blob>>(new Map())
  const [seedThumbUrls, setSeedThumbUrls] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)

  // Hydrate seed thumbnails once at mount
  useEffect(() => {
    void ensureSeedThumbnails().then((map) => setSeedThumbUrls(map))
  }, [])

  // Subscribe custom assets
  useEffect(() => {
    const obs = liveQuery(() => getDB().assets.orderBy('createdAt').toArray())
    const sub = obs.subscribe({
      next: async (list) => {
        setAssets(list)
        const next = new Map<string, Blob>()
        for (const a of list) {
          const t = await dbGetThumbnail(a.id)
          if (t) next.set(a.id, t)
        }
        setCustomThumbs(next)
        setIsLoading(false)
      },
      error: (err) => {
        console.error('useCatalog: liveQuery failed', err)
        setIsLoading(false)
      },
    })
    return () => sub.unsubscribe()
  }, [])

  const items = useMemo(() => {
    const merged = mergeWithSeeds(assets, (asset) => {
      const thumb = customThumbs.get(asset.id)
      return thumb ? getOrCreateThumbUrl(asset.id, thumb) : ''
    })
    // Override builtin thumbnailUrl avec les URLs dynamiques générées
    const withSeedThumbs = merged.map((item) =>
      item.builtin && seedThumbUrls.has(item.id)
        ? { ...item, thumbnailUrl: seedThumbUrls.get(item.id)! }
        : item,
    )
    return filter?.category
      ? withSeedThumbs.filter((i) => i.category === filter.category)
      : withSeedThumbs
  }, [assets, customThumbs, seedThumbUrls, filter?.category])

  return { items, isLoading }
}
```

Note : le `revokeThumbUrl(id)` est exporté pour être appelé par `deleteGLB` dans `api.ts`. **Ajouter également** dans `api.ts` `deleteGLB()`, après `dbDeleteAsset(id)` :

```ts
import { revokeThumbUrl } from './hooks/use-catalog'
// ... dans deleteGLB, après dbDeleteAsset(id) :
revokeThumbUrl(id)
```

- [ ] **Step 6: Typecheck**

```
cd packages/glb-catalog && bun x tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: `bun dev` + vérifier onglet Catalogue**

Ouvrir http://localhost:3002/ → onglet Catalogue → **les 3 seeds doivent s'afficher après ~1s** (première génération). Reload → seeds instantanés (cache IDB).

- [ ] **Step 8: Commit**

```
git add apps/editor/public/items/catalog-seed/ packages/glb-catalog/src/storage/ packages/glb-catalog/src/hooks/use-catalog.ts packages/glb-catalog/src/api.ts
git commit -m "feat(glb-catalog): 3 seed GLBs + first-boot thumbnail generation + IDB cache"
```

---

## Task 19: Smoke test end-to-end + régression built-ins Pascal

**Files:** aucun (test manuel via `bun dev` + browser)

Objectif : valider l'ensemble du flow + absence de régression.

- [ ] **Step 1: `bun dev`**

```
bun dev
```
Attendre : editor dev ready on http://localhost:3002.

- [ ] **Step 2: Smoke test "onglet Catalogue + seeds"**

- Ouvrir http://localhost:3002/
- Cliquer onglet Catalogue
- Vérifier : 3 tiles visibles (Lampe plafond, Volet simple, Prise simple) avec thumbnails
- Vérifier : badge "ex" sur les 3

- [ ] **Step 3: Smoke test "upload custom GLB"**

- Drag-drop un GLB custom (ex: un fichier `.glb` depuis le disque, n'importe lequel)
- Vérifier : phases "Analyse… Détection… Rendu thumbnail… Enregistrement…" defile
- Après ~1s : tile apparaît dans la grille avec thumbnail auto-rendered

- [ ] **Step 4: Smoke test "placement d'un seed"**

- Cliquer sur la tile "Lampe plafond"
- Vérifier : mode Furnish activé, ghost preview visible au pointeur
- Clic dans la scène pour poser
- Vérifier : item placé, rendu visible (petit triangle pour les seeds ; un vrai GLB sinon)

- [ ] **Step 5: Smoke test "reload cross-session"**

- Reload la page (F5)
- Vérifier : item placé toujours présent et rendu correctement. Scène persiste.

- [ ] **Step 6: Régression Pascal built-ins**

- Ouvrir mode Furnish via le toolbar Pascal (bouton "Furnish F")
- Vérifier : Tesla, pillar, fences toujours visibles dans le palette Pascal built-in
- Placer une Tesla
- Vérifier : Tesla rendue correctement (CDN path non-cassé par le patch `useResolvedAssetUrl`)

- [ ] **Step 7: Smoke test "edit modal + delete"**

- Onglet Catalogue → hover sur un item custom → clic pencil
- Modifier le nom, la catégorie
- Enregistrer → tile met à jour
- Ré-ouvrir edit → bouton Supprimer → Confirmer
- Vérifier : tile disparaît, pas de crash

- [ ] **Step 8: Typecheck global**

```
turbo typecheck 2>&1 | tail -10
```
Expected: 0 errors (hors erreurs pré-existantes Pascal déjà observées).

- [ ] **Step 9: Commit si fixes nécessaires durant les smoke tests**

Si des ajustements ont été faits :
```
git add <fichiers>
git commit -m "fix(glb-catalog): smoke test adjustments"
```

Sinon pas de commit (le commit final précède).

---

## Task 20: Mise à jour documentation projet

**Files:**
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: `CHANGELOG.md` — ajouter entrée**

Au top de `## [Unreleased]`, ajouter :

```markdown
### 2026-04-18 — feat (PHASE 2 glb-catalog)

- `@maison-3d/glb-catalog` : nouveau package (schema, dexie storage,
  thumbnail renderer WebGL2, auto-détection category/domain, hook
  `useCatalog`).
- `apps/editor/glb-catalog/` : adapter (UI panel + tiles + upload zone +
  edit modal + `toAssetInput`).
- Nouvel onglet **Catalogue** dans la sidebar Pascal (via `sidebarTabs`).
- 3 seeds built-in (light-ceiling, volet-simple, prise-simple) servis
  depuis `public/items/catalog-seed/`, non-supprimables.
- D-011 : patch `ItemRenderer` (swap `resolveCdnUrl` → `useResolvedAssetUrl`
  + split ModelRenderer rules-of-hooks) pour supporter `asset://` URL
  (alignement avec ScanRenderer/GuideRenderer).
- Upload GLB : drag-drop + file picker, validation extension + taille 200MB,
  stockage via Pascal `saveAsset()` (asset://uuid), metadata + thumbnail
  WebP 256×256 dans notre dexie.
- Scène persiste cross-session : `asset://uuid` résolu automatiquement au
  render par le hook `useResolvedAssetUrl`.
```

- [ ] **Step 2: `CLAUDE.md` — mise à jour statut**

Dans la section `## Statut actuel`, changer la liste des PHASES DONE pour ajouter PHASE 2 :

```diff
-- PHASE 0 / 1 / 3 / 4 / 5 / 5.1 / 5.2 / 6 : DONE
+- PHASE 0 / 1 / 2 / 3 / 4 / 5 / 5.1 / 5.2 / 6 : DONE
```

Et remplacer la ligne "PHASE 2 : `@maison-3d/glb-catalog` package (prérequis PHASE 7)" par :

```diff
-  - PHASE 2 : `@maison-3d/glb-catalog` package (prérequis PHASE 7)
+  - **PHASE 2** : `@maison-3d/glb-catalog` package complet — upload GLB
+    drag-drop, IndexedDB (dexie), thumbnails WebGL2 auto, auto-détection
+    category/domain via `apps/editor/ha/suggest.ts`, 3 seeds built-in,
+    onglet Catalogue dans la sidebar. Patch `ItemRenderer` (D-011) pour
+    support `asset://` URL cross-session.
```

- [ ] **Step 3: Commit**

```
git add CLAUDE.md CHANGELOG.md
git commit -m "docs(phase-2): update CLAUDE.md + CHANGELOG for glb-catalog"
```

---

## Checklist finale (§14 du spec)

Vérifier que tous les success criteria sont atteints :

- [ ] `bun install` ajoute `@maison-3d/glb-catalog` sans erreur
- [ ] `bun dev` tourne, onglet "Catalogue" visible dans la sidebar
- [ ] Au premier boot, 3 seeds s'affichent avec leurs thumbnails chargées
- [ ] Drag-drop d'un `.glb` → tile apparaît en < 1s avec thumbnail, category + domain auto-détectés
- [ ] Clic sur une tile → `useEditor.selectedItem` set → Pascal en mode Furnish place l'item
- [ ] Item placé rendu correctement (via `asset://` + `useResolvedAssetUrl`)
- [ ] Reload test : 3 items (1 seed, 2 custom) placés réapparaissent après reload
- [ ] Régression Pascal built-ins : Tesla + pillar + Floor Lamp rendent toujours
- [ ] Edit modal : rename, change category, change HA domain, supprimer (warn si usage > 0)
- [ ] Supprimer un GLB encore utilisé en scène → ItemNode restent mais rendu placeholder (pas de crash)
- [ ] Les 3 seeds ne sont pas supprimables (bouton grisé)
- [ ] Typecheck passe (`turbo typecheck` — hors erreurs Pascal pré-existantes)
- [ ] Bundle size `@maison-3d/glb-catalog` vérifié raisonnable (< 100 KB gzip en build)

---

## Notes pour l'engineer qui exécute

- **TDD strict** : Tasks 2, 3, 4, 5, 6 ont des tests bun:test qui doivent failer avant l'impl
- **Smoke tests** : Tasks 7, 8, 9, 10, 13–18 sont validés en runtime via `bun dev`
- **Commits fréquents** : 1 commit / task, messages en style `feat(scope): …` / `fix(scope): …` / `docs(scope): …`
- **Dépendances transitives** : le package `@maison-3d/glb-catalog` dépend de `@pascal-app/core` (pour `saveAsset`/`loadAssetUrl`/`idb-keyval`) — c'est intentionnel (voir commentaire dans `api.ts`)
- **ItemRenderer patch** : déjà mergé en `dd73311` avant le plan → aucune action côté ce plan
- **Seeds réalistes** : après le plan, créer de vrais GLB Blender + thumbnails en remplacement des placeholders minimalistes (out of scope plan, décrit dans Task 18 NOTE)

Si tu dois interrompre au milieu d'une task : commit le WIP avec un message `wip(glb-catalog): ...` pour reprendre plus tard, puis revert si besoin.
