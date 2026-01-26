export type MutateCallback = () => void;

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

  function createProxy<U extends object>(obj: U): U {
    if (proxyCache.has(obj)) {
      return proxyCache.get(obj) as U;
    }

    const handler: ProxyHandler<U> = {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        // Recursively proxy nested objects
        if (typeof value === "object" && value !== null) {
          // Check if it's already a regular object or array that we can proxy
          // We don't want to proxy Date, RegExp, Map, Set etc unless we implement handlers for them.
          // For simple game state (JSON serializable), it's usually just Object and Array.
          // Let's rely on standard typeof check for now.
          return createProxy(value);
        }

        return value;
      },
      set(target, prop, value, receiver) {
        const oldValue = Reflect.get(target, prop, receiver);
        const result = Reflect.set(target, prop, value, receiver);

        // Only notify if value actually changed
        if (oldValue !== value) {
          onMutate();
        }
        return result;
      },
      deleteProperty(target, prop) {
        const result = Reflect.deleteProperty(target, prop);
        if (result) {
          onMutate();
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
