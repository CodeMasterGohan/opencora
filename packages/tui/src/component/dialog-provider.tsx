import { createMemo, createSignal, onMount, Show } from "solid-js"
import { useSync } from "../context/sync"
import { map, pipe, sortBy } from "remeda"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { DialogPrompt } from "../ui/dialog-prompt"
import { Link } from "../ui/link"
import { useTheme } from "../context/theme"
import { TextAttributes } from "@opentui/core"
import type { ProviderAuthAuthorization, ProviderAuthMethod } from "@opencora/sdk/v2"
import { DialogModel } from "./dialog-model"
import { useToast } from "../ui/toast"
import { isConsoleManagedProvider } from "../util/provider-origin"
import { useConnected } from "./use-connected"
import { useBindings } from "../keymap"
import { useClipboard } from "../context/clipboard"
import { DEFAULT_SERVER, serverFilePath } from "@opencora/core/plugin/provider/opencode-server"

const PROVIDER_PRIORITY: Record<string, number> = {
  openai: 0,
  openrouter: 1,
  "openai-compatible": 2,
}

type ProviderOptionBase = {
  title: string
  value: string
  description?: string
  category: string
}

type ProviderOption = ProviderOptionBase & {
  type: "provider"
  providerID: string
}

export function providerOptions(
  list: { id: string; name: string; api?: { type?: string; package?: string; npm?: string } }[],
): ProviderOption[] {
  return pipe(
    list.filter((provider) => provider.id === "openai" || provider.id === "openrouter" || provider.id === "openai-compatible"),
    sortBy(
      (x) => PROVIDER_PRIORITY[x.id] ?? 99,
      (x) => x.name.toLowerCase(),
      (x) => x.id,
    ),
    map((provider) => ({
      type: "provider" as const,
      title: provider.name,
      value: provider.id,
      providerID: provider.id,
      description: {
        openai: "(Default OpenWebUI provider)",
        openrouter: "(API key)",
        "openai-compatible": "(Custom OpenAI-compatible endpoint)",
      }[provider.id],
      category: "Popular",
    })),
  )
}

export function createDialogProviderOptions() {
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const { theme } = useTheme()
  const onboarded = useConnected()

  async function promptServerUrl() {
    let current: string | undefined
    try {
      const text = await Bun.file(serverFilePath()).text()
      current = (JSON.parse(text) as { url?: unknown }).url as string | undefined
    } catch {
      current = undefined
    }
    const value = await DialogPrompt.show(dialog, "OpenWebUI server URL", {
      value: current ?? DEFAULT_SERVER,
      placeholder: DEFAULT_SERVER,
      description: () => (
        <text fg={theme.textMuted}>Base URL for the OpenWebUI / OpenCora console, used when connecting to OpenCora.</text>
      ),
    })
    if (value === null) return
    const trimmed = value.trim()
    if (!trimmed) return
    try {
      new URL(trimmed)
    } catch {
      toast.show({ variant: "error", message: "Enter a valid absolute URL, e.g. https://webui.dev.cora.sern.mil" })
      return
    }
    process.env.OPENWEBUI_BASE_URL = trimmed
    await Bun.file(serverFilePath()).write(JSON.stringify({ url: trimmed }, null, 2))
    toast.show({ variant: "info", message: `OpenWebUI server set to ${trimmed}` })
    dialog.clear()
  }

  const options = createMemo(() => {
    return pipe(
      providerOptions(sync.data.provider_next.all),
      map((provider) => {
        const providerID = provider.providerID
        const consoleManaged = isConsoleManagedProvider(sync.data.console_state.consoleManagedProviders, providerID)
        const connected = sync.data.provider_next.connected.includes(providerID)

        return {
          title: provider.title,
          value: provider.value,
          description: provider.description,
          footer: consoleManaged ? sync.data.console_state.activeOrgName : undefined,
          category: provider.category,
          gutter: connected && onboarded() ? () => <text fg={theme.success}>✓</text> : undefined,
          async onSelect() {
            if (consoleManaged) return
            return dialog.replace(() => <ApiMethod providerID={providerID} title="API key" />)
          },
        }
      }),
    ).concat({
      title: "OpenWebUI server URL",
      value: "__opencode_server__",
      description: "Set the console base URL",
      category: "Settings",
      footer: undefined,
      gutter: undefined,
      async onSelect() {
        await promptServerUrl()
      },
    })
  })
  return options
}

export function DialogProvider() {
  const options = createDialogProviderOptions()
  return <DialogSelect title="Connect a provider" options={options()} />
}

