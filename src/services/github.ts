import 'dotenv/config'

type GitHubFileResponse = {
  content?: {
    sha?: string
  }
}

const githubToken = process.env.GITHUB_TOKEN
const githubOwner = process.env.GITHUB_OWNER
const githubRepo = process.env.GITHUB_REPO
const githubBranch = process.env.GITHUB_BRANCH || 'main'

if (!githubToken || !githubOwner || !githubRepo) {
  throw new Error(
    'Missing GitHub environment variables. Check GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO.'
  )
}

function githubApiUrl(path: string): string {
  return `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${path}`
}

async function getFileSha(path: string): Promise<string | null> {
  const response = await fetch(`${githubApiUrl(path)}?ref=${githubBranch}`, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json'
    }
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Could not check GitHub file: ${path}`)
  }

  const data = (await response.json()) as GitHubFileResponse

  return data.content?.sha || null
}

export async function upsertGitHubFile(params: {
  path: string
  content: string
  message: string
}): Promise<void> {
  const sha = await getFileSha(params.path)

  const body: {
    message: string
    content: string
    branch: string
    sha?: string
  } = {
    message: params.message,
    content: Buffer.from(params.content, 'utf8').toString('base64'),
    branch: githubBranch
  }

  if (sha) {
    body.sha = sha
  }

  const response = await fetch(githubApiUrl(params.path), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GitHub publish failed: ${errorText}`)
  }
}

export async function getGitHubTextFile(path: string): Promise<string | null> {
  const response = await fetch(
    `https://raw.githubusercontent.com/${githubOwner}/${githubRepo}/${githubBranch}/${path}`
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Could not read GitHub file: ${path}`)
  }

  return response.text()
}