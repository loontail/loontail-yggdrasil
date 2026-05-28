import type { StrapiInstance } from './types';

export type YggdrasilTokensConfig = {
  readonly accessTtlSeconds: number;
  readonly maxPerUser: number;
};

export type YggdrasilPluginConfig = {
  readonly publicUrl: string;
  readonly skinDomains: readonly string[];
  readonly serverName: string;
  readonly implementationName: string;
  readonly implementationVersion: string;
  readonly tokens: YggdrasilTokensConfig;
  readonly privateKeyPath: string;
  readonly joinBackend: 'memory' | 'db';
};

const FIFTEEN_DAYS_SECONDS = 60 * 60 * 24 * 15;

const defaults: YggdrasilPluginConfig = {
  publicUrl: '',
  skinDomains: [],
  serverName: 'Loontail Yggdrasil',
  implementationName: 'loontail-yggdrasil',
  implementationVersion: '0.0.1',
  tokens: {
    accessTtlSeconds: FIFTEEN_DAYS_SECONDS,
    maxPerUser: 10,
  },
  privateKeyPath: 'data/yggdrasil/keys/active.key.pem',
  joinBackend: 'memory',
};

const validator = (config: YggdrasilPluginConfig): void => {
  if (!config.publicUrl) {
    throw new Error(
      'yggdrasil plugin: `publicUrl` must be set (e.g. https://my.example.com/api/yggdrasil)',
    );
  }
  try {
    void new URL(config.publicUrl);
  } catch (err) {
    throw new Error(`yggdrasil plugin: \`publicUrl\` is not a valid URL: ${config.publicUrl}`, {
      cause: err,
    });
  }
  if (config.tokens.accessTtlSeconds <= 0) {
    throw new Error('yggdrasil plugin: `tokens.accessTtlSeconds` must be > 0');
  }
  if (config.tokens.maxPerUser <= 0) {
    throw new Error('yggdrasil plugin: `tokens.maxPerUser` must be > 0');
  }
  if (config.joinBackend !== 'memory' && config.joinBackend !== 'db') {
    throw new Error(
      `yggdrasil plugin: \`joinBackend\` must be 'memory' or 'db' (got '${config.joinBackend}')`,
    );
  }
};

export default {
  default: defaults,
  validator,
};

export const readConfig = (strapi: StrapiInstance): YggdrasilPluginConfig => {
  const raw = strapi.config.get('plugin::yggdrasil') as YggdrasilPluginConfig;
  if (!raw) {
    throw new Error(
      'yggdrasil plugin config is not loaded; check that the plugin is registered in config/plugins.js',
    );
  }
  // `URL.hostname` drops the port — Mojang's whitelist matches against `URI.getHost()` which also strips it.
  const skinDomains =
    raw.skinDomains.length > 0 ? raw.skinDomains : [new URL(raw.publicUrl).hostname];
  return { ...raw, skinDomains };
};
