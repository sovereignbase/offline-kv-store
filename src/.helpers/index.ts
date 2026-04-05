import { KVStoreError } from '../.errors/class.js'

export function isKey(value: string, label: string): void {
  if (typeof value !== 'string' || value.length <= 0) {
    throw new KVStoreError(
      'NAME_WAS_NOT_A_STRING',
      `${label} must be a non-empty string`
    )
  }
}
