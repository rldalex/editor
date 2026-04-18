# Decisions Architecturales

## D-001 : Fork complet de Pascal Editor
Date : 2026-04-17

On fork https://github.com/pascalorg/editor plutot que de repartir from scratch
ou de consommer les packages npm.

Rationale :
- On veut 100% des features Pascal (walls, slabs, roofs, portes/fenetres, CSG,
  undo/redo, spatial grid manager)
- Usage perso, pas de PR upstream -> fork = projet prive
- On beneficie des updates via `git fetch upstream && git merge`

Consequences :
- On herite de la stack Pascal (Next.js 16, Bun, Turborepo) — pas Vite
- Les extensions doivent etre dans des dossiers nouveaux pour minimiser les
  conflits de merge
- On doit documenter toute modification d'un fichier Pascal existant

## D-002 : Mapping HA dans node.metadata
Date : 2026-04-17

Le mapping HA (entityId, visual, actions) est stocke dans `node.metadata.ha`
plutot que dans un schema separe ou un store parallele.

Rationale :
- Pascal persiste deja metadata via IndexedDB -> gratuit
- Pas de modification du schema core Pascal
- Undo/redo de Pascal fonctionne automatiquement sur le mapping
- Export/import de scene porte les mappings sans effort

## D-003 : Packages internes ha-bridge et glb-catalog
Date : 2026-04-17

Creation de packages/ha-bridge et packages/glb-catalog comme packages du monorepo
Turborepo (pas comme sous-dossiers de apps/editor).

Rationale :
- Reutilisables par apps/kiosk
- Testables independamment
- Suivent la convention Pascal de separation en packages

## D-004 : App kiosque separee
Date : 2026-04-17

`apps/kiosk/` est une app distincte de `apps/editor/` (probablement Vite pour la
legerete sur tablette Android).

Rationale :
- La tablette n'a pas besoin des outils d'edition -> bundle plus petit
- Optimisations specifiques kiosque (pas de SSR, cache agressif)
- Point d'entree clair pour Fully Kiosk Browser

A valider en PHASE 0 : Vite vs Next.js pour le kiosque.

## D-005 : Merge upstream periodique
Date : 2026-04-17

Merger `upstream/main` dans notre fork mensuellement (ou plus souvent si feature
importante).

Workflow :
1. git fetch upstream
2. git checkout -b chore/merge-upstream-YYYY-MM
3. git merge upstream/main
4. Resoudre les conflits (toujours privilegier la version Pascal dans packages/core
   et packages/viewer)
5. Verifier que bun dev fonctionne
6. PR vers notre main (ou merge direct si perso)

## D-007 : Ajout @maison-3d/ha-bridge dans apps/editor/package.json
Date : 2026-04-17

Modification du fichier Pascal `apps/editor/package.json` pour ajouter la
dependance interne `"@maison-3d/ha-bridge": "*"`.

Rationale :
- Indispensable pour consommer notre package ha-bridge depuis l'app editor
- Aucune autre solution propre : Next.js doit pouvoir resoudre l'import
- Une seule ligne ajoutee dans la liste des dependencies (alphabetique)

Consequence :
- En cas de merge upstream sur apps/editor/package.json, garder notre ligne
  `"@maison-3d/ha-bridge": "*"` (privilegier `--theirs` puis re-ajouter cette
  ligne, ou faire un merge manuel)

## D-009 : Swap Editor -> EditorWithHA dans apps/editor/app/page.tsx
Date : 2026-04-17

`apps/editor/app/page.tsx` (fichier Pascal) est modifié pour remplacer
l'import de `Editor` par `EditorWithHA` (notre wrapper dans
`apps/editor/ha/EditorWithHA.tsx`).

Rationale :
- Sans ce swap, `HABootstrap` et `HAMappingPanel` restent du code mort — la
  connexion HA et l'overlay UI ne se montent jamais.
- `EditorWithHA` proxy les props 1-pour-1 et ajoute uniquement `HABootstrap`
  + `HAMappingPanel` comme siblings. Aucune modif du composant `Editor`
  Pascal ni des panels (`packages/editor/src/components/ui/panels/`).
- Alternative rejetée : dupliquer `page.tsx` dans un dossier custom — plus
  de surface de conflit en cas d'evolution de la page upstream.

Consequence :
- En cas de merge upstream qui touche `page.tsx`, garder notre import
  `EditorWithHA` et merger manuellement le reste (sidebarTabs, toolbars).
- Toute extension UI globale (bandeau HA, notifications) passe par
  `EditorWithHA` — pas par `page.tsx`.

## D-008 : Pas de Zod dans apps/editor/ha/
Date : 2026-04-17

Le schema HA (`apps/editor/ha/schema.ts`) utilise des types TypeScript purs
(discriminated unions natifs) plutot que des schemas Zod.

Rationale :
- `apps/editor/package.json` n'a pas `zod` en dependance. L'ajouter = 2e
  modification d'un fichier Pascal existant (apres D-007).
