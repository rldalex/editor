import {
  type Connection,
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
} from 'home-assistant-js-websocket'
import { haStore } from './store'
import type { HAArea, HADevice, HAEntity, HAState } from './types'

let activeConnection: Connection | null = null
let unsubscribers: Array<() => void> = []

export const getConnection = (): Connection | null => activeConnection

export interface ConnectHAOptions {
  url: string
  token: string
}

export const connectHA = async ({
  url,
  token,
}: ConnectHAOptions): Promise<Connection> => {
  if (activeConnection) return activeConnection

  haStore.getState().setStatus('connecting')

  try {
    const auth = createLongLivedTokenAuth(url, token)
    const connection = await createConnection({ auth })
    activeConnection = connection

    haStore.getState().setStatus('connected')

    const unsubStates = subscribeEntities(connection, (entities) => {
      haStore.getState().setStates(entities as Record<string, HAState>)
    })
    unsubscribers.push(unsubStates)

    unsubscribers.push(
      subscribeRegistry(connection, 'config/entity_registry/list', (rows) =>
        haStore.getState().setEntities(rows as HAEntity[]),
      ),
    )
    unsubscribers.push(
      subscribeRegistry(connection, 'config/area_registry/list', (rows) =>
        haStore.getState().setAreas(rows as HAArea[]),
      ),
    )
    unsubscribers.push(
      subscribeRegistry(connection, 'config/device_registry/list', (rows) =>
        haStore.getState().setDevices(rows as HADevice[]),
      ),
    )

    connection.addEventListener('disconnected', () =>
      haStore.getState().setStatus('disconnected'),
    )
    connection.addEventListener('ready', () =>
      haStore.getState().setStatus('connected'),
    )

    return connection
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    haStore.getState().setStatus('error', message)
    throw err
  }
}

export const disconnectHA = (): void => {
  for (const unsub of unsubscribers) {
    try {
      unsub()
    } catch {}
  }
  unsubscribers = []
  if (activeConnection) {
    activeConnection.close()
    activeConnection = null
  }
  haStore.getState().reset()
}

const subscribeRegistry = <T>(
  connection: Connection,
  type: string,
  onRows: (rows: T[]) => void,
): (() => void) => {
  const fetch = () =>
    connection
      .sendMessagePromise<T[]>({ type })
      .then(onRows)
      .catch(() => {})

  fetch()

  const unsub = connection.subscribeEvents(() => {
    fetch()
  }, type.replace('config/', '').replace('/list', '_updated'))

  return () => {
    unsub.then((fn) => fn()).catch(() => {})
  }
}
