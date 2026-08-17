import { beforeEach, describe, it, expect, vi } from 'bun:test';
import { addFileToTask } from '@services';
import * as cacheMod from '@modules/cache';

// Sample valid config used in most tests.
const validConfig = JSON.stringify({
  metadata: '{}',
  userId: 'u123',
  selectedValues: ['taskA', 'taskB'],
  fileId: 'f456'
});

describe('addFileToTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success when all selected values exist', async () => {
    vi.spyOn(cacheMod, 'getHashAllFields')
      .mockResolvedValueOnce({ dummy: true })
      .mockRejectedValueOnce('NO_RECORD_FOUND');
    const result = await addFileToTask(validConfig);
    expect(result.res).toBe('success');
  });

  it('returns error when no tasks found', async () => {
    vi.spyOn(cacheMod, 'getHashAllFields')
      .mockRejectedValueOnce('NO_RECORD_FOUND')
      .mockRejectedValueOnce('NO_RECORD_FOUND');
    const res = await addFileToTask(validConfig);
    expect(res.res).toBe('error');
    expect(res.msg).toBe('NO_TASK_FOUND');
  });

  it('returns error when some selected items missing', async () => {
    vi.spyOn(cacheMod, 'getHashAllFields')
      .mockResolvedValueOnce({ dummy: true })
      .mockRejectedValue(new Error('NO_RECORD_FOUND'));
    const res = await addFileToTask(validConfig);
    expect(res.res).toBe('error');
    expect(res.msg?.includes('NOT_FOUND')).toBe(true);
  });

  it('throws error when config cannot be parsed', async () => {
    const badConfig = 'invalid JSON';
    await expect(addFileToTask(badConfig as any)).rejects.toThrow();
  });
});
