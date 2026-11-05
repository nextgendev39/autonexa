export type RepositoryError = {
  code: "not_implemented" | "unauthenticated" | "unknown";
  messageKey: "errors.notReady" | "errors.generic" | "auth.errors.session";
};

export type RepositoryResult<T> =
  | { data: T; error: null }
  | { data: null; error: RepositoryError };

export function notImplemented<T>(): RepositoryResult<T> {
  return {
    data: null,
    error: { code: "not_implemented", messageKey: "errors.notReady" },
  };
}
