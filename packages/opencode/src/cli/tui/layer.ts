import { run as runTui, type TuiInput } from "@opencora/tui"
import { Global } from "@opencora/core/global"
import { AppNodeBuilder } from "@opencora/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
