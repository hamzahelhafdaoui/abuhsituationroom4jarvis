import { test, expect } from "@playwright/test";
const cors = { "access-control-allow-origin": "http://127.0.0.1:8080", "access-control-allow-headers": "Authorization, Content-Type", "access-control-allow-methods": "GET, POST, OPTIONS" };
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test("Sudan workflow and readable HUD " + viewport.width, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("https://tile.openstreetmap.org/**", route => route.fulfill({
      contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCfcAAAAASUVORK5CYII=", "base64"),
    }));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sudan", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Nyala", exact: true }).click();
    await expect(page.locator("#location")).toHaveText("Nyala");
    await page.getByRole("button", { name: "Read five", exact: true }).first().click();
    await expect(page.locator("#flags button")).toHaveCount(5);
    const thirdTitle = await page.locator("#flags button").nth(2).locator("span").nth(1).evaluate(el => el.firstChild.textContent);
    await page.getByRole("button", { name: "Item 3 + FIRMS" }).click();
    await expect(page.locator("#evidence-title")).toHaveText(thirdTitle);
    await expect(page.locator("#firms")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Diagram", exact: true }).click();
    await expect(page.locator("#diagram")).toHaveValue(/flowchart LR/);
    await expect(page.locator("#conversation")).toContainText("Synthetic demonstration");
    await expect(page.locator("#mode")).toHaveText("SYNTHETIC DEMO");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("hud-" + viewport.width + ".png"), fullPage: true });
  });
}
test("switching provider preserves selected evidence and Stop blocks a late AI response", async ({ page }) => {
  await page.route("https://assistant.test/api/status", route => route.fulfill({
    headers: cors, json: { providers: [{ id: "openai", configured: true, model: "test" }], voice: false, transcription: false },
  }));
  let chatRoute; let signalRequest;
  const received = new Promise(resolve => { signalRequest = resolve; });
  await page.route("https://assistant.test/api/chat", async route => {
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers: cors }); return; }
    chatRoute = route; signalRequest();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Read five", exact: true }).first().click();
  await page.getByRole("button", { name: "Item 3 + FIRMS" }).click();
  const selected = await page.locator("#evidence-title").textContent();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.locator("#backend-url").fill("https://assistant.test");
  await page.locator("#access-token").fill("test-access-token-at-least-24-characters");
  await page.getByRole("button", { name: "Save connection" }).click();
  // A saved connection resets the demo list deliberately; changing models itself does not.
  await page.getByRole("button", { name: "Read five", exact: true }).first().click();
  await page.getByRole("button", { name: "Item 3 + FIRMS" }).click();
  await page.locator("#provider").selectOption("openai");
  await expect(page.locator("#evidence-title")).toHaveText(selected);
  await page.locator("#command").fill("Explain this record"); await page.locator("#send").click();
  await received; await page.getByRole("button", { name: "Stop", exact: true }).click();
  await chatRoute.fulfill({ headers: cors, json: { reply: "LATE RESPONSE", actions: [], provider: "openai", model: "test" } }).catch(() => {});
  await expect(page.locator("#activity")).toHaveText("Stopped");
  await expect(page.locator("#conversation")).not.toContainText("LATE RESPONSE");
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test("choose, preview, and retain an ElevenLabs voice " + viewport.width, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => { HTMLMediaElement.prototype.play = async function () {}; });
    let voiceLists = 0, speechRequests = [];
    await page.route("https://assistant.test/api/**", async route => {
      const request = route.request();
      if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers: cors }); return; }
      expect(request.headers().authorization).toBe("Bearer test-access-token-at-least-24-characters");
      const path = new URL(request.url()).pathname;
      if (path === "/api/status") {
        await route.fulfill({ headers: cors, json: {
          providers: [{ id: "grok", configured: true, model: "test" }],
          voiceProvider: "elevenlabs", voiceSelection: true, voice: false, transcription: true,
        } });
      } else if (path === "/api/voices") {
        voiceLists++;
        await route.fulfill({ headers: cors, json: {
          voices: [{ id: "british123", name: "British assistant", description: "British · male" }],
          nextCursor: "", defaultVoiceId: "",
        } });
      } else if (path === "/api/speech") {
        speechRequests.push(request.postDataJSON());
        await route.fulfill({ headers: cors, contentType: "audio/mpeg", body: Buffer.from([1, 2, 3]) });
      }
    });
    await page.goto("/");
    expect(voiceLists).toBe(0); expect(speechRequests).toHaveLength(0);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page.locator("#backend-url").fill("https://assistant.test");
    await page.locator("#access-token").fill("test-access-token-at-least-24-characters");
    await page.getByRole("button", { name: "Load my voices", exact: true }).click();
    await expect(page.locator("#elevenlabs-voice option")).toHaveCount(2);
    await page.locator("#elevenlabs-voice").selectOption("british123");
    expect(speechRequests).toHaveLength(0);
    await page.getByRole("button", { name: "Test voice", exact: true }).click();
    await expect(page.locator("#voice-status")).toContainText("Preview playing");
    expect(speechRequests[0].voiceId).toBe("british123");
    await page.screenshot({ path: testInfo.outputPath("voice-picker-" + viewport.width + ".png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Save connection", exact: true }).click();
    await expect(page.locator("#connection")).toContainText("ElevenLabs voice ready");
    await page.reload();
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(page.locator("#elevenlabs-voice")).toHaveValue("british123");
    expect(voiceLists).toBe(1); expect(speechRequests).toHaveLength(1);
    await page.locator("#access-token").fill("another-backend-token-at-least-24-chars");
    await expect(page.locator("#elevenlabs-voice")).toHaveValue("");
    expect(errors).toEqual([]);
  });
}
