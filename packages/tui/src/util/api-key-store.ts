import path from "path"
import { Global } from "@opencora/core/global"

const KEY_FILE = "opencora-api-key.json"

export class ApiKeyStore {
  static get filePath(): string {
    return path.join(Global.Path.config, KEY_FILE)
  }

  static async get(): Promise<string | undefined> {
    try {
      const Bun = await import("bun")
      const file = Bun.file(this.filePath)
      if (await file.exists()) {
        const data = await file.json()
        return data.key as string | undefined
      }
    } catch {
      // File doesn't exist or invalid JSON
    }
    return undefined
  }

  static async save(key: string): Promise<void> {
    const Bun = await import("bun")
    await Bun.write(
      this.filePath,
      JSON.stringify({ key, createdAt: Date.now() }, null, 2)
    )
  }

  static async clear(): Promise<void> {
    const Bun = await import("bun")
    try {
      await Bun.file(this.filePath).unlink()
    } catch {
      // File doesn't exist
    }
  }
}