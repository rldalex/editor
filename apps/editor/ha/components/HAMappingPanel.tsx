'use client'

import { type AnyNodeId, type ItemNode, useScene } from '@pascal-app/core'
import {
  entityDomain,
  useHAConnection,
  useHAEntities,
  useHAState,
  useHAStates,
} from '@maison-3d/ha-bridge'
import { useViewer } from '@pascal-app/viewer'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
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

// --- Subcomponents (Pascal design language) ---

function StatusDot({ status }: { status: 'connected' | 'connecting' | 'disconnected' | 'error' }) {
  const color =
    status === 'connected'
      ? 'bg-emerald-500'
      : status === 'connecting'
        ? 'bg-amber-500'
        : status === 'error'
          ? 'bg-red-500'
          : 'bg-muted-foreground/40'
  return <span className={clsx('inline-block h-2 w-2 rounded-full', color)} />
}

function Pill({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'info' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]',
        tone === 'info'
          ? 'bg-accent/60 text-foreground'
          : 'bg-[#2C2C2E] text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

/**
 * Matches Pascal's PanelSection look (title bar + body) without pulling in
 * motion/react. No collapse animation — HA section stays open to be findable.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col border-border/50 border-b">
      <div className="flex h-10 shrink-0 items-center justify-between bg-accent/50 px-3">
        <span className="truncate font-medium text-foreground text-sm">{title}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-3 pt-2">{children}</div>
    </div>
  )
}

function LiveStatePreview({ entityId }: { entityId: string }) {
  const state = useHAState(entityId)
  if (!state) {
    return (
      <div className="rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-muted-foreground text-xs">
        Pas d'état live pour <span className="font-mono">{entityId}</span>
      </div>
    )
  }
  const friendly = (state.attributes?.friendly_name as string | undefined) ?? entityId
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5">
      <span className="truncate font-medium text-foreground text-xs">{friendly}</span>
      <Pill tone="info">{state.state}</Pill>
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
        const name =
          (states[e.entity_id]?.attributes?.friendly_name as string | undefined) ?? e.name ?? ''
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
    <div className="flex flex-col gap-1.5">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Chercher une entité…"
        className="h-8 w-full rounded-md border border-border/50 bg-[#2C2C2E] px-2 text-foreground text-xs outline-none placeholder:text-muted-foreground focus:border-primary/40"
      />
      {value && (
        <div className="text-[11px] text-muted-foreground">
          Sélectionnée : <span className="font-mono text-foreground">{value}</span>
        </div>
      )}
      <ul className="no-scrollbar max-h-48 overflow-y-auto rounded-md border border-border/50 bg-[#2C2C2E]">
        {suggestions.length === 0 && (
          <li className="px-2 py-1.5 text-muted-foreground text-xs">Aucun résultat</li>
        )}
        {suggestions.map(({ entity, state, score }) => {
          const friendly =
            (state?.attributes?.friendly_name as string | undefined) ??
            entity.name ??
            entity.entity_id
          const isSelected = entity.entity_id === value
          return (
            <li key={entity.entity_id}>
              <button
                type="button"
                onClick={() => onChange(entity.entity_id, entityDomain(entity.entity_id))}
                className={clsx(
                  'flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs transition-colors',
                  isSelected
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:bg-[#3e3e3e] hover:text-foreground',
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{friendly}</span>
                  <span className="truncate font-mono text-[10px] opacity-70">
                    {entity.entity_id}
                  </span>
                </span>
                {score > 0 && <Pill>{Math.round(score * 100)}%</Pill>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: ReadonlyArray<{ kind: T; label: string; disabled?: boolean }>
  onChange: (v: T) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-8 w-full rounded-md border border-border/50 bg-[#2C2C2E] px-2 text-foreground text-xs outline-none focus:border-primary/40"
    >
      {options.map((o) => (
        <option key={o.kind} value={o.kind} disabled={o.disabled}>
          {o.label}
          {o.disabled ? ' — bientôt' : ''}
        </option>
      ))}
    </select>
  )
}

/**
 * The part that gets portaled into Pascal's ItemPanel body. Pascal's PanelSection
 * components live side-by-side in the scrollable content; our sections mimic
 * that exact structure so the visual flow is continuous.
 */
function HAMappingSections({ node }: { node: ItemNode }) {
  const existing = useMemo<HAMapping | undefined>(() => getHAMapping(node), [node])
  const existingBinding: HAEntityBinding | undefined = existing?.bindings[0]
  const { status } = useHAConnection()

  const meshName = node.name ?? node.asset?.name ?? ''

  const [entityId, setEntityId] = useState(existingBinding?.entityId ?? '')
  const [domain, setDomain] = useState(existingBinding?.domain ?? '')
  const [visualKind, setVisualKind] = useState<VisualKind>(existingBinding?.visual?.kind ?? 'none')
  const [tapKind, setTapKind] = useState<ActionKind>(existingBinding?.tapAction?.kind ?? 'none')
  // "Glow" controls whether the mesh itself lights up (emissive > 0), in
  // addition to the real PointLight that may fire from the asset's
  // LightEffect. Stored as intensityOn/intensityOff in the binding.
  const [glow, setGlow] = useState<boolean>(
    existingBinding?.visual?.kind === 'emissive'
      ? (existingBinding.visual.intensityOn ?? 1.5) > 0
      : true,
  )

  useEffect(() => {
    const b = getHAMapping(node)?.bindings[0]
    setEntityId(b?.entityId ?? '')
    setDomain(b?.domain ?? '')
    setVisualKind(b?.visual?.kind ?? 'none')
    setTapKind(b?.tapAction?.kind ?? 'none')
    setGlow(
      b?.visual?.kind === 'emissive' ? (b.visual.intensityOn ?? 1.5) > 0 : true,
    )
  }, [node.id])

  const canSave = entityId !== '' && domain !== ''

  const onSave = () => {
    if (!canSave) return
    const visual: HAVisualMapping | undefined =
      visualKind === 'emissive'
        ? {
            kind: 'emissive',
            intensityOn: glow ? 1.5 : 0,
            intensityOff: 0,
          }
        : undefined
    const tapAction: HAAction | undefined =
      tapKind === 'toggle' ? { kind: 'toggle' } : undefined

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
    setGlow(true)
  }

  return (
    <>
      {/* Divider header marking the start of our HA block */}
      <div className="flex h-10 shrink-0 items-center justify-between border-border/50 border-t border-b bg-accent/70 px-3">
        <span className="truncate font-semibold text-foreground text-sm tracking-tight">
          Home Assistant
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <StatusDot status={status} />
          {status}
        </span>
      </div>

      <Section title="Entité HA">
        <EntityPicker
          meshName={meshName}
          value={entityId}
          onChange={(id, dom) => {
            setEntityId(id)
            setDomain(dom)
          }}
        />
        {entityId && <LiveStatePreview entityId={entityId} />}
      </Section>

      <Section title="Visuel">
        <Select value={visualKind} options={VISUAL_KINDS} onChange={setVisualKind} />
        {visualKind === 'emissive' && (
          <label className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-xs text-foreground hover:bg-[#3e3e3e]">
            <input
              type="checkbox"
              checked={glow}
              onChange={(e) => setGlow(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-primary"
            />
            <span className="flex-1">Faire glow le mesh quand allumé</span>
            <span className="text-[10px] text-muted-foreground">
              {glow ? 'oui' : 'non'}
            </span>
          </label>
        )}
      </Section>

      <Section title="Action au tap">
        <Select value={tapKind} options={ACTION_KINDS} onChange={setTapKind} />
      </Section>

      <div className="flex items-center justify-between gap-2 bg-accent/30 px-3 py-2">
        <button
          type="button"
          onClick={onRemove}
          disabled={!existing}
          className="rounded-md bg-[#2C2C2E] px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-[#3e3e3e] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          Supprimer
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Enregistrer
        </button>
      </div>
    </>
  )
}

/**
 * Selector for Pascal's PanelWrapper content area. The PanelWrapper outer div
 * uses `fixed top-20 right-4 z-50` + `rounded-xl bg-sidebar/95` (see
 * packages/editor/src/components/ui/panels/panel-wrapper.tsx). Its content
 * body is the inner direct-child div with the `no-scrollbar` marker class.
 *
 * If upstream changes the PanelWrapper classes, this selector needs updating —
 * we'll degrade gracefully (panel won't render anywhere).
 */
function findItemPanelBody(): HTMLElement | null {
  const wrappers = document.querySelectorAll<HTMLElement>(
    '.pointer-events-auto.fixed.top-20.right-4',
  )
  for (const wrapper of Array.from(wrappers)) {
    // Body is the direct child with the `no-scrollbar` class.
    const body = wrapper.querySelector<HTMLElement>(':scope > .no-scrollbar')
    if (body) return body
  }
  return null
}

/**
 * Tracks Pascal's ItemPanel mount/unmount via MutationObserver so we can portal
 * our sections into its scrollable body. Re-renders our content whenever the
 * anchor changes.
 */
function useItemPanelAnchor(enabled: boolean): HTMLElement | null {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!enabled) {
      setAnchor(null)
      return
    }
    const update = () => {
      const next = findItemPanelBody()
      setAnchor((curr) => (curr === next ? curr : next))
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [enabled])

  return anchor
}

/**
 * Injects an "Home Assistant" block at the bottom of Pascal's ItemPanel via
 * portal. Does not render a standalone floating panel — lives inside Pascal's
 * PanelWrapper body.
 */
export function HAMappingPanel() {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const nodes = useScene((s) => s.nodes)

  const singleItemId =
    selectedIds.length === 1 ? (selectedIds[0] as AnyNodeId | undefined) : undefined
  const node = singleItemId ? nodes[singleItemId] : undefined
  const isItem = !!node && node.type === 'item'

  const anchor = useItemPanelAnchor(isItem)

  if (!isItem || !anchor) return null
  return createPortal(<HAMappingSections node={node as ItemNode} />, anchor)
}
