import { ReactNode, useCallback, useEffect, useState } from 'react';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { ClientConfig } from '../hooks/useClientConfig';
import { trimTrailingSlash } from '../utils/common';

export class DeploymentMismatchError extends Error {}

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const assertDeploymentHostname = (config: ClientConfig): void => {
  const expectedHostname = config.expectedHostname?.trim().toLowerCase();
  const actualHostname = window.location.hostname.toLowerCase();
  if (
    expectedHostname &&
    actualHostname !== expectedHostname &&
    !isLoopbackHostname(actualHostname)
  ) {
    throw new DeploymentMismatchError(
      `Falscher KIconnect-Build: Profil ${
        config.deployment ?? 'unbekannt'
      } ist für ${expectedHostname} bestimmt, wird aber auf ${actualHostname} ausgeliefert.`
    );
  }
};

const getClientConfig = async (): Promise<ClientConfig> => {
  const url = `${trimTrailingSlash(import.meta.env.BASE_URL)}/config.json`;
  const config = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!config.ok)
    throw new Error(`Konfiguration konnte nicht geladen werden (HTTP ${config.status}).`);
  const clientConfig = (await config.json()) as ClientConfig;
  assertDeploymentHostname(clientConfig);
  return clientConfig;
};

type ClientConfigLoaderProps = {
  fallback?: () => ReactNode;
  error?: (err: unknown, retry: () => void, ignore?: () => void) => ReactNode;
  children: (config: ClientConfig) => ReactNode;
};
export function ClientConfigLoader({ fallback, error, children }: ClientConfigLoaderProps) {
  const [state, load] = useAsyncCallback(getClientConfig);
  const [ignoreError, setIgnoreError] = useState(false);

  const ignoreCallback = useCallback(() => setIgnoreError(true), []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === AsyncStatus.Idle || state.status === AsyncStatus.Loading) {
    return fallback?.();
  }

  if (!ignoreError && state.status === AsyncStatus.Error) {
    const ignore = state.error instanceof DeploymentMismatchError ? undefined : ignoreCallback;
    return error?.(state.error, load, ignore);
  }

  const config: ClientConfig = state.status === AsyncStatus.Success ? state.data : {};

  return children(config);
}
