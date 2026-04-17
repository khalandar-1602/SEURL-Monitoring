const express = require("express");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");

// Apply stealth plugin — patches 10+ bot-detection vectors
puppeteer.use(StealthPlugin());

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
  "https://www.se.com/us/en/about-us/newsroom/?flush=5678",
  "https://www.se.com/us/en/work/campaign/customer-stories/?flush=45678",
  "https://www.se.com/ww/en/about-us/investor-relations/financial-results/?flush=23456789",
  "https://www.se.com/us/en/work/products/industrial-automation-control/tools/motor-control-configurator/?preferredCountry=yes?flush=678",
  "https://infra-in.se.com/en/?flush=2143345",
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
    defaultViewport: { width: 1366, height: 768, deviceScaleFactor: 1 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1366,768",
      "--force-device-scale-factor=1",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-translate",
      "--metrics-recording-only",
      "--no-first-run",
    ],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);

  // List of realistic user-agents to rotate
  const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  ];

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

    const MAX_RETRIES = 3;
    let attempt = 0;
    let succeeded = false;

    while (attempt < MAX_RETRIES && !succeeded) {
      attempt++;
      if (attempt > 1) {
        const retryDelay = attempt * 3000 + Math.random() * 2000;
        console.log(`  ↻ Retry ${attempt}/${MAX_RETRIES} after ${Math.round(retryDelay / 1000)}s delay...`);
        await new Promise((r) => setTimeout(r, retryDelay));
      }

    let page;
    try {
      page = await browser.newPage();

      // Rotate user-agent per request
      const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      await page.setUserAgent(ua);
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
      });

      // Block heavy resources via CDP — does NOT break stealth plugin
      // (unlike setRequestInterception which enables detectable Fetch.enable)
      const cdpSession = await page.createCDPSession();
      await cdpSession.send("Network.setBlockedURLs", {
        urls: [
          "*google-analytics.com*",
          "*googletagmanager.com*",
          "*facebook.net*",
          "*doubleclick.net*",
          "*hotjar.com*",
          "*newrelic.com*",
          "*nr-data.net*",
          "*optimizely.com*",
          "*demdex.net*",
          "*omtrdc.net*",
          "*2o7.net*",
        ],
      });
      await cdpSession.send("Network.enable");

      // Additional stealth: override navigator properties
      await page.evaluateOnNewDocument(() => {
        // Mask webdriver
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        // Realistic plugins array
        Object.defineProperty(navigator, "plugins", {
          get: () => {
            const plugins = [
              { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format" },
              { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "" },
              { name: "Native Client", filename: "internal-nacl-plugin", description: "" },
            ];
            plugins.length = 3;
            return plugins;
          },
        });
        Object.defineProperty(navigator, "languages", {
          get: () => ["en-US", "en"],
        });
        // Chrome runtime object
        window.chrome = {
          runtime: {
            onMessage: { addListener: () => {}, removeListener: () => {} },
            onConnect: { addListener: () => {}, removeListener: () => {} },
            sendMessage: () => {},
          },
          loadTimes: () => ({}),
          csi: () => ({}),
          app: { isInstalled: false },
        };
        // Override permissions query
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
          parameters.name === "notifications"
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);
      });

      // Navigate — use domcontentloaded first (fast), then wait for visual readiness
      let response;
      try {
        response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        // Wait for page to fully render
        await page.waitForFunction(() => document.readyState === "complete", { timeout: 30000 }).catch(() => {});
      } catch (navErr) {
        console.log(`  ⚠ First navigation attempt failed: ${navErr.message}`);
        response = await page.goto(url, {
          waitUntil: "load",
          timeout: 60000,
        });
      }

      // Allow additional network settling (max 8s)
      await Promise.race([
        page.waitForNetworkIdle({ idleTime: 1500, timeout: 8000 }),
        new Promise((r) => setTimeout(r, 8000)),
      ]).catch(() => {});

      // Try to dismiss cookie consent banners (common on se.com)
      await page.evaluate(() => {
        const selectors = [
          '#onetrust-accept-btn-handler',
          '.onetrust-accept-btn-handler',
          '[id*="accept"][id*="cookie"]',
          '[class*="accept"][class*="cookie"]',
          'button[aria-label*="Accept"]',
          'button[aria-label*="accept"]',
          '.cookie-accept',
          '#cookie-accept',
          '[data-testid="accept-cookies"]',
        ];
        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn) { btn.click(); break; }
        }
      }).catch(() => {});
      // Brief wait after cookie dismissal
      await new Promise((r) => setTimeout(r, 1000));

      const httpStatus = response ? response.status() : 0;
      entry.httpStatus = httpStatus;

      // Retry on 403 — likely bot detection
      if (httpStatus === 403 && attempt < MAX_RETRIES) {
        console.log(`  ⚠ HTTP 403 on attempt ${attempt} — will retry`);
        await page.close().catch(() => {});
        continue;
      }

      if (httpStatus >= 200 && httpStatus < 400) {
        // Wait for visible images to load (5s max)
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
            setTimeout(resolve, 5000);
          });
        });

        // Quick scroll down and back (triggers lazy content)
        await page.evaluate(async () => {
          const totalHeight = document.body.scrollHeight;
          const step = Math.ceil(totalHeight / 5);
          for (let pos = 0; pos < totalHeight; pos += step) {
            window.scrollTo(0, pos);
            await new Promise((r) => setTimeout(r, 200));
          }
          window.scrollTo(0, 0);
        });

        // Brief wait for lazy content to render
        await new Promise((r) => setTimeout(r, 2000));

        // Zoom out the page to 60% so more content is visible in the screenshot
        await page.evaluate(() => {
          document.body.style.transformOrigin = "top left";
          document.body.style.transform = "scale(0.6)";
          document.body.style.width = "166.67%"; // 100/0.6 to prevent horizontal cutoff
        });
        await new Promise((r) => setTimeout(r, 500));

        // Inject timestamp + URL overlay onto the page (after zoom)
        await page.evaluate((pageUrl) => {
          const ts = new Date().toLocaleString("en-IN", {
            dateStyle: "full",
            timeStyle: "long",
            timeZone: "Asia/Kolkata",
          });
          const banner = document.createElement("div");
          banner.innerHTML = `<div style="font-size:13px;opacity:0.85;margin-bottom:2px;">${pageUrl}</div><div>Screenshot captured: ${ts}</div>`;
          banner.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
            background: rgba(0,0,0,0.85); color: #fff; text-align: center;
            padding: 6px 12px; font: bold 12px/1.4 sans-serif;
            letter-spacing: 0.5px; transform: scale(1.67); transform-origin: top center;
          `;
          document.body.prepend(banner);
        }, url);
        await new Promise((r) => setTimeout(r, 500));

        // Take page screenshot — captures the zoomed-out view showing more content
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

      succeeded = true;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.log(`  ⚠ Error on attempt ${attempt}: ${err.message} — will retry`);
      } else {
        entry.status = "error";
        entry.error = err.message;
        entry.timestamp = new Date().toISOString();
        console.log(`  ✗ Error: ${err.message}`);
      }
    } finally {
      if (page) await page.close().catch(() => {});
    }
    } // end while retry loop

    // Add delay between URLs (1–3s) to avoid rate limiting
    if (i < URLS.length - 1) {
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
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

  const BASE_URL = process.env.BASE_URL || "https://seurl-monitoring.onrender.com";

  // Send one card per URL with its screenshot
  for (const r of results) {
    const icon = r.status === "success" ? "✅" : r.status === "failed" ? "❌" : r.status === "error" ? "⚠️" : "⏳";
    const httpStr = r.httpStatus ? ` — HTTP ${r.httpStatus}` : "";

    const bodyItems = [
      {
        type: "TextBlock",
        text: `${icon} **[${r.index}/${results.length}]** ${r.url}`,
        wrap: true,
        weight: "Bolder",
        size: "Medium",
      },
      {
        type: "TextBlock",
        text: `Status: **${r.status.toUpperCase()}**${httpStr}`,
        wrap: true,
        spacing: "Small",
        isSubtle: true,
      },
    ];

    if (r.screenshotFile) {
      const imageUrl = `${BASE_URL}/screenshots/${r.screenshotFile}`;
      console.log(`[Teams] Image URL for URL ${r.index}: ${imageUrl}`);
      bodyItems.push({
        type: "Image",
        url: imageUrl,
        size: "Stretch",
        spacing: "Medium",
      });
    }

    if (r.error) {
      bodyItems.push({
        type: "TextBlock",
        text: `⚠️ Error: ${r.error}`,
        wrap: true,
        color: "Attention",
        spacing: "Small",
      });
    }

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
            body: bodyItems,
          },
        },
      ],
    };

    try {
      const response = await postJson(TEAMS_WEBHOOK_URL, card);
      console.log(`[Teams] Screenshot sent for URL ${r.index}: ${r.url} — Response: ${response}`);
    } catch (err) {
      console.error(`[Teams] Failed to send screenshot for URL ${r.index}: ${r.url}`, err.message);
    }

    // Small delay between messages to avoid throttling
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log("[Teams] All screenshots sent.");
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

  // Auto-run monitoring on startup
  console.log("Auto-starting monitoring on server boot...");
  isRunning = true;
  monitorResults = [];
  runMonitoring()
    .catch((err) => console.error("Startup monitoring error:", err))
    .finally(() => { isRunning = false; });
});
 