import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const DEFAULT_URL =
  "https://sciencedirect.upc.elogim.com/science/article/pii/S0716864025000471";
const DEFAULT_FALLBACK_URL =
  "https://www.elsevier.es/es-revista-revista-medica-clinica-las-condes-202-pdf-download-S0716864025000471";
const DEFAULT_TIMEOUT_MINUTES = 15;

const PDF_SELECTORS = [
  "a.pdf-download-btn-link",
  'a[href*="/pdfft"]',
  'a[href*="/pdf"]',
  'a[aria-label*="Download PDF" i]',
  'button[aria-label*="Download PDF" i]',
];

function printHelp() {
  console.log(`Usage: npm start -- [options]

Options:
  --url <url>                UPC-proxied ScienceDirect article URL
  --fallback-url <url>       Official Elsevier open-access PDF URL
  --output <directory>       Download directory (default: ./downloads)
  --timeout-minutes <number> Time allowed for interactive login (default: 15)
  --help                     Show this help

Credentials are entered only in the visible UPC login page. This script never
asks for, reads, prints, or saves your username or password.`);
}

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    fallbackUrl: null,
    output: path.resolve(process.cwd(), "downloads"),
    timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help") {
      options.help = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }

    if (argument === "--url") {
      options.url = value;
    } else if (argument === "--fallback-url") {
      options.fallbackUrl = value;
    } else if (argument === "--output") {
      options.output = path.resolve(value);
    } else if (argument === "--timeout-minutes") {
      options.timeoutMinutes = Number(value);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }

    index += 1;
  }

  if (!Number.isFinite(options.timeoutMinutes) || options.timeoutMinutes <= 0) {
    throw new Error("--timeout-minutes must be a positive number");
  }

  const articleUrl = new URL(options.url);
  if (articleUrl.protocol !== "https:") {
    throw new Error("The article URL must use HTTPS");
  }
  if (!articleUrl.hostname.endsWith(".upc.elogim.com")) {
    throw new Error("Use the UPC-proxied URL ending in .upc.elogim.com");
  }
  if (!options.fallbackUrl && options.url === DEFAULT_URL) {
    options.fallbackUrl = DEFAULT_FALLBACK_URL;
  }
  if (options.fallbackUrl) {
    const fallbackUrl = new URL(options.fallbackUrl);
    if (fallbackUrl.protocol !== "https:" || !fallbackUrl.hostname.endsWith("elsevier.es")) {
      throw new Error("The fallback URL must be an HTTPS URL on Elsevier's official elsevier.es domain");
    }
  }

  return options;
}

async function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported browser path.
    }
  }
  return null;
}

async function findBrowserExecutable() {
  if (process.env.UPC_BROWSER_PATH) {
    const configuredPath = path.resolve(process.env.UPC_BROWSER_PATH);
    await access(configuredPath);
    return configuredPath;
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? "";
    return firstExistingPath([
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
    ]);
  }

  if (process.platform === "darwin") {
    return firstExistingPath([
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ]);
  }

  return firstExistingPath([
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]);
}

