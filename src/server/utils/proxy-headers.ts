/**
 * Shared proxy header utility for Agent-Dashboard LLM proxy integration.
 * Reads proxy_settings from DB and builds x-service-id / x-dept-name headers.
 * Korean text in x-dept-name is URL-encoded per nexus-coder's safeDecodeURIComponent.
 */

import { getSetting } from '../db/dal.js';
import type { ProxySettings } from '../types/index.js';

export function getProxyHeaders(): Record<string, string> {
  const ps = getSetting<ProxySettings>('proxy_settings');
  if (!ps?.serviceId) return {};
  const headers: Record<string, string> = {
    'x-service-id': ps.serviceId,
  };
  if (ps.deptName) {
    // URL-encode Korean text for safe HTTP header transport
    headers['x-dept-name'] = encodeURIComponent(ps.deptName);
  }
  return headers;
}
