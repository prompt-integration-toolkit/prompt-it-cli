import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()

const mockFrom = vi.fn().mockImplementation(() => ({
  select: mockSelect.mockReturnValue({
    eq: mockEq,
    in: mockIn,
  })
}))

vi.mock('../src/services/supabase.js', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args)
  }
}))

import { POST_LIMIT, getUserPostCount, assertWithinPostLimit } from '../src/services/limits.js'

beforeEach(() => {
  vi.clearAllMocks()

  // Reset the chain for each test
  mockFrom.mockImplementation(() => ({
    select: mockSelect.mockReturnValue({
      eq: mockEq,
      in: mockIn,
    })
  }))
})

describe('POST_LIMIT', () => {
  it('exports value 50', () => {
    expect(POST_LIMIT).toBe(50)
  })
})

describe('getUserPostCount', () => {
  it('returns 0 when user has no prompts', async () => {
    mockEq.mockResolvedValue({ data: [], error: null })

    const count = await getUserPostCount('user-123')
    expect(count).toBe(0)
  })

  it('returns correct count when user has prompts and versions', async () => {
    // First call: get prompt ids
    mockEq.mockResolvedValueOnce({
      data: [{ id: 'p1' }, { id: 'p2' }],
      error: null,
    })

    // Second call: count versions
    mockIn.mockResolvedValueOnce({
      count: 5,
      error: null,
    })

    const count = await getUserPostCount('user-123')
    expect(count).toBe(5)
  })

  it('throws descriptive error on prompts query failure', async () => {
    mockEq.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    })

    await expect(getUserPostCount('user-123')).rejects.toThrow(
      'Could not check post limit: connection refused'
    )
  })

  it('throws descriptive error on versions query failure', async () => {
    mockEq.mockResolvedValueOnce({
      data: [{ id: 'p1' }],
      error: null,
    })

    mockIn.mockResolvedValueOnce({
      count: null,
      error: { message: 'timeout' },
    })

    await expect(getUserPostCount('user-123')).rejects.toThrow(
      'Could not check post limit: timeout'
    )
  })
})

describe('assertWithinPostLimit', () => {
  it('resolves when count is below limit', async () => {
    mockEq.mockResolvedValueOnce({
      data: [{ id: 'p1' }],
      error: null,
    })
    mockIn.mockResolvedValueOnce({ count: 10, error: null })

    await expect(assertWithinPostLimit('user-123')).resolves.not.toThrow()
  })

  it('throws when count equals POST_LIMIT', async () => {
    mockEq.mockResolvedValueOnce({
      data: [{ id: 'p1' }],
      error: null,
    })
    mockIn.mockResolvedValueOnce({ count: 50, error: null })

    await expect(assertWithinPostLimit('user-123')).rejects.toThrow('Post limit reached')
  })

  it('throws when count exceeds POST_LIMIT', async () => {
    mockEq.mockResolvedValueOnce({
      data: [{ id: 'p1' }],
      error: null,
    })
    mockIn.mockResolvedValueOnce({ count: 55, error: null })

    await expect(assertWithinPostLimit('user-123')).rejects.toThrow('Post limit reached')
  })

  it('error message includes current count and limit', async () => {
    mockEq.mockResolvedValueOnce({
      data: [{ id: 'p1' }],
      error: null,
    })
    mockIn.mockResolvedValueOnce({ count: 50, error: null })

    await expect(assertWithinPostLimit('user-123')).rejects.toThrow('50/50')
  })
})
