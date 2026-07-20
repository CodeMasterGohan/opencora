import path from "path"
import { Effect } from "effect"
import { Global } from "@opencora/core/global"

export const DEFAULT_SERVER = "https://webui.dev.cora.sern.mil"
const SERVER_FILE = "opencode-server.json"

export function serverFilePath() {
  return path.join(Global.Path.config, SERVER_FILE)
}

function parseStored(text: string): string | undefined {
  try {
    const data: unknown = JSON.parse(text)
    if (typeof data !== "object" || data === null) return undefined
    const url = (data as Record<string, unknown>).url
    return typeof url === "string" ? url : undefined
  } catch {
    return undefined
  }
}

export function readStoredServer(): Effect.Effect<string | undefined, never, never> {
  return Effect.gen(function* () {
    const text = yield* Effect.promise(() => Bun.file(serverFilePath()).text().catch(() => undefined))
    return text === undefined ? undefined : parseStored(text)
  })
}

export function storeServer(url: string): Effect.Effect<void, never, never> {
  return Effect.gen(function* () {
    process.env.OPENWEBUI_BASE_URL = url
    yield* Effect.promise(() => Bun.file(serverFilePath()).write(JSON.stringify({ url }, null, 2)))
  })
}

export function resolveServer(metadataServer?: string): Effect.Effect<string, never, never> {
  return Effect.gen(function* () {
    const env = process.env.OPENWEBUI_BASE_URL
    if (env !== undefined && env.length > 0) return env
    if (metadataServer !== undefined && metadataServer.length > 0) return metadataServer
    const stored = yield* readStoredServer()
    if (stored !== undefined) return stored
    return DEFAULT_SERVER
  })
}
