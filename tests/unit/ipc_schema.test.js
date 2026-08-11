import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { validateWorkerMessage } from '../../modules/ipc_schema.js';

describe('IPC Schema Validation & Worker Switch Handlers', () => {
  test('validates start message payload', () => {
    const validMsg = { type: 'start', args: ['--interactive'] };
    expect(validateWorkerMessage(validMsg).success).toBe(true);

    const invalidMsg = { type: 'start', args: 'invalid_type' };
    expect(validateWorkerMessage(invalidMsg).success).toBe(false);
  });

  test('validates stdin message payload', () => {
    expect(validateWorkerMessage({ type: 'stdin', stdin: 'hello\n' }).success).toBe(true);
    expect(validateWorkerMessage({ type: 'stdin', stdin: 123 }).success).toBe(false);
  });

  test('validates debug_enable message payload', () => {
    expect(validateWorkerMessage({ type: 'debug_enable', enabled: true }).success).toBe(true);
    expect(validateWorkerMessage({ type: 'debug_enable', enabled: 'true' }).success).toBe(false);
  });

  test('validates sync message payload', () => {
    expect(validateWorkerMessage({ type: 'sync', buffer: { 0x100: 42 } }).success).toBe(true);
    expect(validateWorkerMessage({ type: 'sync' }).success).toBe(false);
  });

  test('rejects messages without type or invalid format', () => {
    expect(validateWorkerMessage(null).success).toBe(false);
    expect(validateWorkerMessage({}).success).toBe(false);
    expect(validateWorkerMessage({ type: 'unknown_type' }).success).toBe(false);
  });

  test('ensures all main-to-worker message types are handled in worker dispatcher switch', () => {
    const workerPath = path.resolve(__dirname, '../../modules/simulator_worker.js');
    const workerContent = fs.readFileSync(workerPath, 'utf-8');

    const knownTypes = [
      'init_modules',
      'code_load',
      'start',
      'stdin',
      'interrupt',
      'sync',
      'debug_enable',
      'debug_step',
    ];

    for (const type of knownTypes) {
      expect(workerContent).toContain(`case "${type}":`);
    }
  });
});
