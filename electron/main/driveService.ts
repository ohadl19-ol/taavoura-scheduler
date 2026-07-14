import { createServer } from 'http'
import { createHash, randomBytes } from 'crypto'
import { shell, app } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

export interface DriveConfig {
  clientId: string
  clientSecret: string
}

interface Tokens {
  access_token: string
  refresh_token: string
  expiry_date: number
}

export class DriveService {
  private tokens: Tokens | null = null
  private fileId: string | null = null
  private readonly tokensPath: string
  private readonly fileIdPath: string

  constructor() {
    this.tokensPath = join(app.getPath('userData'), 'drive-tokens.json')
    this.fileIdPath = join(app.getPath('userData'), 'drive-file-id.json')
    this.load()
  }

  private load() {
    if (existsSync(this.tokensPath)) {
      try { this.tokens = JSON.parse(readFileSync(this.tokensPath, 'utf-8')) }
      catch { this.tokens = null }
    }
    if (existsSync(this.fileIdPath)) {
      try { this.fileId = JSON.parse(readFileSync(this.fileIdPath, 'utf-8')).fileId ?? null }
      catch { this.fileId = null }
    }
  }

  private saveTokens() {
    if (this.tokens) writeFileSync(this.tokensPath, JSON.stringify(this.tokens), 'utf-8')
  }

  private saveFileId() {
    writeFileSync(this.fileIdPath, JSON.stringify({ fileId: this.fileId }), 'utf-8')
  }

  isAuthenticated(): boolean {
    return !!this.tokens?.refresh_token
  }

  logout() {
    this.tokens = null
    this.fileId = null
    if (existsSync(this.tokensPath)) unlinkSync(this.tokensPath)
    if (existsSync(this.fileIdPath)) unlinkSync(this.fileIdPath)
  }

  async authorize(cfg: DriveConfig): Promise<void> {
    const verifier   = randomBytes(32).toString('base64url')
    const challenge  = createHash('sha256').update(verifier).digest('base64url')
    let   redirectUri = ''

    const code = await new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => {
        try {
          const url  = new URL(req.url ?? '/', 'http://localhost')
          const code = url.searchParams.get('code')
          const err  = url.searchParams.get('error')
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          if (code) {
            res.end(
              '<html><body dir="rtl" style="font-family:Arial;text-align:center;padding:60px;background:#f0f9ff">'
              + '<h2 style="color:#059669">✓ ההרשאה הושלמה!</h2>'
              + '<p style="color:#374151">ניתן לסגור את החלון ולחזור לאפליקציה.</p>'
              + '</body></html>'
            )
            server.close()
            resolve(code)
          } else {
            res.end('<html><body dir="rtl" style="font-family:Arial;text-align:center;padding:60px"><h2>שגיאה בהרשאה</h2></body></html>')
            server.close()
            reject(new Error(err ?? 'No code received'))
          }
        } catch (e) {
          reject(e)
        }
      })

      server.listen(0, '127.0.0.1', () => {
        const port  = (server.address() as { port: number }).port
        redirectUri = `http://127.0.0.1:${port}`

        const params = new URLSearchParams({
          client_id:             cfg.clientId,
          redirect_uri:          redirectUri,
          response_type:         'code',
          scope:                 'https://www.googleapis.com/auth/drive.file',
          code_challenge:        challenge,
          code_challenge_method: 'S256',
          access_type:           'offline',
          prompt:                'consent',
        })

        shell.openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
      })

      setTimeout(() => { server.close(); reject(new Error('timeout')) }, 5 * 60 * 1000)
    })

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        code_verifier: verifier,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }).toString(),
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Token exchange failed: ${text}`)
    }

    const data = await resp.json() as { access_token: string; refresh_token?: string; expires_in: number }
    if (!data.refresh_token) throw new Error('No refresh token received — please revoke access and try again')

    this.tokens = {
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expiry_date:   Date.now() + data.expires_in * 1000,
    }
    this.saveTokens()
  }

  private async getAccessToken(cfg: DriveConfig): Promise<string> {
    if (!this.tokens?.refresh_token) throw new Error('Not authenticated')

    // Still valid (with 60-second buffer)
    if (this.tokens.access_token && this.tokens.expiry_date > Date.now() + 60_000) {
      return this.tokens.access_token
    }

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: this.tokens.refresh_token,
        grant_type:    'refresh_token',
      }).toString(),
    })

    if (!resp.ok) throw new Error('Token refresh failed')

    const data = await resp.json() as { access_token: string; expires_in: number }
    this.tokens.access_token = data.access_token
    this.tokens.expiry_date  = Date.now() + data.expires_in * 1000
    this.saveTokens()
    return this.tokens.access_token
  }

  async upload(cfg: DriveConfig, filename: string, html: string): Promise<string> {
    const token    = await this.getAccessToken(cfg)
    const boundary = `----DriveUpload${randomBytes(8).toString('hex')}`
    const meta     = JSON.stringify({ name: filename, mimeType: 'text/html' })
    const body     = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      meta,
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      html,
      `--${boundary}--`,
    ].join('\r\n')

    let fileId = this.fileId

    if (fileId) {
      // Update existing file content (keeps the same link)
      const updateResp = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
        {
          method:  'PATCH',
          headers: {
            Authorization:  `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary="${boundary}"`,
          },
          body,
        }
      )
      if (!updateResp.ok) {
        // File may have been deleted from Drive — fall through to create new
        fileId = null
      }
    }

    if (!fileId) {
      // Create new file
      const createResp = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method:  'POST',
          headers: {
            Authorization:  `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary="${boundary}"`,
          },
          body,
        }
      )
      if (!createResp.ok) {
        throw new Error(`Drive upload failed: ${await createResp.text()}`)
      }
      const file = await createResp.json() as { id: string }
      fileId = file.id
      this.fileId = fileId
      this.saveFileId()

      // Set public sharing only once on creation
      const permResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
        {
          method:  'POST',
          headers: {
            Authorization:  `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        }
      )
      if (!permResp.ok) {
        throw new Error(`Failed to set permissions: ${await permResp.text()}`)
      }
    }

    return `https://drive.google.com/file/d/${fileId}/view`
  }
}

export const driveService = new DriveService()
