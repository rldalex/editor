import { callService as haCallService } from 'home-assistant-js-websocket'
import { getConnection } from './connection'
import type { HAServiceTarget } from './types'

export interface CallServiceOptions {
  domain: string
  service: string
  data?: Record<string, unknown>
  target?: HAServiceTarget
}

export const callService = async ({
  domain,
  service,
  data,
  target,
}: CallServiceOptions): Promise<void> => {
  const connection = getConnection()
  if (!connection) {
    throw new Error('HA connection not established. Call connectHA first.')
  }
  await haCallService(connection, domain, service, data, target)
}

export const toggleEntity = (entityId: string): Promise<void> => {
  const domain = entityId.split('.')[0]
  if (!domain) throw new Error(`Invalid entity_id: ${entityId}`)
  return callService({
    domain,
    service: 'toggle',
    target: { entity_id: entityId },
  })
}

export const turnOn = (
  entityId: string,
  data?: Record<string, unknown>,
): Promise<void> => {
  const domain = entityId.split('.')[0]
  if (!domain) throw new Error(`Invalid entity_id: ${entityId}`)
  return callService({
    domain,
    service: 'turn_on',
    data,
    target: { entity_id: entityId },
  })
}

export const turnOff = (entityId: string): Promise<void> => {
  const domain = entityId.split('.')[0]
  if (!domain) throw new Error(`Invalid entity_id: ${entityId}`)
  return callService({
    domain,
    service: 'turn_off',
    target: { entity_id: entityId },
  })
}
