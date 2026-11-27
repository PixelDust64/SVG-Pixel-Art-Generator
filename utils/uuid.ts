/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates a RFC4122 v4 UUID safely in any environment.
 * crypto.randomUUID() is only available in Secure Contexts (HTTPS or localhost).
 * When accessing via IP on a local network (HTTP), a fallback is required.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback for non-secure HTTP contexts (e.g. accessing via LAN IP)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
