import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'

type SessionUser = {
  id: string
  email?: string
}

export type PromptItSession = {
  access_token: string
  refresh_token: string
  user: SessionUser
}

const promptItDir = path.join(os.homedir(), '.prompt-it')
const sessionPath = path.join(promptItDir, 'session.json')

export async function saveSession(session: PromptItSession): Promise<void> {
  await fs.ensureDir(promptItDir)
  await fs.writeJson(sessionPath, session, { spaces: 2 })
}

export async function getSession(): Promise<PromptItSession | null> {
  const exists = await fs.pathExists(sessionPath)

  if (!exists) {
    return null
  }

  return fs.readJson(sessionPath)
}

export async function clearSession(): Promise<void> {
  await fs.remove(sessionPath)
}
