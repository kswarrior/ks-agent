import * as vscode from 'vscode'

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('ksAgent')
  const rawDebounce = Number(cfg.get<number>('debounceMs') ?? 350)
  const debounceMs = Math.max(80, Math.min(2000, Number.isFinite(rawDebounce) ? rawDebounce : 350))
  return {
    baseUrl: (cfg.get<string>('baseUrl') || 'http://localhost:8787').replace(/\/+$/, ''),
    modelId: (cfg.get<string>('modelId') || '').trim(),
    enableCompletion: cfg.get<boolean>('enableInlineCompletion') !== false,
    debounceMs
  }
}

async function callIdeComplete(baseUrl: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${baseUrl}/api/ide/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(t.slice(0, 400) || `HTTP ${res.status}`)
  }
  const data: any = await res.json().catch(() => ({}))
  return typeof data.completion === 'string' ? data.completion : ''
}

async function callIdeChat(baseUrl: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${baseUrl}/api/ide/inline-chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(t.slice(0, 600) || `HTTP ${res.status}`)
  }
  const data: any = await res.json().catch(() => ({}))
  if (typeof data.result === 'string' && data.result) return data.result
  if (data.error) throw new Error(data.error)
  throw new Error('Empty result')
}

class KsInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private lastRequestId = 0

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null | undefined> {
    const { baseUrl, modelId, enableCompletion, debounceMs } = getConfig()
    if (!enableCompletion) return null
    if (token.isCancellationRequested) return null

    // quick local guard: don't trigger on empty line start with < 2 chars prefix
    const line = document.lineAt(position.line).text.slice(0, position.character)
    if (line.trim().length < 2) return null

    // debounce gate: wait debounceMs (clamped 80–2000, default 350) then fetch
    const requestId = ++this.lastRequestId
    await new Promise<void>((resolve) => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(resolve, debounceMs)
    })
    if (token.isCancellationRequested || requestId !== this.lastRequestId) return null

    const offset = document.offsetAt(position)
    const text = document.getText()
    const prefix = text.slice(Math.max(0, offset - 4000), offset)
    const suffix = text.slice(offset, offset + 2000)
    const language = document.languageId
    const filePath = vscode.workspace.asRelativePath(document.uri, false)

    try {
      const completion = await callIdeComplete(baseUrl, {
        prefix,
        suffix,
        language,
        filePath,
        modelId: modelId || undefined
      })
      if (token.isCancellationRequested || requestId !== this.lastRequestId) return null
      // Multi-line ghost: allow up to ~500 chars, preserve indentation, show 3–5 lines
      // VS Code handles Tab to accept natively; Shift+Tab/Esc dismisses (inlineSuggest hide)
      let clean = completion.replace(/\r\n/g, '\n').trimEnd()
      if (!clean) return null
      // Truncate to 500 chars rather than discard; keep multi-line up to 5 lines
      if (clean.length > 500) clean = clean.slice(0, 500).trimEnd()
      if (!clean) return null
      // avoid echoing what is already typed
      if (prefix.endsWith(clean)) return null
      const lines = clean.split('\n')
      if (lines.length > 5) {
        clean = lines.slice(0, 5).join('\n').trimEnd()
        if (!clean) return null
      }
      // Return as InlineCompletionItem at cursor; VS Code renders ghost with preserved indentation
      return [new vscode.InlineCompletionItem(clean, new vscode.Range(position, position))]
    } catch {
      return null
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new KsInlineCompletionProvider()
  const selector: vscode.DocumentSelector = { pattern: '**/*' }
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(selector, provider)
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('ks-agent.inlineChat', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) { vscode.window.showErrorMessage('No active editor'); return }
      const { baseUrl, modelId } = getConfig()
      const sel = editor.selection
      const selection = editor.document.getText(sel.isEmpty ? new vscode.Range(sel.start.line, 0, sel.start.line, editor.document.lineAt(sel.start.line).text.length) : sel)
      if (!selection.trim()) { vscode.window.showErrorMessage('Select code first, or place cursor on a line'); return }
      const instruction = await vscode.window.showInputBox({
        prompt: 'Instruction for KS Agent (e.g. “fix types”, “add error handling”, “explain”)',
        placeHolder: 'fix / explain / refactor / add tests ...',
        value: ''
      })
      if (!instruction) return
      const filePath = vscode.workspace.asRelativePath(editor.document.uri, false)
      const surrounding = editor.document.getText(
        new vscode.Range(
          new vscode.Position(Math.max(0, sel.start.line - 6), 0),
          new vscode.Position(Math.min(editor.document.lineCount - 1, sel.end.line + 6), 0)
        )
      ).slice(0, 6000)

      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'KS Agent inline chat…', cancellable: false }, async () => {
        try {
          const result = await callIdeChat(baseUrl, { selection, instruction, filePath, surroundingContext: surrounding, modelId: modelId || undefined })
          // inline chat apply with proper edit + undo stop. Ensure cursor not broken after accept.
          const isEmptySel = sel.isEmpty
          const range = isEmptySel
            ? new vscode.Range(sel.start.line, 0, sel.start.line, editor.document.lineAt(sel.start.line).text.length)
            : sel
          const startPos = range.start
          const startOffset = editor.document.offsetAt(startPos)
          const success = await editor.edit((eb) => {
            eb.replace(range, result)
          }, { undoStopBefore: true, undoStopAfter: true })
          if (!success) throw new Error('Edit failed')
          // cursor not broken: place cursor after inserted text, collapse selection, reveal
          try {
            const doc = editor.document
            const newOffset = startOffset + result.length
            // clamp to doc length (in case result truncated or doc changed)
            const clampedOffset = Math.max(0, Math.min(newOffset, doc.getText().length))
            const newPos = doc.positionAt(clampedOffset)
            editor.selection = new vscode.Selection(newPos, newPos)
            editor.revealRange(new vscode.Range(newPos, newPos))
          } catch {}
          vscode.window.showInformationMessage('KS Agent inline chat applied')
        } catch (e: any) {
          vscode.window.showErrorMessage(`Inline chat failed: ${String(e.message || e).slice(0, 300)}`)
        }
      })
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('ks-agent.connect', async () => {
      const cur = getConfig().baseUrl
      const v = await vscode.window.showInputBox({ prompt: 'KS Agent server base URL', value: cur, placeHolder: 'http://localhost:8787' })
      if (!v) return
      await vscode.workspace.getConfiguration('ksAgent').update('baseUrl', v.replace(/\/+$/, ''), vscode.ConfigurationTarget.Global)
      vscode.window.showInformationMessage(`KS Agent base URL set to ${v}`)
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('ks-agent.showStatus', async () => {
      const { baseUrl } = getConfig()
      try {
        const res = await fetch(`${baseUrl}/api/ide/status`)
        const data: any = await res.json().catch(() => ({}))
        const ready = data.ready ? 'ready ✓' : 'not ready — add provider/model in KS Agent Settings'
        vscode.window.showInformationMessage(`KS Agent IDE status: ${ready} (${baseUrl})`)
      } catch (e: any) {
        vscode.window.showErrorMessage(`KS Agent unreachable at ${baseUrl}: ${String(e.message || e).slice(0, 200)}`)
      }
    })
  )

  vscode.window.showInformationMessage('KS Agent inline autocomplete & chat active (Tab to accept ghost, Shift+Tab/Esc to dismiss, ⌘K/ Ctrl+K for chat)')
}

export function deactivate() {}
