import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPatch } from 'diff'

const mockSelect = vi.fn()
const mockEq = vi.fn()

const mockFrom = vi.fn().mockImplementation(() => ({
  select: mockSelect.mockReturnValue({
    eq: mockEq,
  })
}))

vi.mock('../src/services/supabase.js', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
  }
}))

import {
  resolvePromptVersion,
  getPromptContentByVersion,
  type SupabasePrompt,
  type PromptVersionRecord,
} from '../src/utils/promptResolver.js'

const basePrompt: SupabasePrompt = {
  id: 'prompt-1',
  owner_id: 'user-1',
  name: 'test-prompt',
  title: 'Test Prompt',
  description: 'A test prompt',
  username: 'testuser',
  current_content: 'Current content v2',
  current_version: '2.0.0',
  tags: ['test'],
}

// Helper to create valid diffs using the real diff library
function makeDiff(oldContent: string, newContent: string): string {
  return createPatch('prompt.md', oldContent, newContent)
}

function mockVersionsResponse(versions: PromptVersionRecord[]) {
  mockEq.mockResolvedValueOnce({ data: versions, error: null })
}

function mockVersionsError(message: string) {
  mockEq.mockResolvedValueOnce({ data: null, error: { message } })
}

beforeEach(() => {
  vi.clearAllMocks()

  mockFrom.mockImplementation(() => ({
    select: mockSelect.mockReturnValue({
      eq: mockEq,
    })
  }))
})

// ─── resolvePromptVersion ──────────────────────────────────────────────

describe('resolvePromptVersion', () => {
  it('returns current content when no version is requested', async () => {
    const result = await resolvePromptVersion(basePrompt)

    expect(result.resolved_content).toBe('Current content v2')
    expect(result.resolved_version).toBe('2.0.0')
    expect(result.is_historical_version).toBe(false)
  })

  it('returns current content when requested version matches current', async () => {
    const result = await resolvePromptVersion(basePrompt, '2.0.0')

    expect(result.resolved_content).toBe('Current content v2')
    expect(result.is_historical_version).toBe(false)
  })

  it('sets is_historical_version to false for current version', async () => {
    const result = await resolvePromptVersion(basePrompt)

    expect(result.is_historical_version).toBe(false)
  })

  it('delegates to getPromptContentByVersion for historical versions', async () => {
    const snapshotContent = 'Old content v1'
    mockVersionsResponse([
      {
        version: '1.0.0',
        base_version: null,
        change_type: 'snapshot',
        diff: null,
        snapshot_content: snapshotContent,
        created_at: '2026-01-01T00:00:00Z',
      },
    ])

    const result = await resolvePromptVersion(basePrompt, '1.0.0')

    expect(result.resolved_content).toBe(snapshotContent)
    expect(result.resolved_version).toBe('1.0.0')
  })

  it('sets is_historical_version to true for historical versions', async () => {
    mockVersionsResponse([
      {
        version: '1.0.0',
        base_version: null,
        change_type: 'snapshot',
        diff: null,
        snapshot_content: 'Old content',
        created_at: '2026-01-01T00:00:00Z',
      },
    ])

    const result = await resolvePromptVersion(basePrompt, '1.0.0')

    expect(result.is_historical_version).toBe(true)
  })
})

// ─── getPromptContentByVersion ─────────────────────────────────────────

