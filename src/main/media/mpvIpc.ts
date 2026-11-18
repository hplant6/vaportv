import { connect, type Socket } from 'node:net'

// mpv's JSON IPC (--input-ipc-server): one JSON object a line each way. Commands carry a
// request_id and get a reply with the same one; events (property changes, client messages
// from input.conf's `script-message`) come unasked.

export interface MpvEvent {
  event: string
  name?: string
  data?: unknown
  args?: string[]
  id?: number
  reason?: string
}

export class MpvIpc {
  private socket: Socket | null = null
  private buffer = ''
  private nextId = 1
  private waiting = new Map<number, { resolve: (data: unknown) => void; reject: (err: Error) => void }>()
  private closed = false

  constructor(
    private readonly onEvent: (event: MpvEvent) => void,
    private readonly onClose: () => void
  ) {}

  /** Connects, trying again while mpv is still starting (the socket isn't there yet), for up to `timeoutMs`. */
  async connect(path: string, timeoutMs: number, stillRunning: () => boolean): Promise<void> {
    const until = Date.now() + timeoutMs
    for (;;) {
      try {
        this.socket = await new Promise<Socket>((resolve, reject) => {
          const socket = connect(path)
          socket.once('connect', () => resolve(socket))
          socket.once('error', reject)
        })
        break
      } catch (err) {
        if (Date.now() > until || !stillRunning()) throw err
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
    this.socket.setEncoding('utf8')
    this.socket.on('data', (chunk: string) => this.receive(chunk))
    this.socket.on('error', () => undefined)
    this.socket.on('close', () => {
      this.closed = true
      for (const { reject } of this.waiting.values()) reject(new Error('mpv closed'))
      this.waiting.clear()
      this.onClose()
    })
  }

  private receive(chunk: string): void {
    this.buffer += chunk
    let newline: number
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      if (!line.trim()) continue
      let message: Record<string, unknown>
      try {
        message = JSON.parse(line)
      } catch {
        continue
      }
      const id = message.request_id
      if (typeof id === 'number' && id > 0 && this.waiting.has(id)) {
        const { resolve, reject } = this.waiting.get(id)!
        this.waiting.delete(id)
        if (message.error === 'success') resolve(message.data)
        else reject(new Error(String(message.error)))
      } else if (typeof message.event === 'string') this.onEvent(message as unknown as MpvEvent)
    }
  }

  /** Runs a command; resolves with its data, rejects with mpv's error. */
  command(...args: unknown[]): Promise<unknown> {
    if (!this.socket || this.closed) return Promise.reject(new Error('mpv is not running'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject })
      this.socket!.write(`${JSON.stringify({ command: args, request_id: id })}\n`)
    })
  }

  /** A command whose failure doesn't matter (mpv quitting under it, say). */
  send(...args: unknown[]): void {
    this.command(...args).catch(() => undefined)
  }

  observe(id: number, property: string): void {
    this.send('observe_property', id, property)
  }

  close(): void {
    this.socket?.destroy()
  }
}
