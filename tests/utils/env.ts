export type EnvOverrides = Readonly<Record<string, string | undefined>>;

/**
 * Temporarily apply environment variable overrides for the duration of `fn`.
 *
 * @remarks
 * `undefined` deletes the variable.
 *
 * @param overrides - The environment variable overrides to apply.
 * @param fn - The function to execute with the environment variable overrides.
 * @returns The result of the function.
 */
export async function withEnv<T>(
  overrides: EnvOverrides,
  fn: () => Promise<T>,
): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}
