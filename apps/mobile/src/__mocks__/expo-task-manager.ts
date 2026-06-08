const _tasks: Map<string, (...args: unknown[]) => unknown> = new Map();

export const defineTask = jest.fn((name: string, fn: (...args: unknown[]) => unknown) => {
  _tasks.set(name, fn);
});

export const isTaskRegisteredAsync = jest.fn().mockResolvedValue(false);
export const unregisterTaskAsync = jest.fn().mockResolvedValue(undefined);

export const _runTask = async (name: string, ...args: unknown[]) => {
  const fn = _tasks.get(name);
  if (!fn) throw new Error(`Task not registered: ${name}`);
  return fn(...args);
};

export const _clearTasks = () => _tasks.clear();
