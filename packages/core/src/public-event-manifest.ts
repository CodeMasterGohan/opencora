export * as PublicEventManifest from "./public-event-manifest"

import { Event } from "@opencora/schema/event"
import { EventManifest } from "@opencora/schema/event-manifest"

export const Definitions = EventManifest.ServerDefinitions
export const Latest = Event.latest(Definitions)
