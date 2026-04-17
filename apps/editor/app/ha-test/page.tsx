'use client'

import {
  type HAEntity,
  toggleEntity,
  useHAConnection,
  useHAEntities,
  useHAStates,
} from '@maison-3d/ha-bridge'
import { useMemo, useState } from 'react'
import { HABootstrap } from '../../ha/HABootstrap'

const STATUS_COLOR: Record<string, string> = {
  disconnected: '#94a3b8',
  connecting: '#fbbf24',
  connected: '#22c55e',
  error: '#ef4444',
}

export default function HATestPage() {
  const { status, error } = useHAConnection()
  const entities = useHAEntities()
  const states = useHAStates()
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const visible = useMemo(() => {
    const q = filter.toLowerCase().trim()
    const list = entities
      .map((e) => ({ entity: e, state: states[e.entity_id] }))
      .filter(({ entity }) =>
        q ? entity.entity_id.toLowerCase().includes(q) : true,
      )
    return list.slice(0, 200)
  }, [entities, states, filter])

  const stats = useMemo(() => {
    const byDomain: Record<string, number> = {}
    for (const e of entities) {
      const d = e.entity_id.split('.')[0] ?? '?'
      byDomain[d] = (byDomain[d] ?? 0) + 1
    }
    return byDomain
  }, [entities])

  const handleToggle = async (entity: HAEntity) => {
    setBusy(entity.entity_id)
    try {
      await toggleEntity(entity.entity_id)
    } catch (err) {
      console.error(err)
      alert(`Toggle failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
        maxWidth: 1100,
        margin: '0 auto',
        color: '#0f172a',
      }}
    >
      <HABootstrap />

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, margin: '0 0 8px' }}>HA Bridge — POC</h1>
        <p style={{ color: '#475569', margin: 0 }}>
          Validation phase 1 : connexion live a Home Assistant + lecture des
          entites + appel de service.
        </p>
      </header>

      <section
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          padding: '12px 16px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: 99,
            background: STATUS_COLOR[status] ?? '#94a3b8',
          }}
        />
        <strong>{status}</strong>
        {error && <span style={{ color: '#ef4444' }}>— {error}</span>}
        <span style={{ marginLeft: 'auto', color: '#64748b' }}>
          {entities.length} entites · {Object.keys(states).length} etats
        </span>
      </section>

      <section style={{ marginBottom: 16 }}>
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
            Repartition par domaine
          </summary>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 8,
            }}
          >
            {Object.entries(stats)
              .sort((a, b) => b[1] - a[1])
              .map(([domain, count]) => (
                <span
                  key={domain}
                  style={{
                    fontSize: 12,
                    padding: '4px 8px',
                    background: '#e2e8f0',
                    borderRadius: 99,
                  }}
                >
                  {domain}: {count}
                </span>
              ))}
          </div>
        </details>
      </section>

      <input
        type="text"
        placeholder="Filter par entity_id (ex: light.salon)"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          fontSize: 14,
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          marginBottom: 12,
        }}
      />

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          background: 'white',
        }}
      >
        <thead>
          <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
            <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
              entity_id
            </th>
            <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
              state
            </th>
            <th
              style={{
                padding: 8,
                borderBottom: '1px solid #e2e8f0',
                width: 120,
              }}
            >
              action
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map(({ entity, state }) => {
            const domain = entity.entity_id.split('.')[0]
            const canToggle =
              domain === 'light' ||
              domain === 'switch' ||
              domain === 'fan' ||
              domain === 'cover' ||
              domain === 'input_boolean'
            return (
              <tr
                key={entity.entity_id}
                style={{ borderBottom: '1px solid #f1f5f9' }}
              >
                <td
                  style={{
                    padding: 8,
                    fontFamily: 'monospace',
                    fontSize: 12,
                  }}
                >
                  {entity.entity_id}
                </td>
                <td style={{ padding: 8 }}>
                  {state ? (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        background:
                          state.state === 'on'
                            ? '#dcfce7'
                            : state.state === 'off'
                              ? '#fef2f2'
                              : '#f1f5f9',
                      }}
                    >
                      {state.state}
                    </span>
                  ) : (
                    <em style={{ color: '#94a3b8' }}>(no state)</em>
                  )}
                </td>
                <td style={{ padding: 8 }}>
                  {canToggle && (
                    <button
                      type="button"
                      onClick={() => handleToggle(entity)}
                      disabled={busy === entity.entity_id}
                      style={{
                        padding: '4px 10px',
                        fontSize: 12,
                        background: '#0f172a',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        opacity: busy === entity.entity_id ? 0.5 : 1,
                      }}
                    >
                      {busy === entity.entity_id ? '...' : 'toggle'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {entities.length === 0 && status === 'connected' && (
        <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: 24 }}>
          Connecte mais aucune entite — registry pas encore charge ?
        </p>
      )}
    </div>
  )
}
