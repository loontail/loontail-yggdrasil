export type YggdrasilMetaFeatures = {
  readonly non_email_login?: boolean;
  readonly username_check?: boolean;
  readonly legacy_skin_api?: boolean;
  readonly no_mojang_namespace?: boolean;
  readonly enable_mojang_anti_features?: boolean;
  readonly enable_profile_key?: boolean;
};

export type YggdrasilMetaInfo = {
  readonly serverName: string;
  readonly implementationName: string;
  readonly implementationVersion: string;
  readonly links?: {
    readonly homepage?: string;
    readonly register?: string;
  };
  readonly feature?: YggdrasilMetaFeatures;
};

export type YggdrasilMeta = {
  readonly meta: YggdrasilMetaInfo;
  readonly skinDomains: readonly string[];
  readonly signaturePublickey: string;
  readonly signaturePublickeys?: readonly string[];
};
