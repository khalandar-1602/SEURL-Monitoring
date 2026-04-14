const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");

// ── Teams Webhook URL ────────────────────────────────────────────────
// To set up: Teams channel → ••• → Connectors → Incoming Webhook → Create
// Paste the webhook URL below:
const TEAMS_WEBHOOK_URL = "https://schneiderelectric.webhook.office.com/webhookb2/fd46b562-f7b7-4cb3-85c1-a5c0554e6bb6@6e51e1ad-c54b-4b39-b598-0ffe9ae68fef/IncomingWebhook/dad613afad574907ab7bc1f72c24d288/deec8c19-39f2-4b50-b73f-9d0526366ac6/V2lpMIxqeDlly17DpkqBsAA2L7dwZSIt7JY1hCsmrPSHk1";

const app = express();
const PORT = process.env.PORT || 3000;

const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
console.log(`Screenshots will be saved to: ${SCREENSHOTS_DIR}`);

const URLS = [
  "https://www.se.com/ww/en/about-us/investor-relations/?flush=9876",
  "https://www.se.com/us/en/?flush=12348",
  // "https://www.se.com/us/en/about-us/newsroom/?flush=5678",
  // "https://www.se.com/us/en/work/campaign/customer-stories/?flush=45678",
  // "https://www.se.com/ww/en/about-us/investor-relations/financial-results/?flush=23456789",
  // "https://www.se.com/us/en/work/products/industrial-automation-control/tools/motor-control-configurator/?preferredCountry=yes?flush=678",
  // "https://infra-in.se.com/en/?flush=2143345",
  // "https://www.se.com/us/en/sdltfosvc/warranty/?sn=AS2351253360",
  // "https://www.se.com/uk/en/download/document/SchneiderElectric_TrustCharter/",
  // "https://www.se.com/us/en/product-range/65972-ecostruxure-it-expert/#overview",
  // "https://www.se.com/us/en/search/?q=ecostructure",
  // "https://www.se.com/ww/en/about-us/legal/data-privacy/?flush=345678",
  // "https://www.se.com/ww/en/country-data-protection-correspondent-email/?flush=6789",
  // "https://prod-uce.d2b2ks5n72ezlz.amplifyapp.com/ww/en/about-us/investor-relations/?flush=9876",
  // "https://prod-uce.d2b2ks5n72ezlz.amplifyapp.com/us/en/?flush=9876",
  // "https://prod-uce.d2b2ks5n72ezlz.amplifyapp.com/us/en/work/campaign/customer-stories/?flush=989678",
  // "https://prod-uce.d2b2ks5n72ezlz.amplifyapp.com/ww/en/about-us/investor-relations/financial-results/?flush=09989",
  // "https://prod-uce.d2b2ks5n72ezlz.amplifyapp.com/us/en/work/products/industrial-automation-control/tools/motor-control-configurator/?preferredCountry=yes?flush=989",
  // "https://prod-uce.d2b2ks5n72ezlz.amplifyapp.com/us/en/product-range/65972-ecostruxure-it-expert/#overview?flush=888989",
  // "https://prod-uce.d2b2ks5n72ezlz.amplifyapp.com/ww/en/about-us/legal/data-privacy/?flush=124989",
  // "https://prod-uce.d2b2ks5n72ezlz.amplifyapp.com/ww/en/country-data-protection-correspondent-email/?flush=9876989",
];

// Store results in memory
let monitorResults = [];
let isRunning = false;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use("/screenshots", express.static(SCREENSHOTS_DIR));

// API: Get current results
app.get("/api/results", (req, res) => {
  res.json({ results: monitorResults, isRunning });
});

// API: Start monitoring
app.get("/api/run", async (req, res) => {
  if (isRunning) {
    return res.json({ message: "Monitoring is already running." });
  }
  isRunning = true;
  monitorResults = [];
  res.json({ message: "Monitoring started." });

  try {
    await runMonitoring();
  } catch (err) {
    console.error("Monitoring error:", err);
  } finally {
    isRunning = false;
  }
});

