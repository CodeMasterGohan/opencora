import { Effect } from "effect"
import { define } from "../internal"

export const AzurePlugin = define({
  id: "azure",
  effect: Effect.fn(function* () {
    throw new Error("not available in enterprise build")
  })
})

export const AzureCognitiveServicesPlugin = define({
  id: "azure-cognitive-services",
  effect: Effect.fn(function* () {
    throw new Error("not available in enterprise build")
  })
})
