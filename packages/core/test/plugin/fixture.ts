import { AgentV2 } from "@opencora/core/agent"
import { AISDK } from "@opencora/core/aisdk"
import { Catalog } from "@opencora/core/catalog"
import { CommandV2 } from "@opencora/core/command"
import { Credential } from "@opencora/core/credential"
import { AppNodeBuilder } from "@opencora/core/effect/app-node-builder"
import { LayerNodePlatform } from "@opencora/core/effect/app-node-platform"
import { LayerNode } from "@opencora/core/effect/layer-node"
import { EventV2 } from "@opencora/core/event"
import { FileSystem } from "@opencora/core/filesystem"
import { FSUtil } from "@opencora/core/fs-util"
import { Integration } from "@opencora/core/integration"
import { Location } from "@opencora/core/location"
import { Npm } from "@opencora/core/npm"
import { PluginV2 } from "@opencora/core/plugin"
import { Reference } from "@opencora/core/reference"
import { SkillV2 } from "@opencora/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
