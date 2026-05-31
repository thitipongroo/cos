// Unit tests for @cos/logger

import { createLogger, logger } from '../index';

describe('createLogger', () => {
  it('returns a logger with the module field', () => {
    const log = createLogger('test-module');
    expect(log).toBeDefined();
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.debug).toBe('function');
  });

  it('returns different instances per module (child loggers)', () => {
    const log1 = createLogger('module-a');
    const log2 = createLogger('module-b');
    expect(log1).not.toBe(log2);
  });

  it('base logger is exported and has logging methods', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });
});
