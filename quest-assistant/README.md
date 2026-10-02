# Quest Assistant prototype

A personal HUD with one voice and interchangeable OpenAI, xAI and Google model adapters.
The Android APK is a **2D Quest panel app**, not a native OpenXR/passthrough experience.
It includes a bundled HUD and synthetic demonstration records. It does not need a backend for
demo commands. Live AI, cloud speech and your situation-room connection require configuration.

## Get the APK

The **Quest Assistant APK** GitHub Actions workflow builds a debug-signed APK and uploads
`quest-assistant-debug-apk`. Download that artifact and extract `app-debug.apk`.
Enable developer mode for your Quest and install the APK with SideQuest. Launch **Quest Assistant**
from Unknown Sources. Device installation and operation have not been tested on physical hardware.

The bundled demonstration supports:
- “Open Sudan, zoom to Nyala.”
- “Read today's five latest records.”
- “Zoom to number three with FIRMS.”
- “Make an evidence diagram.”

All demonstration markers and records are explicitly synthetic, not incident reports.
The background map uses OpenStreetMap tiles when internet is available.

## Backend

`gateway/` is a standalone Node 22 service. Its provider calls use ordinary HTTPS APIs.
It also includes a Vercel adapter; set the Vercel project root to `quest-assistant/gateway`.
A long-running Node deployment needs an HTTPS reverse proxy. The application intentionally
rejects HTTP backend URLs in the headset.

Set runtime variables in your hosting service's secret settings; do not commit keys or create
a repository `.env` file:

| Variable | Purpose |
| --- | --- |
| ASSISTANT_TOKEN | Required private access token, random and at least 24 characters |
| OPENAI_API_KEY | OpenAI conversation, transcription and cloud speech |
| XAI_API_KEY | Grok conversation |
| GEMINI_API_KEY | Gemini conversation |
| OPENAI_MODEL | Optional; default gpt-4.1-mini |
| XAI_MODEL | Optional; default grok-4.5 |
| GEMINI_MODEL | Optional; default gemini-2.5-flash |
| OPENAI_STT_MODEL | Optional; default gpt-4o-mini-transcribe |
| OPENAI_TTS_MODEL | Optional; default gpt-4o-mini-tts |
| OPENAI_TTS_VOICE | Optional; default cedar |
| ASSISTANT_UI_ORIGIN | Optional exact HTTPS origin for a separately hosted web HUD |
| PORT | Optional Node port; default 8080 |

Model availability depends on the provider account. Defaults are configurable, and no live
provider calls have been validated without credentials. Consumer chat subscriptions and
API billing are separate.

The backend exposes authenticated `/api/status`, `/api/chat`, `/api/transcribe` and
`/api/speech`. All provider keys remain on the server. Requests have size, output and timeout
limits and a 12-request-per-minute cap per running backend instance. Serverless deployments
need their hosting provider's shared rate controls for a global cap; the in-memory cap is
not shared across instances.

Only explicit commands initiate paid calls. No provider fallback runs silently.
Cloud microphone transcription currently uses OpenAI even when Grok or Gemini is selected.
Device/browser speech is available only when the device has a compatible speech engine.
Spoken replies disclose AI-generated speech and use an original assistant delivery.
No actor clone or exact film voice is included. Stop cancels pending requests and audio;
map actions already applied remain in place.

Open **Connect** in the HUD, enter the HTTPS backend URL and ASSISTANT_TOKEN, then pick a
provider. This token is not a provider API key. Browser configuration lasts for the browser
session; the Android app stores connection settings in app-private preferences with backups
disabled.

Developer commands, from `gateway/`: `npm install`, `npm run build`, `npm test`,
`npm run dev`. The server requires ASSISTANT_TOKEN. `npm run test:browser` exercises the HUD.
The APK workflow bundles Leaflet locally; no third-party JavaScript runs in the HUD.

## Connect the existing situation room

The only change to the existing workspace is an opt-in `SituationRoomBridge` component.
It stays inactive unless `VITE_QUEST_ASSISTANT_ORIGIN` is configured and the app is embedded
by that exact origin.

For the APK, set the situation-room build variable:
`VITE_QUEST_ASSISTANT_ORIGIN=https://appassets.androidplatform.net`.
For a browser HUD, use its exact deployed origin instead. One origin is supported at a time.
Deploy the situation-room change normally, then enter its HTTPS URL in the companion.
The site must permit embedding and its usual access controls must allow you to view it.

The bridge checks both message origin and parent-window identity. It accepts only map movement,
numbered record reads/selections, FIRMS/thermal layer settings and evidence diagram preparation.
It never exposes credentials, arbitrary JavaScript execution, repository mutations or deployment.
The native Android bridge is also restricted to the trusted main-frame app-assets origin.

Numbered records are frozen until a new list is requested, so “number three” retains its identity.
“Today” uses Africa/Khartoum. Sorting uses source record timestamps, not source-priority ranking.
The existing Flag data does **not** contain the time the system first flagged a record; the UI
states this limitation. No records means an empty result, not invented incidents.

The bridge in this repository connects to the existing Sudan workspace, including Nyala,
its report/detection flags and its FIRMS controls. It preserves the existing feed coverage
and does not introduce a new ingestion pipeline.
FIRMS layer controls use the software's existing data and imagery dates; thermal detections
alone do not establish the cause of a fire or an attack.

## Scope and next steps

Working prototype source: provider gateway, voice pipeline, typed/demo commands, map bridge,
evidence selection, Mermaid diagram editing/export, code explanations and aid-note drafting.

Not connected yet: document search, repository editing, Grok conversation imports, physical
object recognition, native spatial panels, passthrough and hand tracking. These need their
own integrations. No production app changes are applied by the assistant's code suggestions.

Build checks cover the command sequence, stable numbered references, timezone boundaries,
empty results, rejected actions, provider adapters, token checks, desktop/mobile HUD behavior,
cancellation, the situation-room build and APK compilation. Screenshot artifacts are supplied
for visual review; a physical Quest test is still required.
