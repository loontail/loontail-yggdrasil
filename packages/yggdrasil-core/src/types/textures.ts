export const TextureKinds = {
  SKIN: 'SKIN',
  CAPE: 'CAPE',
} as const;
export type TextureKind = (typeof TextureKinds)[keyof typeof TextureKinds];

export const SkinVariants = {
  CLASSIC: 'CLASSIC',
  SLIM: 'SLIM',
} as const;
export type SkinVariant = (typeof SkinVariants)[keyof typeof SkinVariants];

export type TextureSkinEntry = {
  readonly url: string;
  readonly metadata?: { readonly model: 'slim' };
};

export type TextureCapeEntry = {
  readonly url: string;
};

export type TexturesPayloadTextures = {
  readonly SKIN?: TextureSkinEntry;
  readonly CAPE?: TextureCapeEntry;
};

export type TexturesPayload = {
  readonly timestamp: number;
  readonly profileId: string;
  readonly profileName: string;
  readonly textures: TexturesPayloadTextures;
};
