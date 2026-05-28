# Texture signing

Mojang signs the `textures` property in every `GameProfile` with their `yggdrasil_session_pubkey`.
authlib-injector lets you swap that key for your own and verifies the signature on
every property it receives. This plugin generates and uses a per-deployment RSA
key for that purpose.

## Why sign textures?

The `textures` property carries the URL pointing at the player's skin and cape.
Without a signature, anyone able to reach the server could substitute a profile
on the wire and force the joining client to load a hostile URL. The signature
binds the URL set to the specific server's private key, and authlib-injector
verifies it against the keys advertised by the metadata endpoint.

The signing scheme is **SHA1withRSA / PKCS#1 v1.5** — the same algorithm Mojang
uses, kept for protocol parity. The payload signed is the **base64-encoded**
texture JSON (i.e. exactly the bytes of the property's `value` field).

## Key generation

On bootstrap (`server/bootstrap.ts` → `crypto.init()`):

1. Read the path from `config.privateKeyPath`. Default:
   `data/yggdrasil/keys/active.key.pem` (relative to the Strapi project root).
2. If a file exists at that path, load it with `crypto.createPrivateKey`.
3. If not, generate a new RSA-4096 keypair (PKCS#8 private, SPKI public).
4. Persist the private key at the configured path.
5. Persist the public key alongside it: `data/yggdrasil/keys/active.pub.pem`.

The private key file is created with default OS permissions — set them to `0600`
out of band for production:

```bash
chmod 600 data/yggdrasil/keys/active.key.pem
```

You can also point `privateKeyPath` at a path outside the Strapi project root
(e.g. `/etc/yggdrasil/keys/active.key.pem`) and mount it read-only.

## The signing call site

Every endpoint that returns a signed profile (`hasJoined`, the `profile/:uuid`
default-signed mode, `bulkProfiles` is *unsigned* by spec) goes through
`services/textures-property.ts#build`:

```ts
const payload = buildTexturesPayload({
  profileId: user.uuid,
  profileName: user.username,
  skin: skin && { url: absoluteSkinUrl, variant: skin.variant },
  cape: cape && { url: absoluteCapeUrl },
});

const base64 = encodeTexturesPayloadBase64(payload);
const signature = crypto.signBase64(base64);

return {
  name: 'textures',
  value: base64,
  signature, // base64-encoded RSA-SHA1 signature
};
```

`buildTexturesPayload` and `encodeTexturesPayloadBase64` live in
`@loontail/yggdrasil-core`; the signing helper lives in the plugin's
`services/crypto.ts` and is the only consumer of the private key.

## Verifying on the client

Most launchers don't need to verify the signature — that's authlib-injector's job
during multiplayer join. If you want to:

```ts
import {
  decodeTexturesPayloadBase64,
} from '@loontail/yggdrasil-client';
import { createPublicKey, createVerify } from 'node:crypto';

const meta = await client.meta();
const publicKey = createPublicKey({ key: meta.signaturePublickey, format: 'pem' });

const profile = await client.profile(uuid, { signed: true });
const texturesProp = profile.properties?.find((p) => p.name === 'textures');
if (!texturesProp?.signature) throw new Error('profile not signed');

const verifier = createVerify('RSA-SHA1');
verifier.update(texturesProp.value);
const ok = verifier.verify(publicKey, texturesProp.signature, 'base64');

if (!ok) throw new Error('texture signature failed');

const payload = decodeTexturesPayloadBase64(texturesProp.value);
console.log(payload.textures.SKIN?.url);
```

## Key rotation

The plugin supports rotation by keeping old public keys around. The metadata
endpoint advertises **the active key** as `signaturePublickey` and **all known
keys (active + archived)** as `signaturePublickeys[]`. authlib-injector accepts
any of them.

To rotate:

1. Stop Strapi (or remove the plugin from `config/plugins.js` temporarily to keep
   the rest of the API serving).
2. Move the current active key out of `active.key.pem` into an archive name:

   ```bash
   mv data/yggdrasil/keys/active.key.pem    data/yggdrasil/keys/archive/2026-05-27.key.pem
   mv data/yggdrasil/keys/active.pub.pem    data/yggdrasil/keys/archive/2026-05-27.pub.pem
   ```

3. Start Strapi. The bootstrap step doesn't find `active.key.pem`, so it
   generates a fresh keypair and persists it.
4. The metadata endpoint now serves:

   ```jsonc
   {
     "signaturePublickey": "<new public key>",
     "signaturePublickeys": [
       "<new public key>",
       "<archived 2026-05-27 public key>"
     ]
   }
   ```

5. Old profiles signed with the archived key continue to verify against
   `signaturePublickeys[]`. New profiles are signed with the active key.
6. Re-sign cached profiles as they're issued (every authenticate/refresh/profile
   call issues a fresh signature, so the active key takes over naturally as
   tokens roll over).

The archive directory is `data/yggdrasil/keys/archive/`. Any file ending in
`*.pub.pem` is picked up — only the public half is needed for verification, so
private keys for retired rounds can be deleted after a transition window.

## What if I lose the private key?

You'll need to generate a new keypair (start Strapi, it generates one
automatically if `active.key.pem` is missing) and re-sign any cached profiles.
In practice the plugin always signs at request time, so the only consequence is
that authlib-injector clients refresh the metadata endpoint and start verifying
new responses against the new key.

Existing tokens (`yggdrasil_tokens` rows) are unaffected — the signing key is
not used to mint or validate tokens.
