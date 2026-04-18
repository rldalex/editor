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
