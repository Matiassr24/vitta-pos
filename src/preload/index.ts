import { contextBridge } from 'electron'
import { api } from './api'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (tsconfig.node.json no tiene lib DOM; esta rama es
  // solo para el caso legacy sin context isolation)
  window.api = api
}
