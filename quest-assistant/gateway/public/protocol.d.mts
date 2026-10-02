export interface FlagRow {
  id: string; title: string; body: string; lat: number; lon: number; date: string;
  sourceLabel: string; url: string | null; confidence: string;
}
export interface Camera { lat: number; lon: number; zoom: number; label: string }
export interface WorkspaceState {
  sourceMode: "live" | "demo"; flags: FlagRow[]; numbered: FlagRow[];
  selected: FlagRow | null; timeZone: string;
  layers: { firms: boolean; thermalRaster: boolean }; camera: Camera;
  diagram?: { id: string; title: string; source: string }[];
}
export type Action =
  | { type: "navigate"; place: string }
  | { type: "read_flags"; scope: "today"; limit: number }
  | { type: "select_flag"; index: number }
  | { type: "set_layer"; layer: "firms" | "thermalRaster"; enabled: boolean }
  | { type: "make_diagram" };
export interface Plan { reply: string; actions: Action[] }
export const PLACES: Readonly<Record<string, Camera>>;
export const TOOLS: string[];
export function dateInZone(value: string | number, timeZone?: string): string | null;
export function cleanFlags(rows: unknown): FlagRow[];
export function validatePlan(input: unknown): Plan;
export function stagePlan(state: WorkspaceState, plan: unknown, now?: number):
  { state: WorkspaceState; outcomes: string[]; plan: Plan };
export function demoPlan(text: string): Plan;