// SSE: Stream live progress
app.get("/api/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ results: monitorResults, isRunning })}\n\n`);
    if (!isRunning && monitorResults.length > 0) {
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  req.on("close", () => clearInterval(interval));
});

function sanitizeFilename(url) {
  return url
    .replace(/https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .substring(0, 100);
}

async function runMonitoring() {
  console.log("Starting URL monitoring...\n");

  const launchOptions = {
    headless: "new",
    defaultViewport: { width: 1920, height: 1080 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);

  for (let i = 0; i < URLS.length; i++) {
    const url = URLS[i];
    const entry = {
      index: i + 1,
      url,
      status: "processing",
      httpStatus: null,
      screenshotFile: null,
      timestamp: null,
      error: null,
    };
    monitorResults.push(entry);

    console.log(`[${i + 1}/${URLS.length}] Checking: ${url}`);

    let page;
    try {
      page = await browser.newPage();

      // Navigate and capture HTTP status — wait for full load
      const response = await page.goto(url, {
        waitUntil: ["load", "domcontentloaded", "networkidle0"],
        timeout: 90000,
      });

      const httpStatus = response ? response.status() : 0;
      entry.httpStatus = httpStatus;

      if (httpStatus >= 200 && httpStatus < 400) {
        // Wait for all images to fully load
        await page.evaluate(() => {
          return new Promise((resolve) => {
            const images = Array.from(document.querySelectorAll("img"));
            const pending = images.filter((img) => !img.complete);
            if (pending.length === 0) return resolve();
            let loaded = 0;
            pending.forEach((img) => {
              img.addEventListener("load", () => { if (++loaded >= pending.length) resolve(); });
              img.addEventListener("error", () => { if (++loaded >= pending.length) resolve(); });
            });
            setTimeout(resolve, 10000);
          });
        });

        // Scroll to bottom and back to trigger lazy-loaded content
        await page.evaluate(async () => {
          await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 300;
            const timer = setInterval(() => {
              window.scrollBy(0, distance);
              totalHeight += distance;
              if (totalHeight >= document.body.scrollHeight) {
                clearInterval(timer);
                window.scrollTo(0, 0);
                resolve();
              }
            }, 100);
          });
        });

        // Wait for any newly triggered lazy content to load
        await new Promise((r) => setTimeout(r, 3000));

        // Scroll back to top so the page looks clean for the screenshot
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise((r) => setTimeout(r, 1000));

        // Inject timestamp overlay onto the page
        await page.evaluate(() => {
          const ts = new Date().toLocaleString("en-US", {
            dateStyle: "full",
            timeStyle: "long",
            timeZone: "America/New_York",
          });
          const banner = document.createElement("div");
          banner.textContent = `Screenshot captured: ${ts}`;
          banner.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
            background: rgba(0,0,0,0.85); color: #fff; text-align: center;
            padding: 8px 16px; font: bold 14px/1.4 sans-serif;
            letter-spacing: 0.5px;
          `;
          document.body.prepend(banner);
        });
        await new Promise((r) => setTimeout(r, 500));

        // Take page screenshot
        const filename = `${sanitizeFilename(url)}_${Date.now()}.png`;
        const filepath = path.join(SCREENSHOTS_DIR, filename);

        await page.screenshot({ path: filepath, fullPage: false });

        entry.screenshotFile = filename;
        entry.status = "success";
        entry.timestamp = new Date().toISOString();
        console.log(`  ✓ HTTP ${httpStatus} — Screenshot saved: ${filename}`);
      } else {
        entry.status = "failed";
        entry.timestamp = new Date().toISOString();
        console.log(`  ✗ HTTP ${httpStatus} — Skipping screenshot`);
      }
    } catch (err) {
      entry.status = "error";
      entry.error = err.message;
      entry.timestamp = new Date().toISOString();
      console.log(`  ✗ Error: ${err.message}`);
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  await browser.close();
  console.log("\nMonitoring complete.");

  // Send Teams notification
  await sendTeamsNotification(monitorResults);
}

async function sendTeamsNotification(results) {
  if (!TEAMS_WEBHOOK_URL || TEAMS_WEBHOOK_URL === "https://teams.microsoft.com/l/message/19:42ad6ad9-ceff-47f7-b016-c708546bb912_deec8c19-39f2-4b50-b73f-9d0526366ac6@unq.gbl.spaces/1776142526470?context=%7B%22contextType%22%3A%22chat%22%7D") {
    console.log("[Teams] Skipped — webhook URL not configured.");
    return;
  }

  const success = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed" || r.status === "error").length;
  const total = results.length;
  const timestamp = new Date().toLocaleString();

  const statusColor = failed === 0 ? "Good" : failed <= 3 ? "Warning" : "Attention";

  // Build rows for each URL result
  const urlRows = results.map((r) => {
    const icon = r.status === "success" ? "✅" : r.status === "failed" ? "❌" : r.status === "error" ? "⚠️" : "⏳";
    const httpStr = r.httpStatus ? ` (HTTP ${r.httpStatus})` : "";
    const shortUrl = r.url.length > 70 ? r.url.substring(0, 67) + "..." : r.url;
    return {
      type: "TextBlock",
      text: `${icon} **${r.index}.** ${shortUrl}${httpStr}`,
      wrap: true,
      size: "Small",
      spacing: "Small",
    };
  });

  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: "⚡ URL Monitor Report",
              weight: "Bolder",
              size: "Large",
              style: "heading",
            },
            {
              type: "TextBlock",
              text: `Completed at ${timestamp}`,
              isSubtle: true,
              spacing: "None",
            },
            {
              type: "ColumnSet",
              columns: [
                {
                  type: "Column",
                  width: "stretch",
                  items: [
                    { type: "TextBlock", text: "Total", weight: "Bolder", horizontalAlignment: "Center" },
                    { type: "TextBlock", text: `${total}`, size: "ExtraLarge", horizontalAlignment: "Center", color: "Accent" },
                  ],
                },
                {
                  type: "Column",
                  width: "stretch",
                  items: [
                    { type: "TextBlock", text: "Success", weight: "Bolder", horizontalAlignment: "Center" },
                    { type: "TextBlock", text: `${success}`, size: "ExtraLarge", horizontalAlignment: "Center", color: "Good" },
                  ],
                },
                {
                  type: "Column",
                  width: "stretch",
                  items: [
                    { type: "TextBlock", text: "Failed", weight: "Bolder", horizontalAlignment: "Center" },
                    { type: "TextBlock", text: `${failed}`, size: "ExtraLarge", horizontalAlignment: "Center", color: "Attention" },
                  ],
                },
              ],
            },
            {
              type: "TextBlock",
              text: "**URL Results:**",
              weight: "Bolder",
              spacing: "Medium",
            },
            ...urlRows,
          ],
          actions: [
            {
              type: "Action.OpenUrl",
              title: "📊 Open Dashboard & View Screenshots",
              url: `http://localhost:${PORT}`,
            },
          ],
        },
      },
    ],
  };

  try {
    await postJson(TEAMS_WEBHOOK_URL, card);
    console.log("[Teams] Notification sent successfully.");
  } catch (err) {
    console.error("[Teams] Failed to send notification:", err.message);
  }
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
          else reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        });
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// Scheduling is handled externally via cron-job.org hitting /api/run
// This avoids issues with Render free tier spinning down and losing setInterval

// API: Get scheduler info
app.get("/api/schedule", (req, res) => {
  res.json({ isRunning });
});

// Health check endpoint (for cron-job.org or uptime monitors)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  URL Monitor Dashboard                       ║`);
  console.log(`║  Open on port ${PORT}                            ║`);
  console.log(`║  Triggered via cron-job.org every 2 hours     ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
});
});
