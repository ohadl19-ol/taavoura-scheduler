const OWNER = 'ohadl19-ol'
const REPO  = 'taavoura-scheduler'
const BRANCH = 'gh-pages'
const FILE   = 'index.html'

async function ghFetch(token: string, path: string, opts: RequestInit = {}) {
  const resp = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  })
  return resp
}

async function ensureBranch(token: string): Promise<void> {
  // Check if gh-pages branch exists
  const check = await ghFetch(token, `/branches/${BRANCH}`)
  if (check.ok) return

  // Get default branch SHA to base the new branch on
  const defaultResp = await ghFetch(token, '/git/ref/heads/main')
  if (!defaultResp.ok) throw new Error('Cannot read main branch')
  const { object } = await defaultResp.json() as { object: { sha: string } }

  // Create gh-pages branch
  const createResp = await ghFetch(token, '/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: object.sha }),
  })
  if (!createResp.ok) {
    const text = await createResp.text()
    throw new Error(`Cannot create gh-pages branch: ${text}`)
  }
}

async function enablePages(token: string): Promise<void> {
  // Try to enable GitHub Pages — ignore if already enabled
  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source: { branch: BRANCH, path: '/' } }),
  })
  // Don't throw — it might already be enabled (409 is fine)
}

export async function publishToPages(token: string, html: string): Promise<string> {
  await ensureBranch(token)

  // Get current file SHA if it exists (needed for update)
  let sha: string | undefined
  const getResp = await ghFetch(token, `/contents/${FILE}?ref=${BRANCH}`)
  if (getResp.ok) {
    const data = await getResp.json() as { sha: string }
    sha = data.sha
  }

  // Create or update index.html
  const body: Record<string, string> = {
    message: 'עדכון סידור עבודה',
    content: Buffer.from(html).toString('base64'),
    branch: BRANCH,
  }
  if (sha) body.sha = sha

  const putResp = await ghFetch(token, `/contents/${FILE}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  if (!putResp.ok) {
    const text = await putResp.text()
    throw new Error(`GitHub publish failed: ${text}`)
  }

  await enablePages(token)

  return `https://${OWNER}.github.io/${REPO}/`
}
