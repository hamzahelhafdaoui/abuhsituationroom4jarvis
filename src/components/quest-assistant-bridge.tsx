import { useEffect, useRef } from "react";
import type { Flag } from "@/lib/flags";
import { useAppStore } from "@/lib/store";
import { THEATER_BY_ID } from "@/lib/theaters";
import {
  cleanFlags, stagePlan, type WorkspaceState,
} from "../../quest-assistant/gateway/public/protocol.mjs";

/** Opt-in, exact-origin bridge. No credentials, code execution or arbitrary app actions. */
export function SituationRoomBridge({ flags }: { flags: Flag[] }) {
  const latestFlags = useRef(flags);
  latestFlags.current = flags;
  useEffect(() => {
    const allowed = String(import.meta.env.VITE_QUEST_ASSISTANT_ORIGIN || "").trim();
    if (!allowed || window.parent === window) return;
    let origin: string;
    try {
      const url = new URL(allowed);
      if (url.protocol !== "https:" || url.origin !== allowed) return;
      origin = url.origin;
    } catch { return; }
    const store = useAppStore.getState();
    const theater = THEATER_BY_ID[store.theaterId];
    let shared: WorkspaceState = {
      sourceMode: "live", flags: [], numbered: [], selected: null, diagram: [],
      timeZone: "Africa/Khartoum",
      layers: { firms: store.layers.firms, thermalRaster: store.layers.thermalRaster },
      camera: {
        lat: (theater.south + theater.north) / 2,
        lon: (theater.west + theater.east) / 2, zoom: theater.zoom, label: theater.label,
      },
    };
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== window.parent) return;
      const packet = event.data as { type?: string; id?: string; plan?: unknown } | null;
      if (!packet || !["quest:snapshot", "quest:actions"].includes(packet.type || "") ||
          typeof packet.id !== "string" || packet.id.length > 100) return;
      try {
        const app = useAppStore.getState();
        shared = {
          ...shared, flags: cleanFlags(latestFlags.current),
          layers: { firms: app.layers.firms, thermalRaster: app.layers.thermalRaster },
        };
        let outcomes: string[] = [];
        if (packet.type === "quest:actions") {
          // Validate the whole sequence before changing any map or layer state.
          const staged = stagePlan(shared, packet.plan);
          shared = staged.state; outcomes = staged.outcomes;
          if (staged.plan.actions.some(a => a.type === "navigate" || a.type === "select_flag")) {
            app.setFlyTarget({ ...shared.camera, inspect: shared.camera.zoom >= 11 });
          }
          if (app.layers.firms !== shared.layers.firms) app.toggleLayer("firms");
          if (app.layers.thermalRaster !== shared.layers.thermalRaster) app.toggleLayer("thermalRaster");
        }
        window.parent.postMessage({
          type: "quest:response", id: packet.id,
          snapshot: { ...shared, dateBasis: "source record timestamp; flag creation time unavailable", lastOutcomes: outcomes },
        }, origin);
      } catch (error) {
        window.parent.postMessage({
          type: "quest:response", id: packet.id,
          error: error instanceof Error ? error.message : "Workspace command failed.",
        }, origin);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  return null;
}
