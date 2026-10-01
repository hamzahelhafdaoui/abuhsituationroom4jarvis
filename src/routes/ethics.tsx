import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/doc-page";
import { DOCTRINE, LANGUAGE_RULES, MISSION } from "@/lib/ethics";

export const Route = createFileRoute("/ethics")({ component: Ethics });

function Ethics() {
  return (
    <DocPage kicker="Legal / ethics memo" title="Public data, no targeting, multi-party, confidence">
      <p>
        This page is the one-page memo that ships with the product. It is binding on generated
        text, exports, and analyst workflow.
      </p>

      <h2>Purpose</h2>
      <p>The platform exists for:</p>
      <ul>
        {MISSION.existsFor.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p>The platform does not exist for:</p>
      <ul>
        {MISSION.doesNotExistFor.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p>
        If a later user asks for targeting, ranking of “best targets,” predicted strike
        effectiveness, or operational military advice, refuse and keep the tool in documentation
        mode.
      </p>

      <h2>Public data only</h2>
      <p>
        Ingest is limited to public satellite browse (NASA GIBS / Sentinel-2 HLS, public Sentinel-1
        RTC for cloud gaps), NASA FIRMS public CSVs, public ADS-B / OpenSky, a keyless Gulf AIS
        feed where one exists, and user-curated open reporting (UN, OHCHR, Yale HRL, Bellingcat,
        Reuters, already-published citations, official statements). Paywalled commercial imagery
        is not scraped. ACLED and UCDP are corroboration only; without a public token the desk
        ships a citation file and does not pretend those rows are live event ids. Schematic
        sea-lane markers are not ships. Absence of ADS-B, AIS, or FIRMS is not absence of activity.
      </p>

      <h2>Analytical doctrine</h2>
      <ul>
        {DOCTRINE.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>

      <h2>Language</h2>
      <p>Allowed examples:</p>
      <ul>
        {LANGUAGE_RULES.allowed.map((x) => (
          <li key={x}>“{x}”</li>
        ))}
      </ul>
      <p>Disallowed examples:</p>
      <ul>
        {LANGUAGE_RULES.disallowed.map((x) => (
          <li key={x}>“{x}”</li>
        ))}
      </ul>

      <h2>Symmetry</h2>
      <p>
        Rapid Support Forces, Sudanese Armed Forces, allied militias, other armed groups, and
        foreign-linked logistics are treated as parties to be documented, not as a single hunter’s
        quarry. Cross-border compounds default to undetermined local actors (including ENDF,
        regional forces, militia, commercial, humanitarian) until a movement chain is shown.
      </p>

      <h2>Civilian objects</h2>
      <p>
        Markets, hospitals, power, water, IDP camps, and residential fabric are first-class
        archive objects. Damage there is recorded as civilian-harm context. Protected status under
        international humanitarian law does not depend on nearby military activity.
      </p>

      <h2>Human review</h2>
      <p>
        Automation may open an alert. A human must confirm, reject, or mark “needs imagery.”
        Party labels require a written reason and are audited (who, when, why). Confidence 5 is
        rare on purpose. Auto detection boxes stay at 1 or 2 and never display 4 or 5. Archive
        cards stay “ingested published post — not an AHSR assessment” until a human writes a
        separate note. Coincidence is a weak-signal meter, not a war forecast and not a confirmed
        alert.
      </p>
    </DocPage>
  );
}
