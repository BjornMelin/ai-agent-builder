/**
 * Collect writes from a `WritableStream` in tests.
 *
 * @remarks
 * Keep this tiny: it exists to avoid repeating verbose `WritableStream` setup.
 *
 * @returns A tuple containing the writable stream and the collected writes.
 */
export function createWritableCollector<T>() {
  const writes: T[] = [];
  const writable = new WritableStream<T>({
    write(chunk) {
      writes.push(chunk);
    },
  });
  return { writable, writes } as const;
}
