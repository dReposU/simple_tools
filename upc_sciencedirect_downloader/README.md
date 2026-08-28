# UPC ScienceDirect downloader

This tool first tries a known official Elsevier open-access PDF endpoint. When no such endpoint is configured or it fails, the tool opens the UPC-proxied ScienceDirect article in a visible local browser. You complete the UPC or Microsoft sign-in directly in that browser; after ScienceDirect exposes the article, the tool downloads the PDF with the authenticated session.

The script does **not** ask for, inspect, print, or save your username or password. Its browser profile is created in the operating system's temporary directory and deleted when the run ends. Downloaded PDFs and local dependencies are excluded from Git.

## Setup

Requirements: Node.js 18 or newer, plus Microsoft Edge or Google Chrome.

```powershell
cd upc_sciencedirect_downloader
npm.cmd install
```

## Download the configured article

```powershell
npm.cmd start
```

Complete any UPC, Microsoft, or multifactor-authentication prompts in the browser window. Leave the resulting ScienceDirect article page open. The browser closes after the PDF is saved under `downloads/`.

## Download another UPC-proxied ScienceDirect article

```powershell
npm.cmd start -- --url "https://sciencedirect.upc.elogim.com/science/article/pii/ARTICLE_ID"
```

Optional arguments:

```text
--output <directory>       Choose the download directory
--fallback-url <url>       Try an official elsevier.es PDF URL before UPC login
--timeout-minutes <number> Change the 15-minute login timeout
--help                     Show command help
```

If Edge or Chrome is installed in a nonstandard location, set `UPC_BROWSER_PATH` to the browser executable before starting the script.

Only download material your UPC account is authorized to access, and use it subject to UPC and publisher terms.