interface AutoMethodProps {
  index: number
  providerID: string
  title: string
  authorization: ProviderAuthAuthorization
}
function AutoMethod(props: AutoMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const dialog = useDialog()
  const sync = useSync()
  const toast = useToast()
  const clipboard = useClipboard()

  useBindings(() => ({
    bindings: [
      {
        key: "c",
        desc: "Copy provider code",
        group: "Dialog",
        cmd: () => {
          const code =
            props.authorization.instructions.match(/[A-Z0-9]{4}-[A-Z0-9]{4,5}/)?.[0] ?? props.authorization.url
          clipboard
            .write?.(code)
            .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
            .catch(toast.error)
        },
      },
    ],
  }))

  onMount(async () => {
    const result = await sdk.client.provider.oauth.callback({
      providerID: props.providerID,
      method: props.index,
    })
    if (result.error) {
      toast.show({
        variant: "error",
        message:
          "name" in result.error && result.error.name === "ProviderAuthOauthCallbackFailed"
            ? "OAuth authorization failed. Try /connect again."
            : JSON.stringify(result.error),
      })
      dialog.clear()
      return
    }
    await sdk.client.instance.dispose()
    await sync.bootstrap()
    dialog.replace(() => <DialogModel providerID={props.providerID} />)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <box gap={1}>
        <Link href={props.authorization.url} fg={theme.primary} />
        <text fg={theme.textMuted}>{props.authorization.instructions}</text>
      </box>
      <text fg={theme.textMuted}>Waiting for authorization...</text>
      <text fg={theme.text}>
        c <span style={{ fg: theme.textMuted }}>copy</span>
      </text>
    </box>
  )
}

interface CodeMethodProps {
  index: number
  title: string
  providerID: string
  authorization: ProviderAuthAuthorization
}
function CodeMethod(props: CodeMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const [error, setError] = createSignal(false)

  return (
    <DialogPrompt
      title={props.title}
      placeholder="Authorization code"
      onConfirm={async (value) => {
        const { error } = await sdk.client.provider.oauth.callback({
          providerID: props.providerID,
          method: props.index,
          code: value,
        })
        if (!error) {
          await sdk.client.instance.dispose()
          await sync.bootstrap()
          dialog.replace(() => <DialogModel providerID={props.providerID} />)
          return
        }
        setError(true)
      }}
      description={() => (
        <box gap={1}>
          <text fg={theme.textMuted}>{props.authorization.instructions}</text>
          <Link href={props.authorization.url} fg={theme.primary} />
          <Show when={error()}>
            <text fg={theme.error}>Invalid code</text>
          </Show>
        </box>
      )}
    />
  )
}

interface ApiMethodProps {
  providerID: string
  title: string
  metadata?: Record<string, string>
}
function ApiMethod(props: ApiMethodProps) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const { theme } = useTheme()

  return (
    <DialogPrompt
      title={props.title}
      placeholder="API key"
      description={() =>
        ({
          openai: (
            <box gap={1}>
              <text fg={theme.textMuted}>
                Default OpenWebUI URL: https://webui.dev.cora.sern.mil
              </text>
            </box>
          ),
        })[props.providerID] ?? undefined
      }
      onConfirm={async (value) => {
        if (!value) return
        const metadata = {
          ...props.metadata,
        }
        await sdk.client.auth.set({
          providerID: props.providerID,
          auth: {
            type: "api",
            key: value,
            ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
          },
        })
        await sdk.client.instance.dispose()
        await sync.bootstrap()
        dialog.replace(() => <DialogModel providerID={props.providerID} />)
      }}
    />
  )
}

interface PromptsMethodProps {
  dialog: ReturnType<typeof useDialog>
  prompts: NonNullable<ProviderAuthMethod["prompts"]>[number][]
}
async function PromptsMethod(props: PromptsMethodProps) {
  const inputs: Record<string, string> = {}
  for (const prompt of props.prompts) {
    if (prompt.when) {
      const value = inputs[prompt.when.key]
      if (value === undefined) continue
      const matches = prompt.when.op === "eq" ? value === prompt.when.value : value !== prompt.when.value
      if (!matches) continue
    }

    if (prompt.type === "select") {
      const value = await new Promise<string | null>((resolve) => {
        props.dialog.replace(
          () => (
            <DialogSelect
              title={prompt.message}
              options={prompt.options.map((x) => ({
                title: x.label,
                value: x.value,
                description: x.hint,
              }))}
              onSelect={(option) => resolve(option.value)}
            />
          ),
          () => resolve(null),
        )
      })
      if (value === null) return null
      inputs[prompt.key] = value
      continue
    }

    const value = await new Promise<string | null>((resolve) => {
      props.dialog.replace(
        () => (
          <DialogPrompt title={prompt.message} placeholder={prompt.placeholder} onConfirm={(value) => resolve(value)} />
        ),
        () => resolve(null),
      )
    })
    if (value === null) return null
    inputs[prompt.key] = value
  }
  return inputs
}
