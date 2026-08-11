const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function copyIfExists(srcName, destDir) {
  const src = path.join(DATA_DIR, srcName);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return null;
  const dest = path.join(destDir, srcName);
  fs.copyFileSync(src, dest);
  return dest;
}

function pruneOldBackups(keep = 14) {
  const entries = fs
    .readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
  entries.slice(Math.max(0, keep)).forEach((name) => {
    const full = path.join(BACKUP_DIR, name);
    fs.rmSync(full, { recursive: true, force: true });
  });
}

function runBackup({ keep = 14 } = {}) {
  ensureDirs();
  const dir = path.join(BACKUP_DIR, stamp());
  fs.mkdirSync(dir, { recursive: true });
  const files = ["cms.json", "shop-orders.json", "availability-leads.json", "orders.json"];
  const copied = files.map((name) => copyIfExists(name, dir)).filter(Boolean);
  pruneOldBackups(keep);
  return { ok: true, dir, files: copied.map((f) => path.basename(f)) };
}

function startBackupScheduler() {
  const hours = Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS || 24));
  const keep = Math.max(3, Number(process.env.BACKUP_KEEP || 14));
  // First backup shortly after boot, then on interval
  setTimeout(() => {
    try {
      runBackup({ keep });
    } catch (error) {
      console.error("Backup failed:", error.message);
    }
  }, 15_000);
  setInterval(() => {
    try {
      runBackup({ keep });
    } catch (error) {
      console.error("Backup failed:", error.message);
    }
  }, hours * 3600 * 1000).unref?.();
}

module.exports = {
  runBackup,
  startBackupScheduler,
  BACKUP_DIR
};
