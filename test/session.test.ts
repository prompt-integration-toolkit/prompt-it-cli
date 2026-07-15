import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs-extra', () => ({
  default: {
    ensureDir: vi.fn(),
    writeJson: vi.fn(),
    pathExists: vi.fn(),
    readJson: vi.fn(),
    remove: vi.fn(),
  }
}))

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/fake/home'
  }
}))

import fs from 'fs-extra'
import { saveSession, getSession, clearSession, type PromptItSession } from '../src/services/session.js'

const mockSession: PromptItSession = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  user: { id: 'user-123', email: 'test@example.com' }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('saveSession', () => {
  it('creates .prompt-it directory if it does not exist', async () => {
    await saveSession(mockSession)

    expect(fs.ensureDir).toHaveBeenCalledWith('/fake/home/.prompt-it')
  })

  it('writes session object as JSON with formatting', async () => {
    await saveSession(mockSession)

    expect(fs.writeJson).toHaveBeenCalledWith(
      '/fake/home/.prompt-it/session.json',
      mockSession,
      { spaces: 2 }
    )
  })
})

describe('getSession', () => {
  it('returns session object when file exists', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never)
    vi.mocked(fs.readJson).mockResolvedValue(mockSession as never)

    const session = await getSession()

    expect(fs.pathExists).toHaveBeenCalledWith('/fake/home/.prompt-it/session.json')
    expect(session).toEqual(mockSession)
  })

  it('returns null when session file does not exist', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(false as never)

    const session = await getSession()

    expect(session).toBeNull()
    expect(fs.readJson).not.toHaveBeenCalled()
  })
})

describe('clearSession', () => {
  it('removes the session file', async () => {
    await clearSession()

    expect(fs.remove).toHaveBeenCalledWith('/fake/home/.prompt-it/session.json')
  })
})
