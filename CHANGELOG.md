# Changelog

## [Unreleased]

### 2026-04-17 — feat

- PHASE 4 : UI HA Mapping dans l'éditeur.
  - `apps/editor/ha/suggest.ts` : `suggestDomain` (préfixes Blender), `scoreMatch`
    (domain bonus + token overlap normalisé), `suggestEntities` (tri top-N).
  - `apps/editor/ha/components/HAMappingPanel.tsx` : overlay bottom-left actif
    quand exactement 1 ItemNode sélectionné. Entity picker (autocomplete +
    suggestions), preview état live, selectors visuel + action tap,
    boutons Enregistrer / Supprimer. v1 = emissive + toggle; cover/label/color
    et call_service/popup/navigate affichés mais désactivés ("bientôt").
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
