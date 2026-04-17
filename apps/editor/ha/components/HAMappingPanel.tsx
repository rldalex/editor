'use client'

import { type AnyNodeId, type ItemNode, useScene } from '@pascal-app/core'
import { entityDomain, useHAConnection, useHAEntities, useHAState, useHAStates } from '@maison-3d/ha-bridge'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useMemo, useState } from 'react'
import { getHAMapping, removeHAMapping, setHAMapping } from '../mapping-helpers'
import type { HAAction, HAEntityBinding, HAMapping, HAVisualMapping } from '../schema'
import { type EntitySuggestion, suggestEntities } from '../suggest'

type VisualKind = HAVisualMapping['kind'] | 'none'
type ActionKind = HAAction['kind']

const VISUAL_KINDS: ReadonlyArray<{ kind: VisualKind; label: string; disabled?: boolean }> = [
  { kind: 'none', label: 'Aucun' },
  { kind: 'emissive', label: 'Émissive (lumière)' },
  { kind: 'cover', label: 'Cover (volet/porte)', disabled: true },
  { kind: 'label', label: 'Label (valeur)', disabled: true },
  { kind: 'color', label: 'Couleur (état→couleur)', disabled: true },
]

const ACTION_KINDS: ReadonlyArray<{ kind: ActionKind; label: string; disabled?: boolean }> = [
  { kind: 'none', label: 'Aucune' },
  { kind: 'toggle', label: 'Toggle' },
  { kind: 'call_service', label: 'Call service', disabled: true },
  { kind: 'popup', label: 'Popup', disabled: true },
  { kind: 'navigate', label: 'Navigate', disabled: true },
]

function HAStatusChip() {
  const { status } = useHAConnection()
  const color =
    status === 'connected'
      ? 'bg-green-500'
      : status === 'connecting'
        ? 'bg-yellow-500'
        : status === 'error'
          ? 'bg-red-500'
          : 'bg-gray-400'
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      HA {status}
    </span>
  )
}

function LiveStatePreview({ entityId }: { entityId: string }) {
  const state = useHAState(entityId)
  if (!state) {
    return <div className="text-xs text-gray-500">Pas d'état live pour {entityId}</div>
  }
  const friendly = (state.attributes?.friendly_name as string | undefined) ?? entityId
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
      <div className="font-medium text-gray-800">{friendly}</div>
      <div className="text-gray-600">
        état : <span className="font-mono">{state.state}</span>
      </div>
    </div>
  )
}

