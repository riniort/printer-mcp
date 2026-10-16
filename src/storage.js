import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dataDir = path.resolve(import.meta.dirname, "..", "data");
const settingsFile = path.join(dataDir, "settings.json");
const historyFile = path.join(dataDir, "history.json");

const DEFAULT_SETTINGS = {
  printerAliases: {},
  pathAliases: {},
  profiles: {
    invoice: { copies: 1, monochrome: false, duplex: "simplex" },
    draft: { copies: 1, monochrome: true, duplex: "duplex-long-edge" },
  },
  duplicateWindowMinutes: 5,
  safetyThreshold: 20,
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return structuredClone(fallback);
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, file);
}

export async function ensureStorage() {
  await fs.mkdir(dataDir, { recursive: true });
  try { await fs.access(settingsFile); } catch { await writeJson(settingsFile, DEFAULT_SETTINGS); }
  try { await fs.access(historyFile); } catch { await writeJson(historyFile, []); }
  return { dataDir, settingsFile, historyFile };
}

export async function readSettings() {
  await ensureStorage();
  const stored = await readJson(settingsFile, DEFAULT_SETTINGS);
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...stored,
    printerAliases: stored.printerAliases ?? structuredClone(DEFAULT_SETTINGS.printerAliases),
    pathAliases: stored.pathAliases ?? structuredClone(DEFAULT_SETTINGS.pathAliases),
    profiles: stored.profiles ?? structuredClone(DEFAULT_SETTINGS.profiles),
  };
}

export async function updateSettings(updater) {
  const settings = await readSettings();
  const updated = await updater(settings) ?? settings;
  await writeJson(settingsFile, updated);
  return updated;
}

export async function removePrintSetting(kind, name) {
  const bucketByKind = {
    printer_alias: "printerAliases",
    path_alias: "pathAliases",
    profile: "profiles",
  };
  const bucket = bucketByKind[kind];
  if (!bucket) throw new Error(`Unsupported setting kind: ${kind}`);
  let removed = false;
  let matchedName = null;
  const settings = await updateSettings((current) => {
    matchedName = Object.keys(current[bucket] ?? {}).find((key) => key.toLowerCase() === name.toLowerCase()) ?? null;
    if (matchedName) {
      delete current[bucket][matchedName];
      removed = true;
    }
    return current;
  });
  return { removed, kind, name: matchedName ?? name, settings };
}

export async function readHistory(limit = 50) {
  await ensureStorage();
  const history = await readJson(historyFile, []);
  return history.slice(0, limit);
}

export async function findHistory(id) {
  const history = await readHistory(500);
  return history.find((entry) => entry.id === id) ?? null;
}

export async function addHistory(entry) {
  await ensureStorage();
  const history = await readJson(historyFile, []);
  const saved = { id: randomUUID(), createdAt: new Date().toISOString(), ...entry };
  history.unshift(saved);
  await writeJson(historyFile, history.slice(0, 500));
  return saved;
}

export async function fileSignature(file) {
  const stat = await fs.stat(file);
  return `${path.resolve(file).toLocaleLowerCase()}|${stat.size}|${stat.mtimeMs}`;
}

export async function recentDuplicates(files, windowMinutes) {
  const cutoff = Date.now() - windowMinutes * 60_000;
  const history = await readHistory(500);
  const recentSignatures = new Map();
  for (const entry of history) {
    if (Date.parse(entry.createdAt) < cutoff) continue;
    for (const item of entry.signatures ?? []) recentSignatures.set(item.signature, entry);
  }
  const duplicates = [];
  for (const file of files) {
    const signature = await fileSignature(file);
    const entry = recentSignatures.get(signature);
    if (entry) duplicates.push({ file, previousJobId: entry.id, previousPrintedAt: entry.createdAt });
  }
  return duplicates;
}

export { dataDir, settingsFile, historyFile };
