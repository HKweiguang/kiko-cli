/**
 * Build the copyable API URLs for the running server.
 *
 * Shared by the `kiko web` ready banner and `kiko web rotate-token` so both
 * show the same Local/Network REST base URLs. The server no longer serves a
 * bundled browser UI, so these are API endpoints rather than pages.
 */

import { formatHostForUrl, listNetworkAddresses, type NetworkAddress } from './networks';

/** Base path of the REST API (the WebSocket stream lives at `${API_BASE_PATH}/ws`). */
export const API_BASE_PATH = '/api/v1';

/** Append the REST base path to a server origin. */
export function buildApiUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}${API_BASE_PATH}`;
}

export interface AccessUrlLine {
  /** Fixed-width label including trailing padding, e.g. `"Local:    "`. */
  label: string;
  /** REST API base URL for that address. */
  url: string;
}

function isWildcard(host: string): boolean {
  return host === '' || host === '0.0.0.0' || host === '::';
}

/** True when `host` is a loopback address (this host only). */
export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function hostOrigin(host: string, port: number): string {
  const family = host.includes(':') ? 'IPv6' : 'IPv4';
  return `http://${formatHostForUrl(host, family)}:${port}`;
}

/**
 * Compute the API URL lines for a bind host/port.
 *
 * - wildcard (`0.0.0.0` / `::` / empty): a `Local:` line (localhost) plus one
 *   `Network:` line per non-loopback interface.
 * - loopback: a single `Local:` line.
 * - specific host: a single `URL:` line.
 */
export function accessUrlLines(
  host: string,
  port: number,
  networkAddresses?: NetworkAddress[],
): AccessUrlLine[] {
  if (isWildcard(host)) {
    const lines: AccessUrlLine[] = [
      { label: 'Local:    ', url: buildApiUrl(`http://localhost:${port}`) },
    ];
    const addrs = networkAddresses ?? listNetworkAddresses();
    for (const addr of addrs) {
      lines.push({
        label: 'Network:  ',
        url: buildApiUrl(`http://${formatHostForUrl(addr.address, addr.family)}:${port}`),
      });
    }
    return lines;
  }
  if (isLoopbackHost(host)) {
    return [{ label: 'Local:    ', url: buildApiUrl(hostOrigin(host, port)) }];
  }
  return [{ label: 'URL:      ', url: buildApiUrl(hostOrigin(host, port)) }];
}