- Les writes passent par `setHAMapping` qui enforce la shape au niveau type.
- Les reads lisent `node.metadata.ha` qu'on controle nous-memes -> validation
  runtime pas critique a ce stade.

Consequence :
- Si un jour on importe une scene depuis une source non-controlee, ajouter
  un parser (Zod ou custom) au boundary avant d'ecrire dans le store.
- Garder cette regle tant que la scene est produite uniquement par notre app.

## D-010 : Ajout de `useItemLightPool` au barrel `@pascal-app/viewer`

Date : 2026-04-18

Modification de `packages/viewer/src/index.ts` (fichier Pascal) pour ajouter
deux lignes d'export :

```ts
export { useItemLightPool } from './store/use-item-light-pool'
export type { LightRegistration } from './store/use-item-light-pool'
```

Rationale :
- La PHASE 5.1 (`syncLightColor` dans `apps/editor/ha/systems/light-effect-sync.ts`)
  a besoin de muter `registration.effect.color` pour faire suivre la couleur
  RGB HA sur le `THREE.PointLight` du pool Pascal.
- L'export était un oubli côté Pascal : `useInteractive` est déjà exporté
  depuis `@pascal-app/core`, `useItemLightPool` est l'analogue côté viewer
  pour la même raison (API de modif des states runtime).

Consequence :
- En cas de merge upstream qui réécrit `index.ts`, garder nos deux lignes
  d'export. Idéalement proposer l'export upstream pour supprimer cette
  customisation.
- Aucune modification de logique — juste deux lignes de re-export depuis un
  fichier interne au package. La surface de conflit est minimale.

## D-006 : Ecrasement du CLAUDE.md de Pascal
Date : 2026-04-17

Le CLAUDE.md de Pascal est un symlink vers `AGENTS.md` (fichier qui n'existe pas
dans le repo — lien casse). On l'ecrase par notre propre CLAUDE.md de fork.

