export interface NativeModule {
  // Stateless functions (create terminal each call)
  ptyToJson(input: string, cols: number, rows: number, offset: number, limit: number): string
  ptyToText(input: string, cols: number, rows: number): string
  ptyToHtml(input: string, cols: number, rows: number): string

  // Persistent terminal management functions
  createTerminal(id: number, cols: number, rows: number): void
  destroyTerminal(id: number): void
  feedTerminal(id: number, data: string): void
  resizeTerminal(id: number, cols: number, rows: number): void
  resetTerminal(id: number): void
  getTerminalJson(id: number, offset: number, limit: number): string
  getTerminalText(id: number): string
  getTerminalCursor(id: number): string
  isTerminalReady(id: number): boolean
}

export const native: NativeModule | null
