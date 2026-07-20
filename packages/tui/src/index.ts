// @ts-expect-error
import parserWorkerPath from "../../../node_modules/@opentui/core/parser.worker.js" with { type: "file" };

// Define global variable for tree-sitter worker
(globalThis as any).OTUI_TREE_SITTER_WORKER_PATH = parserWorkerPath;

export { run, type TuiInput } from "./app";

import { run as runTui } from "./app";
import { TuiConfig } from "./config";
import { AppNodeBuilder } from "@opencora/core/effect/app-node-builder";
import { Global } from "@opencora/core/global";
import { Effect, Layer } from "effect";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { NodeHttpServer } from "@effect/platform-node";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { createServer } from "node:http";
import { createEmbeddedRoutes } from "@opencora/server/routes";

if (import.meta.main) {
  // 1. Parse command line arguments
  let projectDir: string | undefined;
  const args: any = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith("-")) {
      if (arg === "--model" || arg === "-m") {
        args.model = process.argv[++i];
      } else if (arg === "--agent") {
        args.agent = process.argv[++i];
      } else if (arg === "--prompt") {
        args.prompt = process.argv[++i];
      } else if (arg === "--continue" || arg === "-c") {
        args.continue = true;
      } else if (arg === "--session" || arg === "-s") {
        args.sessionID = process.argv[++i];
      } else if (arg === "--fork") {
        args.fork = true;
      } else if (arg === "--auto" || arg === "--yolo" || arg === "--dangerously-skip-permissions") {
        args.auto = true;
      } else if (arg === "--version" || arg === "-v") {
        console.log("opencora version 1.18.3");
        process.exit(0);
      } else if (arg === "--help" || arg === "-h") {
        console.log("Usage: opencora [project] [options]");
        console.log("\nOptions:");
        console.log("  -m, --model <model>     Model to use");
        console.log("  --agent <agent>         Agent to use");
        console.log("  --prompt <prompt>       Prompt to use");
        console.log("  -c, --continue          Continue the last session");
        console.log("  -s, --session <id>      Session ID to continue");
        console.log("  --fork                  Fork the session");
        console.log("  --auto                  Auto-approve permissions");
        console.log("  -v, --version           Print version");
        console.log("  -h, --help              Print help");
        process.exit(0);
      }
    } else {
      projectDir = arg;
    }
  }

  // 2. Check OPENCORA_API_KEY
  if (!process.env.OPENCORA_API_KEY) {
    console.error("Error: OPENCORA_API_KEY is not set. Add it to your shell profile and restart.");
    process.exit(1);
  }

  if (projectDir) {
    try {
      process.chdir(projectDir);
    } catch (e) {
      console.error(`Failed to change directory to ${projectDir}`);
      process.exit(1);
    }
  }

  // 3. Define serve layer on dynamic port 0
  const serve = HttpRouter.serve(
    createEmbeddedRoutes() as unknown as Layer.Layer<HttpRouter.HttpRouter, never, never>,
    { disableListenLog: true, disableLogger: true }
  ).pipe(
    Layer.provideMerge(NodeHttpServer.layer(() => createServer(), { port: 0, host: "127.0.0.1" })),
    Layer.provide(Global.layerWith({}))
  );

  // 4. Main effect program
  const program = Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const address = server.address;
    const url = HttpServer.formatAddress(address);

    const config = TuiConfig.resolve({}, { terminalSuspend: false });
    yield* runTui({
      url,
      args,
      config,
      pluginHost: {
        async start() {},
        async dispose() {},
      },
    }).pipe(Effect.provide(Global.layerWith({})));
  });

  // 5. Run the main loop
  NodeRuntime.runMain(
    program.pipe(
      Effect.provide(serve),
      Effect.provide(NodeServices.layer),
      Effect.scoped
    )
  );
}