describe('getPromptContentByVersion', () => {
  // --- Snapshot cases ---

  it('returns snapshot_content directly when version is a snapshot', async () => {
    mockVersionsResponse([
      {
        version: '1.0.0',
        base_version: null,
        change_type: 'snapshot',
        diff: null,
        snapshot_content: 'Hello World',
        created_at: '2026-01-01T00:00:00Z',
      },
    ])

    const content = await getPromptContentByVersion('prompt-1', '1.0.0')
    expect(content).toBe('Hello World')
  })

  // --- Diff reconstruction cases ---

  it('reconstructs content by applying diff on previous snapshot', async () => {
    const v1 = 'Hello World'
    const v2 = 'Hello Prompt-It World'
    const diffV1toV2 = makeDiff(v1, v2)

    mockVersionsResponse([
      {
        version: '1.0.0',
        base_version: null,
        change_type: 'snapshot',
        diff: null,
        snapshot_content: v1,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        version: '1.0.1',
        base_version: '1.0.0',
        change_type: 'diff',
        diff: diffV1toV2,
        snapshot_content: null,
        created_at: '2026-01-02T00:00:00Z',
      },
    ])

    const content = await getPromptContentByVersion('prompt-1', '1.0.1')
    expect(content).toBe(v2)
  })

  it('applies multiple sequential diffs on a snapshot', async () => {
    const v1 = 'Line one'
    const v2 = 'Line one modified'
    const v3 = 'Line one modified again'

    mockVersionsResponse([
      {
        version: '1.0.0',
        base_version: null,
        change_type: 'snapshot',
        diff: null,
        snapshot_content: v1,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        version: '1.0.1',
        base_version: '1.0.0',
        change_type: 'diff',
        diff: makeDiff(v1, v2),
        snapshot_content: null,
        created_at: '2026-01-02T00:00:00Z',
      },
      {
        version: '1.0.2',
        base_version: '1.0.1',
        change_type: 'diff',
        diff: makeDiff(v2, v3),
        snapshot_content: null,
        created_at: '2026-01-03T00:00:00Z',
      },
    ])

    const content = await getPromptContentByVersion('prompt-1', '1.0.2')
    expect(content).toBe(v3)
  })

  it('handles chain: snapshot → diff → snapshot → diff → target', async () => {
    const v1 = 'Version one'
    const v2 = 'Version two (patched)'
    const v3 = 'Version three (new snapshot)'
    const v4 = 'Version four (patched again)'

    mockVersionsResponse([
      {
        version: '1.0.0',
        base_version: null,
        change_type: 'snapshot',
        diff: null,
        snapshot_content: v1,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        version: '1.0.1',
        base_version: '1.0.0',
        change_type: 'diff',
        diff: makeDiff(v1, v2),
        snapshot_content: null,
        created_at: '2026-01-02T00:00:00Z',
      },
      {
        version: '2.0.0',
        base_version: null,
        change_type: 'snapshot',
        diff: null,
        snapshot_content: v3,
        created_at: '2026-01-03T00:00:00Z',
      },
      {
        version: '2.0.1',
        base_version: '2.0.0',
        change_type: 'diff',
        diff: makeDiff(v3, v4),
        snapshot_content: null,
        created_at: '2026-01-04T00:00:00Z',
      },
    ])

    const content = await getPromptContentByVersion('prompt-1', '2.0.1')
    expect(content).toBe(v4)
  })

  // --- Error cases ---

  it('throws when Supabase query fails', async () => {
    mockVersionsError('connection refused')

    await expect(getPromptContentByVersion('prompt-1', '1.0.0')).rejects.toThrow(
      'Could not fetch prompt versions: connection refused'
    )
  })

  it('throws when no version history exists', async () => {
    mockVersionsResponse([])

    await expect(getPromptContentByVersion('prompt-1', '1.0.0')).rejects.toThrow(
      'No version history found for this prompt.'
    )
  })

  it('throws when requested version is not found', async () => {
    mockVersionsResponse([
      {
        version: '1.0.0',
        base_version: null,
        change_type: 'snapshot',
        diff: null,
        snapshot_content: 'content',
        created_at: '2026-01-01T00:00:00Z',
      },
    ])

    await expect(getPromptContentByVersion('prompt-1', '9.9.9')).rejects.toThrow(
      'Version not found: 9.9.9'
    )
  })

  it('throws when no snapshot exists before the target diff', async () => {
    mockVersionsResponse([
      {
        version: '1.0.1',
        base_version: '1.0.0',
        change_type: 'diff',
        diff: 'some diff',
        snapshot_content: null,
        created_at: '2026-01-02T00:00:00Z',
      },
    ])

    await expect(getPromptContentByVersion('prompt-1', '1.0.1')).rejects.toThrow(
      'No snapshot found before it'
    )
  })

  it('throws when diff content is null for a diff version', async () => {
    mockVersionsResponse([
      {
        version: '1.0.0',
        base_version: null,
        change_type: 'snapshot',
        diff: null,
        snapshot_content: 'Base content',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        version: '1.0.1',
        base_version: '1.0.0',
        change_type: 'diff',
        diff: null,
        snapshot_content: null,
        created_at: '2026-01-02T00:00:00Z',
      },
    ])

    await expect(getPromptContentByVersion('prompt-1', '1.0.1')).rejects.toThrow(
      'Diff content is missing for version 1.0.1'
    )
  })

  it('throws when applyPatch returns false (corrupt diff)', async () => {
    // Create a valid unified diff that targets completely different content
    // so applyPatch will fail to match context lines and return false
    const wrongDiff = makeDiff('Completely different content', 'Something else entirely')

    mockVersionsResponse([
      {
        version: '1.0.0',
        base_version: null,
        change_type: 'snapshot',
        diff: null,
        snapshot_content: 'Base content',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        version: '1.0.1',
        base_version: '1.0.0',
        change_type: 'diff',
        diff: wrongDiff,
        snapshot_content: null,
        created_at: '2026-01-02T00:00:00Z',
      },
    ])

    await expect(getPromptContentByVersion('prompt-1', '1.0.1')).rejects.toThrow(
      'Could not apply diff for version 1.0.1'
    )
  })
})
