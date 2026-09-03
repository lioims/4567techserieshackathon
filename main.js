// SaveWiser - Electron main process
//
// Responsibilities:
//   1. Create the frameless, translucent (Liquid Glass) BrowserWindow.
//   2. Run the Python deal scraper (scraper/savewiser_deal_scraper.py) as a
//      child process and hand its JSON output back to the renderer.
//   3. Persist app state (budget categories, expense logs, announcement
//      subscriptions, the mock Singpass session) to a small JSON file in
//      the user's app-data directory, via a couple of IPC calls.
//
// Everything the renderer needs from Node/the OS goes through preload.js's
// contextBridge -- the renderer itself runs with nodeIntegration disabled.

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");

const isMac = process.platform === "darwin";
const STORE_FILE = () => path.join(app.getPath("userData"), "savewiser-data.json");
const SCRAPER_DIR = path.join(__dirname, "scraper");
const SCRAPER_SCRIPT = path.join(SCRAPER_DIR, "savewiser_deal_scraper.py");

let mainWindow;

// ----------------------------------------------------------------------------
// Local JSON "database" -- deliberately just a file. This is a hackathon-
// scale desktop app; a real backend / secure cloud store (see the project's
// architecture diagram) is out of scope for this build.
// ----------------------------------------------------------------------------

const DEFAULT_STATE = {
  singpass: { loggedIn: false, name: "", nric: "" },
  subscriptions: {}, // { [announcementId]: true }
  recentActivity: [],
  budgetCategories: [], // [{ id, name, monthlyCap: number|null, icon, isCustom }]
  expenseLogs: [],       // [{ date: "2026-09-02", amount: 12, categoryId: "groceries", note: "" }]
};

function readState() {
  try {
    const raw = fs.readFileSync(STORE_FILE(), "utf-8");
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STORE_FILE()), { recursive: true });
  fs.writeFileSync(STORE_FILE(), JSON.stringify(state, null, 2), "utf-8");
  return state;
}

// ----------------------------------------------------------------------------
// Scraper bridge
// ----------------------------------------------------------------------------

function findPython() {
  // Prefer python3 (present on macOS/Linux by default); fall back to
  // "python" for the occasional Windows box that only has that on PATH.
  return process.platform === "win32" ? "python" : "python3";
}

function runScraper({ demo = true, minScore = 2, minScoreSuper = 2, minScoreAmenities = 2 } = {}) {
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "savewiser-"));
    const outGov = path.join(tmpDir, "gov.json");
    const outSuper = path.join(tmpDir, "supermarket.json");
    const outAmenities = path.join(tmpDir, "amenities.json");

    const args = [
      SCRAPER_SCRIPT,
      demo ? "--demo" : null,
      "--out", outGov,
      "--out-super", outSuper,
      "--out-amenities", outAmenities,
      "--min-score", String(minScore),
      "--min-score-super", String(minScoreSuper),
      "--min-score-amenities", String(minScoreAmenities),
    ].filter(Boolean);

    execFile(findPython(), args, { cwd: SCRAPER_DIR, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Scraper failed: ${err.message}\n${stderr || ""}`));
        return;
      }
      try {
        const government = JSON.parse(fs.readFileSync(outGov, "utf-8"));
        const supermarket = JSON.parse(fs.readFileSync(outSuper, "utf-8"));
        const amenities = JSON.parse(fs.readFileSync(outAmenities, "utf-8"));
        resolve({ government, supermarket, amenities, log: stdout });
      } catch (parseErr) {
        reject(new Error(`Scraper ran but output could not be read: ${parseErr.message}`));
      } finally {
        fs.rm(tmpDir, { recursive: true, force: true }, () => {});
      }
    });
  });
}

// ----------------------------------------------------------------------------
// Window
// ----------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 430,
    height: 900,
    minWidth: 380,
    minHeight: 640,
    // True OS-level vibrancy (the desktop blurring through the window) is
    // only reliable on macOS, which is also the platform this whole design
    // is aimed at ("blend in seamlessly with iPhone"). Elsewhere the window
    // stays opaque and the Liquid Glass look comes purely from CSS
    // backdrop-filter blur on panels over the app's own gradient background
    // -- still a real frosted-glass effect, just not blurring the desktop.
    backgroundColor: isMac ? "#00000000" : "#EAF3FC",
    transparent: isMac,
    vibrancy: isMac ? "sidebar" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    frame: !isMac,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Open real links (e.g. a deal's source URL) in the OS browser, not inside
  // the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});

// ----------------------------------------------------------------------------
// IPC
// ----------------------------------------------------------------------------

ipcMain.handle("scraper:run", async (_event, options) => {
  return runScraper(options || {});
});

ipcMain.handle("store:getAll", () => readState());

ipcMain.handle("store:patch", (_event, patch) => {
  const state = readState();
  const next = { ...state, ...patch };
  return writeState(next);
});

ipcMain.handle("store:appendExpenseLog", (_event, entry) => {
  const state = readState();
  state.expenseLogs = [...(state.expenseLogs || []), entry];
  return writeState(state);
});

ipcMain.handle("store:toggleSubscription", (_event, { announcementId, subscribed }) => {
  const state = readState();
  state.subscriptions[announcementId] = subscribed;
  return writeState(state);
});

ipcMain.handle("store:pushActivity", (_event, entry) => {
  const state = readState();
  state.recentActivity = [entry, ...state.recentActivity].slice(0, 20);
  return writeState(state);
});

ipcMain.handle("store:setSingpass", (_event, singpass) => {
  const state = readState();
  state.singpass = singpass;
  return writeState(state);
});

ipcMain.handle("app:openExternal", (_event, url) => {
  shell.openExternal(url);
});
