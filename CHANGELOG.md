# Changelog

## [Unreleased]

### 2026-04-17 — feat

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
