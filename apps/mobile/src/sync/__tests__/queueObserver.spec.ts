import { startQueueObserver } from '../queueObserver';

describe('startQueueObserver', () => {
  const makeDeps = (counts: number[]) => {
    let call = 0;
    const listeners: Array<() => void> = [];
    return {
      setPendingCount: jest.fn(),
      countPending: jest.fn(() => counts[Math.min(call++, counts.length - 1)]!),
      subscribe: jest.fn((cb: () => void) => {
        listeners.push(cb);
        return () => {
          listeners.splice(listeners.indexOf(cb), 1);
        };
      }),
      fire: () => listeners.forEach((cb) => cb()),
      listeners,
    };
  };

  it('publishes the depth immediately, before any change happens', () => {
    // A queue can already hold items from a previous session that no write will touch. Without the
    // first read the pill would keep saying "synced" until the user happened to make a change.
    const deps = makeDeps([3]);
    startQueueObserver(deps);
    expect(deps.setPendingCount).toHaveBeenCalledWith(3);
  });

  it('republishes on every queue change', () => {
    const deps = makeDeps([0, 1, 2]);
    startQueueObserver(deps);
    deps.fire();
    deps.fire();
    expect(deps.setPendingCount.mock.calls.map(([n]) => n)).toEqual([0, 1, 2]);
  });

  it('stops publishing once unsubscribed', () => {
    const deps = makeDeps([5]);
    const stop = startQueueObserver(deps);
    stop();
    deps.fire();
    expect(deps.setPendingCount).toHaveBeenCalledTimes(1);
    expect(deps.listeners).toHaveLength(0);
  });
});