Rationale :
- Le CLAUDE.md de Pascal est non fonctionnel (symlink brise)
- Notre CLAUDE.md contient les conventions specifiques a notre fork (regles
  d'or, permissions, anti-patterns HA) — indispensables a Claude Code
- Pas de perte d'information puisque Pascal n'avait pas de contenu utile

Consequence :
- C'est notre seule modification d'un fichier Pascal existant a ce stade
- En cas de merge upstream, privilegier notre version (`--ours` sur ce fichier)

## D-011 : Align ItemRenderer with Pascal's own asset:// pattern
Date : 2026-04-18
Contexte : PHASE 2 glb-catalog (spike technique avant plan d'impl)

Pascal possède déjà une infrastructure `asset://` complète via
`saveAsset()` / `loadAssetUrl()` dans `@pascal-app/core`, utilisée par
`ScanRenderer` et `GuideRenderer` via le hook `useAssetUrl`. Mais
`ItemRenderer` était l'exception — il utilisait le sync `resolveCdnUrl`
qui ne gère pas `asset://` (warn + return null).

Conséquence sans patch : tout GLB uploadé par l'user (`asset://<uuid>`)
ne pourrait pas être rendu par Pascal. Pour PHASE 2, soit fork de
~250 lignes (NodeRenderer + ItemRenderer) dans notre code, soit
alignement Pascal via patch local.

Décision : patch local de 2 fichiers dans packages/viewer/ :
- NOUVEAU : packages/viewer/src/hooks/use-resolved-asset-url.ts (~30 lignes)
  Hook sync-callable qui wrappe resolveAssetUrl (handle asset:// + CDN + http).
- PATCH : packages/viewer/src/components/renderers/item/item-renderer.tsx
  - Swap import : resolveCdnUrl -> useResolvedAssetUrl
  - Split ModelRenderer en 2 composants (rules-of-hooks : useGLTF ne peut
    pas etre conditionnel, donc parent resolve async + null guard, enfant
    appele useGLTF avec src resolved).

Rationale :
- Alignement interne Pascal avec son propre pattern (Scan/Guide renderers),
  pas une divergence. C'est un bug fix.
- Le split en 2 composants est le pattern React standard quand un hook
  async gate le render. Pas une reconstruction, juste rules-of-hooks
  compliance.
- Le fork aurait impose une dette technique lourde (double maintenance
  a chaque upstream sync sur les renderers, fichiers parmi les plus
  actifs du codebase Pascal).

Smoke tests (validés avant commit) :
- Tesla + pillar + Floor Lamp (items built-in) rendent toujours apres
  le patch. CDN path non-casse par useResolvedAssetUrl (resolveAssetUrl
  prepend ASSETS_CDN_URL pour les paths).
- Console propre (pas de warnings nouveaux).

Upstream candidate : oui. A soumettre apres stabilisation locale.
Si Pascal upstream ship une solution differente au meme bug ->
revert de notre patch, adopter upstream.

Consequence :
- 2e modification d'un fichier Pascal existant (apres D-006).
- Au merge upstream, privilegier nos versions si conflits sur ces 2 fichiers
  jusqu'a ce qu'upstream adopte le fix.

## D-015 : Thumbnails omises du bundle .maison3d.zip v1
Date : 2026-04-18
Contexte : PHASE 9 enriched (Task B5 — scene-bundle wiring editor)

Les thumbnails WebP des GLBs du catalogue ne sont PAS inclus dans le bundle
exporté aujourd'hui.

Raison : `@maison-3d/glb-catalog` n'expose pas de getter imperatif pour les
thumbnails (la table `thumbnails` Dexie est privee, seul `uploadGLB()` ecrit
dedans). Le manifest zod les marque `.optional()`, donc le bundle reste
valide sans.

Strategie cote consommateur :
- L'editeur sur re-import : `uploadGLB()` regenere la thumbnail au moment du
  rehydrate (coute ~20ms par asset via `renderThumbnail` WebGL2 offscreen).
- Le kiosk : rendra les thumbnails à la demande dans son UI catalogue (s'il
  a une UI catalogue en v1, ce qui n'est PAS le scope C1-C9).

Consequence :
- Un bundle exporte + importe sur un autre device aura des thumbnails
  regenerees, pas les thumbnails originales. Pour les seeds ou les user
  uploads avec thumbnail custom, c'est acceptable (meme source = meme
  render deterministe).
- A revoir : si on decide d'exposer `dbGetThumbnail(id)` comme export public
  de `@maison-3d/glb-catalog`, migrer `bundle-export.ts` pour les inclure
  en meme temps qu'un helper `rehydrateAssetFast` qui skip le render au
  re-import (voir I4 de la code review B5).

## D-012 : apps/kiosk = Next.js séparée sur port 3003, pas Vite
Date : 2026-04-18

La PHASE 4 du brief suggérait Vite pour le kiosk (bundle plus léger sur
tablette). Choix final : Next.js, même stack que l'editor, port 3003.

Rationale :
- `@pascal-app/viewer` et `@pascal-app/core` sont consommés via le
  `transpilePackages` de Next.js ; dupliquer cette config côté Vite
  ajouterait du maintenance (résolution Three.js, R3F, etc.).
- Turbopack `resolveAlias` (idem editor) suffit à éviter les duplicates
  react/three qui cassent R3F.
- Le `bun dev` unique à la racine lance les deux apps en parallèle
  (editor :3002, kiosk :3003) via turbo — DX simpler que Vite.
- Bundle size n'est pas un bloqueur sur tablette moderne (Fully Kiosk
  cache les assets après premier load).

Conséquence :
- Deux apps Next.js dans le monorepo. Upstream Pascal ne s'en préoccupe
  pas (c'est notre fork).

## D-013 : Format bundle .maison3d.zip v1
Date : 2026-04-18

Le bundle de transfert scène ↔ kiosque est une archive ZIP standard
(fflate, 8KB gzipped, pas de natif) contenant :

```
scene.maison3d.zip
├── manifest.json     ← zod SceneBundleManifestSchema v1
├── scene.json        ← { nodes, rootNodeIds } (format Pascal)
├── ha-config.json    ← { url: string | null }, JAMAIS le token
└── assets/
    ├── <uuid>.glb    ← blobs GLB référencés par asset://<uuid>
    └── thumbnails/
        └── <uuid>.webp  ← optionnel
```

Rationale :
- Format ouvert (le user peut unzip pour debug/archive).
- Manifest zod-validé à l'import (trust boundary).
- Écrit par `writeBundle()`, relu par `readBundle()`. Round-trip unit-tested.
- Token HA explicitement exclu (pas de champ `token` dans le schema).
  Le kiosk a son propre long-lived token renseigné dans son wizard.

Conséquence :
- Version stamping `version: z.literal(1)` : bump si le format évolue
  incompatiblement. Ajouts backward-compat via nouveaux champs optionnels.
- Thumbnails omises pour l'instant côté editor export (voir D-015).

## D-014 : Extraction @maison-3d/ha-systems en package partagé
Date : 2026-04-18

Déplacement de `apps/editor/ha/systems/` vers un nouveau package
`packages/ha-systems/` pour partage editor + kiosk sans duplication.

Rationale :
- Le kiosk a besoin des mêmes systèmes R3F (HAVisualSystem pour
  l'émissive/couleur/brightness, HAInteractionSystem pour le tap) sans
  traîner le reste du code editor.
- L'extraction est mécanique (pas de logique editor-only dans les
  systèmes) — simple déplacement + adaptation des imports
  relatifs.
- `apps/editor/ha/systems/index.ts` et `apps/editor/ha/schema.ts`
  deviennent des re-export shims pour ne pas toucher les call-sites
  existants (HAMappingPanel, mapping-helpers, EditorWithHA).

Conséquence :
- 13 fichiers dans le nouveau package (8 systèmes + schema + barrel +
  3 tests).
- `HAInteractionSystem` gagne une prop optionnelle `scope?: 'editor'|'kiosk'`
  — en kiosk, les actions `popup` sont no-op avec warn-once par entité
  (PHASE 7 différée post-kiosk).
