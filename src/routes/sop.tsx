import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/doc-page";

export const Route = createFileRoute("/sop")({ component: Sop });

function Sop() {
  return (
    <DocPage kicker="Analyst SOP" title="Review an alert in ten minutes">
      <p>
        This is the standard operating procedure for a human reviewing an auto-opened card. Stay
        observational. If you cannot answer a question from the evidence in hand, write “unknown.”
      </p>

      <h2>0:00–0:30 — Read the card cold</h2>
      <p>
        Note type (change / thermal / flight / convoy / damage / multi-source), score, linked
        sites, and the confidence pip. Check that auto-text did not name a perpetrator or a cargo.
        If it did, reject and rewrite.
      </p>

      <h2>0:30–1:00 — Drop the party filter</h2>
      <p>
        Set Party to All before you look at the map. Confirm you are not reviewing an RSF-only or
        SAF-only slice. Look at the civilian baseline on the site card (market, farm, hospital,
        scheduled aviation, humanitarian convoy).
      </p>

      <h2>1:00–3:00 — Two clear optical frames</h2>
      <p>
        Open the site. Use GIBS before/after or the two snapshots. If either date is cloudy, say
        so. Do not interpolate vehicles through cloud. At 10 m, log an estimate band, not a
        census. Ask: new berms, compacted yards, vegetation removal, burn scars, roof collapse,
        dispersal into tree cover?
      </p>

      <h2>3:00–4:00 — Thermal</h2>
      <p>
        FIRMS: day or night, FRP, satellite, confidence, class. Is this Gezira in the dry season
        (agricultural)? Heglig (flare)? Brick kilns? Urban night cluster near a hospital or camp
        (possible structure fire or explosive — still “possible”)? If the health chip is red, read
        the reason (CSV fail, empty box, no key path) and do not treat zero as “no fires.” Snap
        radius is kilometres, not metres; 375 m pixels do not pinpoint a warehouse door.
      </p>

      <h2>3:00–4:30 — Cloud and SAR</h2>
      <p>
        If Sentinel-2 is cloudy, switch to Sentinel-1 for that date. Use it as morphology context
        only. Do not count vehicles on speckle. Do not call a bright SAR return wreckage. DET stays
        off on this layer. Write “coverage gap” if both optical and SAR are empty.
      </p>

      <h2>4:30–5:30 — Flights and ships</h2>
      <p>
        Flights: airframe category, scheduled or not, nearest airfield, whether a landing is
        actually in ADS-B. Khartoum and Darfur silence is usually a coverage gap.
      </p>
      <p>
        Ships: only the AIS layer with age under 30 minutes is a contact. Gulf AIS is not a Red
        Sea arrival. Lane markers say NOT LIVE AIS — do not log them as hulls. Type is typical,
        not cargo. Kufra is a land node; use freight smear (possible moving vehicles, not a count)
        and ADS-B, not a fictional ship.
      </p>
      <ul>
        <li>Where did the aircraft arrive?</li>
        <li>What ground vehicles met it?</li>
        <li>Where did those vehicles go in subsequent scenes?</li>
      </ul>
      <p>If the next image is cloudy or 10 m cannot show the convoy, write that. Do not invent.</p>

      <h2>5:00–7:00 — Corroboration</h2>
      <p>
        Scan ReliefWeb, UN, OHCHR, Yale HRL, Reuters, or the shipped conflict citations. Open the
        source URL. Reporting can raise confidence; it is not ground truth and not an AHSR
        assessment. A citation pin alone does not confirm an alert. News centroids are not incident
        coordinates. Cross-border Ethiopian compounds stay undetermined until a movement chain
        into Sudan is shown.
      </p>

      <h2>7:00–9:00 — Score</h2>
      <p>
        Apply the rubric. Two families + multi-date = 3. Do not award 4 without consistent
        reporting. Do not award 5 without high-res or ground media plus a movement chain. Record
        negative evidence if the site resolves civilian.
      </p>

      <h2>9:00–10:00 — Click</h2>
      <p>
        Confirm, reject, or needs imagery. Write one observational sentence. If you change a party
        label, give a reason — the audit log stores who/when/why. Export only with the limitations
        footer still attached.
      </p>

      <h2>Stop conditions</h2>
      <ul>
        <li>Anyone asks for an aimpoint, target rank, or strike advice — refuse, stay in documentation mode.</li>
        <li>A single FIRMS point or a single overflight — do not promote to a confirmed military narrative.</li>
        <li>You are guessing cargo, intent, or perpetrator from crater shape — stop.</li>
      </ul>
    </DocPage>
  );
}
