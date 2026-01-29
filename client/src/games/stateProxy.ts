export type MutateCallback = (
  path: string[],
  newValue: any,
  oldValue: any,
) => void;

/**
 * Creates a Deep Proxy that monitors changes to the object and its nested properties.
 * When a mutation occurs (set, delete), the onMutate callback is triggered.
 * Uses a WeakMap to ensure referential stability (same object returns same proxy).
 */
export function createGameProxy<T extends object>(
  target: T,
  onMutate: MutateCallback,
): T {
  const proxyCache = new WeakMap<object, object>();

  function createProxy<U extends object>(obj: U, path: string[] = []): U {
    if (proxyCache.has(obj)) {
      return proxyCache.get(obj) as U;
    }

    const handler: ProxyHandler<U> = {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "object" && value !== null) {
          return createProxy(value, [...path, String(prop)]);
        }

        return value;
      },

      set(target, prop, value, receiver) {
        const oldValue = Reflect.get(target, prop, receiver);
        const result = Reflect.set(target, prop, value, receiver);

        if (oldValue !== value) {
          onMutate([...path, String(prop)], value, oldValue);
        }

        return result;
      },

      deleteProperty(target, prop) {
        const oldValue = Reflect.get(target, prop);
        const result = Reflect.deleteProperty(target, prop);
        if (result) {
          onMutate([...path, String(prop)], undefined, oldValue);
        }
        return result;
      },
    };

    const proxy = new Proxy(obj, handler);
    proxyCache.set(obj, proxy);
    return proxy;
  }

  return createProxy(target);
}