function articleIdentifier(articleUrl) {
  const match = new URL(articleUrl).pathname.match(/\/pii\/([^/?#]+)/i);
  return (match?.[1] ?? "sciencedirect-article").replace(/[^a-z0-9._-]/gi, "_");
}

async function availableOutputPath(directory, basename) {
  const initialPath = path.join(directory, `${basename}.pdf`);
  try {
    await access(initialPath);
  } catch {
    return initialPath;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = path.join(directory, `${basename}-${suffix}.pdf`);
    try {
      await access(candidate);
    } catch {
      return candidate;
    }
  }
}

function looksLikePdf(body, contentType) {
  return contentType.toLowerCase().includes("application/pdf") ||
    body.subarray(0, 5).toString("ascii") === "%PDF-";
}

function safeEndpoint(rawUrl) {
  try {
    const parsedUrl = new URL(rawUrl);
    return `${parsedUrl.hostname}${parsedUrl.pathname}`;
  } catch {
    return "unknown endpoint";
  }
}

async function saveAuthenticatedPdf(context, page, pdfUrl, outputPath) {
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const response = await context.request.get(pdfUrl, {
    headers: {
      Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
      Referer: page.url(),
      "User-Agent": userAgent,
    },
    timeout: 120_000,
  });
  const body = Buffer.from(await response.body());
  const contentType = response.headers()["content-type"] ?? "";

  if (!response.ok() || !looksLikePdf(body, contentType)) {
    return {
      saved: false,
      diagnostic: `HTTP ${response.status()} (${contentType || "no content type"}) from ${safeEndpoint(response.url())}`,
    };
  }

  await writeFile(outputPath, body);
  return { saved: true };
}

async function saveOpenAccessPdf(pdfUrl, outputPath) {
  const response = await fetch(pdfUrl, {
    redirect: "follow",
    headers: {
      Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 UPC-ScienceDirect-Downloader/1.0",
    },
  });
  const body = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !looksLikePdf(body, contentType)) {
    console.log(
      `The official fallback was not a PDF: HTTP ${response.status} (${contentType || "no content type"}) from ${safeEndpoint(response.url)}.`,
    );
    return false;
  }
  await writeFile(outputPath, body);
  return true;
}

function createPdfCapture(context, outputPath, timeoutMilliseconds = 45_000) {
  let settled = false;
  let captured = false;
  let resolveCapture;
  const pageHandlers = new Map();

  const promise = new Promise((resolve) => {
    resolveCapture = resolve;
  });

  const detach = () => {
    clearTimeout(timer);
    context.removeListener("page", attachPage);
    context.removeListener("response", onResponse);
    for (const [page, handler] of pageHandlers) {
      page.removeListener("download", handler);
    }
    pageHandlers.clear();
  };

  const finish = (didCapture) => {
    if (settled) {
      return;
    }
    settled = true;
    captured = didCapture;
    detach();
    resolveCapture(didCapture);
  };

  const onDownload = async (download) => {
    if (settled) {
      return;
    }
    try {
      await download.saveAs(outputPath);
      finish(true);
    } catch {
      // A matching response may still provide the PDF body.
    }
  };

  function attachPage(page) {
    if (pageHandlers.has(page)) {
      return;
    }
    const handler = (download) => void onDownload(download);
    pageHandlers.set(page, handler);
    page.on("download", handler);
  }

  const onResponse = async (response) => {
    if (settled) {
      return;
    }
    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.toLowerCase().includes("application/pdf") &&
        !/\/pdfft(?:[/?#]|$)|\.pdf(?:[?#]|$)/i.test(response.url())) {
      return;
    }

    try {
      const body = Buffer.from(await response.body());
      if (response.ok() && looksLikePdf(body, contentType)) {
        await writeFile(outputPath, body);
        finish(true);
      }
    } catch {
      // A browser download event may still provide the same response.
    }
  };

  for (const page of context.pages()) {
    attachPage(page);
  }
  context.on("page", attachPage);
  context.on("response", onResponse);

  const timer = setTimeout(() => finish(false), timeoutMilliseconds);

  return {
    promise,
    cancel: () => finish(false),
    get captured() {
      return captured;
    },
  };
}

async function waitForCapture(capture, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!capture.captured && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return capture.captured;
}

async function downloadThroughBrowser(context, sourcePage, pdfUrl, capture) {
  const navigationPage = await context.newPage();

  await navigationPage.goto(pdfUrl, {
    referer: sourcePage.url(),
    waitUntil: "commit",
    timeout: 45_000,
  }).catch(() => null);
  if (await waitForCapture(capture, 5_000)) {
    return true;
  }

  const interstitialControl = navigationPage
    .getByRole("link", { name: /(?:continue|download|view|open).*(?:pdf|article)|(?:pdf|article).*(?:continue|download|view|open)/i })
    .or(navigationPage.getByRole("button", {
      name: /(?:continue|download|view|open).*(?:pdf|article)|(?:pdf|article).*(?:continue|download|view|open)/i,
    }))
    .first();
  if ((await interstitialControl.count()) > 0 &&
      (await interstitialControl.isVisible().catch(() => false))) {
    await interstitialControl.click({ timeout: 15_000 }).catch(() => null);
    if (await waitForCapture(capture, 10_000)) {
      return true;
    }
  }

  const title = (await navigationPage.title().catch(() => "untitled page"))
    .replace(/\s+/g, " ")
    .slice(0, 100);
  console.log(`Browser fallback stopped at ${safeEndpoint(navigationPage.url())} (${title}).`);
  console.log("If that tab shows a Continue or Download prompt, click it; PDF capture remains active.");
  await navigationPage.bringToFront().catch(() => {});
  return false;
}

async function clickAndCapturePdf(control, capture) {
  const details = await control.evaluate((element) => ({
    tag: element.tagName.toLowerCase(),
    label: (element.getAttribute("aria-label") || element.textContent || "unlabelled control")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100),
    target: element.getAttribute("target") || "same tab",
  })).catch(() => ({ tag: "unknown", label: "unknown control", target: "unknown" }));
  console.log(`Clicking PDF control: <${details.tag}> "${details.label}" (${details.target}).`);

  try {
    await control.click({ timeout: 15_000 });
  } catch (error) {
    console.log(`Normal click was blocked: ${error.message.split("\n")[0]}. Retrying with a forced browser click...`);
    const forced = await control.click({ force: true, timeout: 15_000 })
      .then(() => true)
      .catch((forcedError) => {
        console.log(`Forced click failed: ${forcedError.message.split("\n")[0]}.`);
        return false;
      });
    if (!forced) {
      return false;
    }
  }
  return waitForCapture(capture, 10_000);
}

async function locatePdfControl(context) {
  const pages = context.pages().filter((page) => !page.isClosed());

  for (const page of pages.reverse()) {
    for (const selector of PDF_SELECTORS) {
      const control = page.locator(selector).first();
      if ((await control.count()) > 0 && (await control.isVisible().catch(() => false))) {
        return { control, page };
      }
    }

    const namedControl = page
      .getByRole("link", { name: /(?:download|view) pdf/i })
      .or(page.getByRole("button", { name: /(?:download|view) pdf/i }))
      .first();
    if ((await namedControl.count()) > 0 && (await namedControl.isVisible().catch(() => false))) {
      return { control: namedControl, page };
    }
  }

  return null;
}

async function waitForAndDownload(context, options, outputPath) {
  const deadline = Date.now() + options.timeoutMinutes * 60_000;
  const capture = createPdfCapture(context, outputPath, options.timeoutMinutes * 60_000);
  const attemptedUrls = new Set();
  const clickedControlsByPage = new WeakMap();
  const maximumAutomaticClicks = 3;
  let automaticClicks = 0;
  let lastStatusAt = 0;

  try {
    while (Date.now() < deadline) {
      if (capture.captured) {
        return;
      }
      const pages = context.pages().filter((page) => !page.isClosed());

      for (const page of pages) {
        const currentUrl = page.url();
        if (/\/pdfft(?:[/?#]|$)|\.pdf(?:[?#]|$)/i.test(currentUrl) && !attemptedUrls.has(currentUrl)) {
          attemptedUrls.add(currentUrl);
          const directResult = await saveAuthenticatedPdf(context, page, currentUrl, outputPath)
            .catch(() => ({ saved: false }));
          if (directResult.saved) {
            return;
          }
          if (await downloadThroughBrowser(context, page, currentUrl, capture)) {
            return;
          }
        }
      }

      const located = await locatePdfControl(context);
      if (located) {
        const { control, page } = located;
        const href = await control.getAttribute("href").catch(() => null);

        if (href) {
          const pdfUrl = new URL(href, page.url()).href;
          if (!attemptedUrls.has(pdfUrl)) {
            attemptedUrls.add(pdfUrl);
            console.log("Authenticated article detected. Downloading its PDF...");
            const directResult = await saveAuthenticatedPdf(context, page, pdfUrl, outputPath)
              .catch((error) => ({ saved: false, diagnostic: error.message }));
            if (directResult.saved) {
              return;
            }
            console.log(`The direct request was not a PDF: ${directResult.diagnostic ?? "request failed"}.`);
            console.log("Retrying through an authenticated browser tab...");
            if (await downloadThroughBrowser(context, page, pdfUrl, capture)) {
              return;
            }
            console.log("Browser navigation did not yield a PDF; trying the page's download control...");
          }
        }

        const controlKey = href ?? "button";
        const clickedControls = clickedControlsByPage.get(page) ?? new Set();
        clickedControlsByPage.set(page, clickedControls);
        if (!clickedControls.has(controlKey) && automaticClicks < maximumAutomaticClicks) {
          clickedControls.add(controlKey);
          automaticClicks += 1;
          if (await clickAndCapturePdf(control, capture)) {
            return;
          }
        }
      }

      if (Date.now() - lastStatusAt >= 15_000) {
        const activePage = pages.at(-1);
        const hostname = activePage ? new URL(activePage.url()).hostname : "no open page";
        console.log(`Waiting for UPC authentication and article access (${hostname})...`);
        lastStatusAt = Date.now();
      }

      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  } finally {
    capture.cancel();
  }

  throw new Error(
    `Timed out after ${options.timeoutMinutes} minutes. Complete the UPC login and leave the article page open.`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await mkdir(options.output, { recursive: true });
  const outputPath = await availableOutputPath(options.output, articleIdentifier(options.url));
  if (options.fallbackUrl) {
    console.log("Trying the official Elsevier open-access PDF endpoint...");
    if (await saveOpenAccessPdf(options.fallbackUrl, outputPath).catch((error) => {
      console.log(`The official fallback request failed: ${error.message}`);
      return false;
    })) {
      console.log(`PDF saved to: ${outputPath}`);
      return;
    }
    console.log("Falling back to interactive UPC authentication...");
  }

  const browserExecutable = await findBrowserExecutable();
  if (!browserExecutable) {
    throw new Error(
      "Microsoft Edge or Google Chrome was not found. Set UPC_BROWSER_PATH to a Chromium-based browser executable.",
    );
  }

  const profileDirectory = process.env.UPC_RESUME_TEMP_PROFILE
    ? path.resolve(process.env.UPC_RESUME_TEMP_PROFILE)
    : await mkdtemp(path.join(os.tmpdir(), "upc-sciencedirect-"));
  const resolvedTempDirectory = path.resolve(os.tmpdir());
  if (!profileDirectory.startsWith(`${resolvedTempDirectory}${path.sep}`) ||
      !path.basename(profileDirectory).startsWith("upc-sciencedirect-")) {
    throw new Error("UPC_RESUME_TEMP_PROFILE must identify a downloader profile inside the temporary directory");
  }
  let context;
  let cleanedUp = false;
  let shuttingDown = false;

  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    await context?.close().catch(() => {});
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  };
  const handleSignal = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log("\nClosing the temporary browser session...");
    void cleanup().finally(() => process.exit(130));
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  try {
    context = await chromium.launchPersistentContext(profileDirectory, {
      executablePath: browserExecutable,
      headless: false,
      acceptDownloads: true,
      viewport: null,
      args: ["--start-maximized", "--disable-pdf-extension"],
    });
    const page = context.pages()[0] ?? (await context.newPage());

    console.log("A browser window is opening.");
    console.log("Enter your credentials only on the official UPC login page.");
    console.log("The PDF will download automatically after the article becomes available.");

    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch((error) => {
      console.log(`Initial navigation is still pending: ${error.message}`);
    });
    await waitForAndDownload(context, options, outputPath);

    console.log(`PDF saved to: ${outputPath}`);
  } finally {
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
    await cleanup();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
