import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  YggdrasilClientError,
  YggdrasilClientErrorCodes,
} from './errors/yggdrasil-client-error.js';

export const AUTHLIB_INJECTOR_VERSION = '1.2.5';
export const AUTHLIB_INJECTOR_VENDOR_DIR_ENV = 'LOONTAIL_AUTHLIB_INJECTOR_VENDOR_DIR';

const JAR_FILENAME = `authlib-injector-${AUTHLIB_INJECTOR_VERSION}.jar`;

export const resolveAuthlibInjectorJarPath = (): string => {
  const envOverride = process.env[AUTHLIB_INJECTOR_VENDOR_DIR_ENV];
  if (envOverride) {
    const candidate = path.join(envOverride, JAR_FILENAME);
    if (existsSync(candidate)) return candidate;
  }
  const vendorDir = path.resolve(packageRoot(), 'vendor');
  const candidate = path.join(vendorDir, JAR_FILENAME);
  if (existsSync(candidate)) return candidate;
  throw new YggdrasilClientError(
    YggdrasilClientErrorCodes.AUTHLIB_INJECTOR_MISSING,
    `authlib-injector jar not found. Looked for ${JAR_FILENAME} in ${vendorDir}${envOverride ? ` and ${envOverride}` : ''}`,
    {
      context: {
        vendorDir,
        ...(envOverride ? { envOverride } : {}),
        files: existsSync(vendorDir) ? readdirSync(vendorDir) : [],
      },
    },
  );
};

export const buildAuthlibInjectorJvmArg = (input: {
  jarPath: string;
  apiRoot: string;
}): string => `-javaagent:${input.jarPath}=${input.apiRoot}`;

const packageRoot = (): string => {
  const here =
    typeof __dirname === 'string' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..');
};
