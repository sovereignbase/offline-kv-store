/**
 * A stored key-value entry.
 *
 * @typeParam T The stored value type.
 */
export type Row<T> = {
  key: string
  value: T
}
