import { entityDomain, type HAEntity, type HAState } from '@maison-3d/ha-bridge'

/**
 * Blender naming convention → HA domain suggestion.
 *
 * A user uploads a GLB with meshes named `light_salon`, `volet_cuisine`, etc.
 * This map drives auto-suggestion of the HA domain when mapping the mesh.
 * See CLAUDE.md "Convention de nommage Blender".
 */
const PREFIX_TO_DOMAIN: Array<{ prefixes: string[]; domain: string }> = [
  { prefixes: ['light_', 'lampe_', 'lamp_'], domain: 'light' },
  { prefixes: ['volet_', 'store_', 'cover_', 'rideau_'], domain: 'cover' },
  { prefixes: ['thermostat_', 'clim_', 'climate_', 'chauffage_'], domain: 'climate' },
  { prefixes: ['prise_', 'switch_', 'plug_'], domain: 'switch' },
  { prefixes: ['capteur_', 'sensor_'], domain: 'sensor' },
  { prefixes: ['tv_', 'media_', 'speaker_', 'enceinte_'], domain: 'media_player' },
  { prefixes: ['porte_', 'fenetre_', 'fenêtre_', 'window_', 'door_'], domain: 'binary_sensor' },
  { prefixes: ['ventilo_', 'fan_'], domain: 'fan' },
]

/**
 * Infer an HA domain from a mesh / node name using the Blender convention.
 * Returns undefined when no prefix matches.
 */
export function suggestDomain(meshName: string): string | undefined {
  const lower = meshName.toLowerCase()
  for (const { prefixes, domain } of PREFIX_TO_DOMAIN) {
    if (prefixes.some((p) => lower.startsWith(p))) return domain
  }
  return undefined
}

/**
 * Strip the Blender prefix to extract the semantic "room/object" part of the
 * name. `light_salon_principal` → `salon_principal`.
 */
export function stripPrefix(meshName: string): string {
  const lower = meshName.toLowerCase()
  for (const { prefixes } of PREFIX_TO_DOMAIN) {
    for (const p of prefixes) {
      if (lower.startsWith(p)) return lower.slice(p.length)
    }
  }
  return lower
}

/**
 * Normalize a string for fuzzy matching : lowercase, strip accents, replace
 * non-alphanumeric with spaces, collapse whitespace.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokens(s: string): string[] {
  return normalize(s).split(' ').filter(Boolean)
}

/**
 * Score how well an HA entity matches a given mesh name.
 *
 * Returns a number in [0, 1]. Heavier weight for a domain prefix match, then
 * weighted token overlap between the stripped mesh name and the entity's
 * friendly-name / entity_id.
 */
export function scoreMatch(
  meshName: string,
  entity: HAEntity,
  state?: HAState,
): number {
  const domain = entityDomain(entity.entity_id)
  const suggested = suggestDomain(meshName)
  const domainBonus = suggested && suggested === domain ? 0.4 : 0

  const stripped = stripPrefix(meshName)
  const meshTokens = tokens(stripped)
  if (meshTokens.length === 0) return domainBonus

  const friendlyName = (state?.attributes?.friendly_name as string | undefined) ?? entity.name ?? ''
  const entityTokens = [
    ...tokens(friendlyName),
    ...tokens(entity.entity_id.replace(/^[^.]+\./, '')),
  ]
  if (entityTokens.length === 0) return domainBonus

  const matched = meshTokens.filter((t) =>
    entityTokens.some((e) => e === t || e.includes(t) || t.includes(e)),
  ).length
  const ratio = matched / meshTokens.length

  return Math.min(1, domainBonus + ratio * 0.6)
}

export type EntitySuggestion = {
  entity: HAEntity
  state?: HAState
  score: number
  domain: string
}

/**
 * Rank candidate HA entities for a given mesh name.
 *
 * When `suggestDomain(meshName)` is defined, entities of that domain are
 * ranked first; otherwise all entities are scored. Returns the top `limit`
 * non-zero matches, sorted desc by score.
 */
export function suggestEntities(
  meshName: string,
  entities: HAEntity[],
  states: Record<string, HAState>,
  limit = 10,
): EntitySuggestion[] {
  const suggestedDomain = suggestDomain(meshName)

  const candidates = suggestedDomain
    ? entities.filter((e) => entityDomain(e.entity_id) === suggestedDomain)
    : entities

  const pool = candidates.length > 0 ? candidates : entities

  return pool
    .map((entity) => ({
      entity,
      state: states[entity.entity_id],
      score: scoreMatch(meshName, entity, states[entity.entity_id]),
      domain: entityDomain(entity.entity_id),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

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
