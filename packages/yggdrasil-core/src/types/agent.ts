/**
 * `agent` block sent by the official Minecraft launcher (and copies
 * thereof) on `/authserver/authenticate`. The protocol expects a
 * literal `{ name: 'Minecraft', version: 1 }`.
 */
export type YggdrasilAuthAgent = {
  readonly name: 'Minecraft';
  readonly version: 1;
};
