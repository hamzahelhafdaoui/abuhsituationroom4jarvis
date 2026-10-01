/** Keyword tone for a headline. Not a model, not a threat score. */
export type WireTone = "hot" | "aid" | "wire";

const HOT =
  /strike|struck|drone|shot down|shell|offensive|clash|killed|airstrike|bomb|artillery|advance|seized|capture/i;
const AID = /humanitarian|ceasefire|aid|displaced|famine|talks|truce|convoy|refugee|hunger|peace/i;

export function scoreHeadline(title: string): WireTone {
  if (HOT.test(title)) return "hot";
  if (AID.test(title)) return "aid";
  return "wire";
}

export const TONE_LABEL: Record<WireTone, string> = {
  hot: "KINETIC",
  aid: "AID",
  wire: "WIRE",
};
