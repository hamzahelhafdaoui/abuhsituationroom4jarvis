import { create } from "zustand";
import type { SmearHit } from "./freight-smear";

export const useFreightState = create<{
  hits: SmearHit[];
  roads: number[][][];
  date: string | null;
  note: string;
  setResult: (r: { hits: SmearHit[]; roads?: number[][][]; date: string; note: string }) => void;
  clear: () => void;
}>((set) => ({
  hits: [],
  roads: [],
  date: null,
  note: "",
  setResult: (r) => set({ hits: r.hits, roads: r.roads ?? [], date: r.date, note: r.note }),
  clear: () => set({ hits: [], roads: [], date: null, note: "" }),
}));
