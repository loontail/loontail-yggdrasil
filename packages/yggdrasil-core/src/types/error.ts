export type YggdrasilErrorBody = {
  readonly error: string;
  readonly errorMessage: string;
  readonly cause?: string;
};

export const YggdrasilErrorKinds = {
  Forbidden: 'ForbiddenOperationException',
  IllegalArgument: 'IllegalArgumentException',
  Resource: 'ResourceException',
} as const;
export type YggdrasilErrorKind = (typeof YggdrasilErrorKinds)[keyof typeof YggdrasilErrorKinds];
