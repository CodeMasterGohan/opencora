import { createSignal, Show, onMount, createEffect, createMemo } from "solid-js"
import { TextareaRenderable, TextAttributes } from "@opentui/core"
import { useTheme, tint } from "../context/theme"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { useBindings } from "../keymap"
import { useTuiConfig } from "../config"
import { Spinner } from "./spinner"
import { Logo } from "./logo"
import { serverFilePath } from "@opencora/core/plugin/provider/opencode-server"

type Step = "url" | "key" | "validating" | "success"

export function SetupWizard() {
  const { theme } = useTheme()
  const sdk = useSDK()
  const sync = useSync()
  const tuiConfig = useTuiConfig()

  const [step, setStep] = createSignal<Step>("url")
  const [urlValue, setUrlValue] = createSignal(process.env.OPENWEBUI_BASE_URL ?? "https://webui.dev.cora.sern.mil")
  const [keyValue, setKeyValue] = createSignal("")
  const [errorMsg, setErrorMsg] = createSignal("")
  const [userName, setUserName] = createSignal("")

  const [textareaTarget, setTextareaTarget] = createSignal<TextareaRenderable>()
  let textarea: TextareaRenderable

  onMount(() => {
    setTimeout(() => {
      if (textarea && !textarea.isDestroyed) {
        textarea.focus()
        textarea.gotoLineEnd()
      }
    }, 1)
  })

  createEffect(() => {
    const currentStep = step()
    if (currentStep !== "validating" && currentStep !== "success") {
      setTimeout(() => {
        if (textarea && !textarea.isDestroyed) {
          textarea.focus()
          textarea.gotoLineEnd()
        }
      }, 1)
    }
  })

  const stepNumber = createMemo(() => {
    const s = step()
    if (s === "url") return 1
    return 2
  })

  const progressBar = createMemo(() => {
    const total = 2
    const current = stepNumber()
    const filled = "━".repeat(current * 12)
    const empty = "─".repeat((total - current) * 12)
    return { filled, empty }
  })

  const maskedKey = createMemo(() => {
    const key = keyValue()
    if (key.length === 0) return ""
    if (key.length <= 8) return "•".repeat(key.length)
    return key.slice(0, 4) + "•".repeat(key.length - 8) + key.slice(-4)
  })

  async function handleConfirm(val: string) {
    if (step() === "url") {
      const normalized = val.trim().replace(/\/+$/, "")
      if (!normalized) {
        setErrorMsg("URL cannot be empty")
        return
      }
      try {
        new URL(normalized)
      } catch {
        setErrorMsg("Please enter a valid URL (e.g. https://webui.dev.cora.sern.mil)")
        return
      }
      setUrlValue(normalized)
      setErrorMsg("")
      setStep("key")
    } else if (step() === "key") {
      const keyNormalized = val.trim()
      if (!keyNormalized) {
        setErrorMsg("API Key cannot be empty")
        return
      }
      setKeyValue(keyNormalized)
      setErrorMsg("")
      setStep("validating")
      await validateAndSave()
    }
  }

  async function validateAndSave() {
    const targetUrl = urlValue()
    const targetKey = keyValue()

    try {
      const response = await fetch(`${targetUrl}/api/user`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${targetKey}`,
        },
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setErrorMsg("Authentication failed: Invalid or expired API Key.")
        } else {
          setErrorMsg(`Server returned status ${response.status}. Please check your configuration.`)
        }
        setStep("key")
        return
      }

      // Extract user name from response for the success greeting
      try {
        const data = await response.json() as { name?: string }
        if (data.name) setUserName(data.name)
      } catch {
        // Non-critical — proceed without name
      }

      // Persist server URL to config
      process.env.OPENWEBUI_BASE_URL = targetUrl
      await Bun.file(serverFilePath()).write(JSON.stringify({ url: targetUrl }, null, 2))

      // Persist API key via auth store
      await sdk.client.auth.set({
        providerID: "opencode",
        auth: {
          type: "api",
          key: targetKey,
          metadata: {
            server: targetUrl,
          },
        },
      })

      // Show success briefly before bootstrapping
      setStep("success")
      await new Promise((resolve) => setTimeout(resolve, 1800))

      await sdk.client.instance.dispose()
      await sync.bootstrap({ fatal: true })
    } catch (e) {
      setErrorMsg(`Could not connect to OpenWebUI at ${targetUrl}. Check your network/VPN settings.`)
      setStep("key")
    }
  }

  useBindings(() => ({
    target: textareaTarget,
    enabled: textareaTarget() !== undefined && step() !== "validating" && step() !== "success",
    priority: 1,
    bindings: [
      {
        key: "return",
        desc: "Confirm and continue",
        group: "Setup",
        cmd: () => {
          if (textarea && !textarea.isDestroyed) {
            handleConfirm(textarea.plainText)
          }
        },
      },
      {
        key: "escape",
        desc: "Go back to URL configuration",
        group: "Setup",
        cmd: () => {
          if (step() === "key") {
            setErrorMsg("")
            setStep("url")
          }
        },
      },
    ],
  }))

  return (
    <box flexGrow={1} flexDirection="column" gap={1} paddingLeft={4} paddingRight={4} paddingTop={2}>
      <box paddingBottom={1}>
        <Logo />
      </box>

      {/* Welcome message */}
      <box paddingBottom={1} gap={0}>
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Welcome to OpenCora
        </text>
        <text fg={theme.textMuted}>
          Let's get you connected. This one-time setup takes about 30 seconds.
        </text>
      </box>

      {/* Progress indicator */}
      <Show when={step() !== "success"}>
        <box flexDirection="row" gap={1} paddingBottom={1}>
          <text fg={theme.textMuted}>
            Step {stepNumber()} of 2
          </text>
          <box flexDirection="row">
            <text fg={theme.primary}>{progressBar().filled}</text>
            <text fg={tint(theme.background, theme.textMuted, 0.3)}>{progressBar().empty}</text>
          </box>
        </box>
      </Show>

      {/* Main card */}
      <box borderStyle="rounded" borderColor={step() === "success" ? theme.success : theme.primary} padding={1} gap={1} minHeight={12}>
        <Show when={step() === "url"}>
          <text attributes={TextAttributes.BOLD} fg={theme.primary}>
            OpenWebUI Base URL
          </text>
          <text fg={theme.textMuted}>
            Enter the base URL of your organization's OpenWebUI instance.
          </text>
          <textarea
            height={3}
            ref={(val: TextareaRenderable) => {
              textarea = val
              setTextareaTarget(val)
            }}
            initialValue={urlValue()}
            placeholder="https://webui.dev.cora.sern.mil"
            placeholderColor={theme.textMuted}
            textColor={theme.text}
            focusedTextColor={theme.text}
            cursorColor={theme.text}
          />
          <text fg={theme.textMuted}>Press <span style={{ fg: theme.primary, attributes: TextAttributes.BOLD }}>Enter</span> to continue</text>
        </Show>

        <Show when={step() === "key"}>
          <text attributes={TextAttributes.BOLD} fg={theme.primary}>
            API Key
          </text>
          <box gap={0}>
            <text fg={theme.textMuted}>
              Enter your OpenWebUI API Key.
            </text>
            <text fg={theme.textMuted}>
              Generate one under <span style={{ fg: theme.text }}>OpenWebUI → Account → API Keys</span>
            </text>
          </box>
          <textarea
            height={3}
            ref={(val: TextareaRenderable) => {
              textarea = val
              setTextareaTarget(val)
            }}
            initialValue={keyValue()}
            placeholder="sk-..."
            placeholderColor={theme.textMuted}
            textColor={theme.text}
            focusedTextColor={theme.text}
            cursorColor={theme.text}
          />
          <box flexDirection="row" gap={2}>
            <text fg={theme.textMuted}>Press <span style={{ fg: theme.primary, attributes: TextAttributes.BOLD }}>Enter</span> to validate & save</text>
            <text fg={theme.textMuted}><span style={{ fg: theme.primary, attributes: TextAttributes.BOLD }}>Esc</span> to go back</text>
          </box>
        </Show>

        <Show when={step() === "validating"}>
          <box flexGrow={1} justifyContent="center" alignItems="center" gap={1}>
            <Spinner color={theme.primary}>Validating credentials against OpenWebUI...</Spinner>
            <text fg={theme.textMuted}>{urlValue()}</text>
          </box>
        </Show>

        <Show when={step() === "success"}>
          <box flexGrow={1} justifyContent="center" alignItems="center" gap={1}>
            <text fg={theme.success} attributes={TextAttributes.BOLD}>
              ✓ Connected successfully{userName() ? ` — welcome, ${userName()}!` : "!"}
            </text>
            <text fg={theme.textMuted}>
              Launching OpenCora...
            </text>
          </box>
        </Show>

        <Show when={errorMsg()}>
          <box paddingTop={1}>
            <text fg={theme.error} attributes={TextAttributes.BOLD}>
              ✗ {errorMsg()}
            </text>
          </box>
        </Show>
      </box>

      <box flexDirection="row" justifyContent="space-between" paddingTop={1}>
        <text fg={theme.textMuted}>
          <Show when={step() === "url" || step() === "key"}>
            You can reconfigure this later via Ctrl+P → Connect a provider
          </Show>
        </text>
        <text fg={theme.textMuted}>Press Ctrl+C to exit</text>
      </box>
    </box>
  )
}
