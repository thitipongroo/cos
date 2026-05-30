import { randomUUID } from 'crypto';

/** Generate a new UUID v4 for entity IDs. */
export function generateId(): string {
  return randomUUID();
}
