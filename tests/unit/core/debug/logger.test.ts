import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { logger, LogLevel } from '../../../../src/core/debug/logger';

describe('logger', () => {
  let originalLevel: LogLevel;

  beforeEach(() => {
    originalLevel = logger.level;
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logger.level = originalLevel;
    vi.restoreAllMocks();
  });

  it('should log debug when level is Debug', () => {
    logger.level = LogLevel.Debug;
    logger.debug('test debug');
    expect(console.debug).toHaveBeenCalledWith('[Pluto:DEBUG]', 'test debug');
  });

  it('should not log debug when level is Info', () => {
    logger.level = LogLevel.Info;
    logger.debug('test debug');
    expect(console.debug).not.toHaveBeenCalled();
  });

  it('should log info when level is Info', () => {
    logger.level = LogLevel.Info;
    logger.info('test info');
    expect(console.info).toHaveBeenCalledWith('[Pluto:INFO]', 'test info');
  });

  it('should not log info when level is Warn', () => {
    logger.level = LogLevel.Warn;
    logger.info('test info');
    expect(console.info).not.toHaveBeenCalled();
  });

  it('should log warn when level is Warn', () => {
    logger.level = LogLevel.Warn;
    logger.warn('test warn');
    expect(console.warn).toHaveBeenCalledWith('[Pluto:WARN]', 'test warn');
  });

  it('should not log warn when level is Error', () => {
    logger.level = LogLevel.Error;
    logger.warn('test warn');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('should log error even when level is Error', () => {
    logger.level = LogLevel.Error;
    logger.error('test error');
    expect(console.error).toHaveBeenCalledWith('[Pluto:ERROR]', 'test error');
  });

  it('should not log anything when level is None', () => {
    logger.level = LogLevel.None;
    logger.error('test error');
    expect(console.error).not.toHaveBeenCalled();
  });
});