function EntityPicker({
  meshName,
  value,
  onChange,
}: {
  meshName: string
  value: string
  onChange: (entityId: string, domain: string) => void
}) {
  const entities = useHAEntities()
  const states = useHAStates()
  const [query, setQuery] = useState('')

  const suggestions = useMemo<EntitySuggestion[]>(() => {
    const q = query.trim()
    if (q.length === 0) {
      return suggestEntities(meshName, entities, states, 8)
    }
    const lower = q.toLowerCase()
    return entities
      .filter((e) => {
        const name = (states[e.entity_id]?.attributes?.friendly_name as string | undefined) ?? e.name ?? ''
        return e.entity_id.toLowerCase().includes(lower) || name.toLowerCase().includes(lower)
      })
      .slice(0, 20)
      .map((entity) => ({
        entity,
        state: states[entity.entity_id],
        score: 0,
        domain: entityDomain(entity.entity_id),
      }))
  }, [entities, states, query, meshName])

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Chercher une entité…"
        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
      />
      {value && (
        <div className="text-[11px] text-gray-600">
          Sélectionnée : <span className="font-mono">{value}</span>
        </div>
      )}
      <ul className="max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white">
        {suggestions.length === 0 && (
          <li className="px-2 py-1.5 text-xs text-gray-500">Aucun résultat</li>
        )}
        {suggestions.map(({ entity, state, score, domain }) => {
          const friendly =
            (state?.attributes?.friendly_name as string | undefined) ?? entity.name ?? entity.entity_id
          const isSelected = entity.entity_id === value
          return (
            <li key={entity.entity_id}>
              <button
                type="button"
                onClick={() => onChange(entity.entity_id, domain)}
                className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-gray-100 ${
                  isSelected ? 'bg-blue-50' : ''
                }`}
              >
                <span className="flex flex-col">
                  <span className="font-medium text-gray-800">{friendly}</span>
                  <span className="font-mono text-[10px] text-gray-500">{entity.entity_id}</span>
                </span>
                {score > 0 && (
                  <span className="text-[10px] text-gray-400">{Math.round(score * 100)}%</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function HAMappingEditor({ node }: { node: ItemNode }) {
  const existing = useMemo<HAMapping | undefined>(() => getHAMapping(node), [node])
  const existingBinding: HAEntityBinding | undefined = existing?.bindings[0]

  const meshName = node.name ?? node.asset?.name ?? ''

  const [entityId, setEntityId] = useState(existingBinding?.entityId ?? '')
  const [domain, setDomain] = useState(existingBinding?.domain ?? '')
  const [visualKind, setVisualKind] = useState<VisualKind>(existingBinding?.visual?.kind ?? 'none')
  const [tapKind, setTapKind] = useState<ActionKind>(existingBinding?.tapAction?.kind ?? 'none')

  // Reset local state when selection changes to a different node
  useEffect(() => {
    const b = getHAMapping(node)?.bindings[0]
    setEntityId(b?.entityId ?? '')
    setDomain(b?.domain ?? '')
    setVisualKind(b?.visual?.kind ?? 'none')
    setTapKind(b?.tapAction?.kind ?? 'none')
  }, [node.id])

  const canSave = entityId !== '' && domain !== ''

  const onSave = () => {
    if (!canSave) return
    const visual: HAVisualMapping | undefined =
      visualKind === 'emissive'
        ? { kind: 'emissive' }
        : visualKind === 'none'
          ? undefined
          : undefined
    const tapAction: HAAction | undefined =
      tapKind === 'none' ? undefined : tapKind === 'toggle' ? { kind: 'toggle' } : undefined

    const binding: HAEntityBinding = {
      entityId,
      domain,
      ...(visual ? { visual } : {}),
      ...(tapAction ? { tapAction } : {}),
    }
    setHAMapping(node.id, { bindings: [binding] })
  }

  const onRemove = () => {
    removeHAMapping(node.id)
    setEntityId('')
    setDomain('')
    setVisualKind('none')
    setTapKind('none')
  }

  return (
    <div className="space-y-3">
      <section className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Entité HA
        </label>
        <EntityPicker
          meshName={meshName}
          value={entityId}
          onChange={(id, dom) => {
            setEntityId(id)
            setDomain(dom)
          }}
        />
        {entityId && <LiveStatePreview entityId={entityId} />}
      </section>

      <section className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Visuel
        </label>
        <select
          value={visualKind}
          onChange={(e) => setVisualKind(e.target.value as VisualKind)}
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
        >
          {VISUAL_KINDS.map((v) => (
            <option key={v.kind} value={v.kind} disabled={v.disabled}>
              {v.label}
              {v.disabled ? ' — bientôt' : ''}
            </option>
          ))}
        </select>
      </section>

      <section className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Action au tap
        </label>
        <select
          value={tapKind}
          onChange={(e) => setTapKind(e.target.value as ActionKind)}
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
        >
          {ACTION_KINDS.map((a) => (
            <option key={a.kind} value={a.kind} disabled={a.disabled}>
              {a.label}
              {a.disabled ? ' — bientôt' : ''}
            </option>
          ))}
        </select>
      </section>

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={onRemove}
          disabled={!existing}
          className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Supprimer
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Enregistrer
        </button>
      </div>
    </div>
  )
}

/**
 * Overlay panel displayed when exactly one ItemNode is selected. Sits in its
 * own corner — does NOT touch Pascal's PanelManager (packages/editor read-only).
 */
export function HAMappingPanel() {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const nodes = useScene((s) => s.nodes)

  if (selectedIds.length !== 1) return null
  const firstId = selectedIds[0]
  if (!firstId) return null
  const node = nodes[firstId as AnyNodeId]
  if (!node || node.type !== 'item') return null

  return (
    <div className="pointer-events-auto fixed bottom-4 left-4 z-40 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
      <header className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Mapping Home Assistant</h3>
          <p className="text-[11px] text-gray-500">
            {node.name ?? node.asset?.name ?? node.id}
          </p>
        </div>
        <HAStatusChip />
      </header>
      <HAMappingEditor node={node} />
    </div>
  )
}
