import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const DEFAULT_URL =
  "https://sciencedirect.upc.elogim.com/science/article/pii/S0716864025000471";
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
  --output <directory>       Download directory (default: ./downloads)
  --timeout-minutes <number> Time allowed for interactive login (default: 15)
  --help                     Show this help

Credentials are entered only in the visible UPC login page. This script never
asks for, reads, prints, or saves your username or password.`);
}

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
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
    return false;
  }

  await writeFile(outputPath, body);
  return true;
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
  const attemptedUrls = new Set();
  const clickedControls = new Set();
  let lastStatusAt = 0;

  while (Date.now() < deadline) {
    const pages = context.pages().filter((page) => !page.isClosed());

    for (const page of pages) {
      const currentUrl = page.url();
      if (/\/pdfft(?:[/?#]|$)|\.pdf(?:[?#]|$)/i.test(currentUrl) && !attemptedUrls.has(currentUrl)) {
        attemptedUrls.add(currentUrl);
        if (await saveAuthenticatedPdf(context, page, currentUrl, outputPath).catch(() => false)) {
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
          if (await saveAuthenticatedPdf(context, page, pdfUrl, outputPath).catch(() => false)) {
            return;
          }
          console.log("The direct PDF request was not accepted; trying the page's download control...");
        }
      }

      const controlKey = `${page.url()}::${href ?? "button"}`;
      if (!clickedControls.has(controlKey)) {
        clickedControls.add(controlKey);
        const downloadPromise = page.waitForEvent("download", { timeout: 60_000 }).catch(() => null);
        await control.click({ timeout: 30_000 }).catch(() => null);
        const download = await downloadPromise;
        if (download) {
          await download.saveAs(outputPath);
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

  const browserExecutable = await findBrowserExecutable();
  if (!browserExecutable) {
    throw new Error(
      "Microsoft Edge or Google Chrome was not found. Set UPC_BROWSER_PATH to a Chromium-based browser executable.",
    );
  }

  await mkdir(options.output, { recursive: true });
  const outputPath = await availableOutputPath(options.output, articleIdentifier(options.url));
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), "upc-sciencedirect-"));
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
      args: ["--start-maximized"],
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
