import { KVStoreError } from '../.errors/class.js'

/**
 * Verifies that a namespace or key is a non-empty string.
 *
 * @param value The value to validate.
 * @param label The parameter name to include in the error message.
 * @throws {KVStoreError} Thrown if `value` is not a non-empty string.
 */
export function isKey(value: string, label: string): void {
  if (typeof value !== 'string' || value.length <= 0) {
    throw new KVStoreError(
      'NAME_WAS_INVALID',
      `${label} must be a non-empty string`
    )
  }
}
