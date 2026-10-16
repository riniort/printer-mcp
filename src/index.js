#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { parseQuickCommand } from "./quick-command.js";
import {
  addHistory,
  ensureStorage,
  fileSignature,
  findHistory,
  readHistory,
  readSettings,
  recentDuplicates,
  removePrintSetting,
  updateSettings,
} from "./storage.js";

const require = createRequire(import.meta.url);
const pdfPrinter = require("pdf-to-printer");
const execFileAsync = promisify(execFile);

const PDF_EXTENSIONS = new Set([".pdf"]);
const OFFICE_EXTENSIONS = new Set([
  ".doc", ".docx", ".docm", ".rtf",
  ".xls", ".xlsx", ".xlsm", ".csv",
  ".ppt", ".pptx", ".pptm",
]);
const IMAGE_EXTENSIONS = new Set([".bmp", ".gif", ".jpg", ".jpeg", ".png", ".tif", ".tiff"]);
const TEXT_EXTENSIONS = new Set([".txt", ".log"]);
const DEFAULT_EXTENSIONS = [...PDF_EXTENSIONS, ...OFFICE_EXTENSIONS, ...IMAGE_EXTENSIONS, ...TEXT_EXTENSIONS];
const PRINT_SCRIPT = path.join(import.meta.dirname, "printers.ps1");
const HELP_TERMS = new Set([
  "", "?", "help", "-h", "--help", "how to use", "usage",
  "ใช้ยังไง", "ใช้งานยังไง", "ใช้งายยังไง", "ใช้ยังไงบ้าง", "วิธีใช้", "ช่วยเหลือ",
]);
const STOP_TERMS = new Set([
  "stop", "stop all", "cancel all", "หยุด", "หยุดพิมพ์", "หยุดการพิมพ์", "หยุดการพิมพ์ทั้งหมด",
]);

const server = new McpServer(
  { name: "windows-printer", version: "1.1.0" },
  {
    instructions:
      "All printing runs in silent mode without opening application windows or print dialogs. Use inspect_print_job or estimate_print_job when the target is ambiguous. Only call print_paths, quick_print, retry_print_job, or cancellation tools after explicit user intent. Quick-print aliases, profiles, duplicate protection, safety thresholds, history, queue cancellation, and health checks are available.",
  },
);

function textResult(text, structuredContent) {
  return { content: [{ type: "text", text }], ...(structuredContent ? { structuredContent } : {}) };
}

function errorResult(message, details) {
  return { isError: true, content: [{ type: "text", text: message }], ...(details ? { structuredContent: details } : {}) };
}

function promptMessage(text, description) {
  return { description, messages: [{ role: "user", content: { type: "text", text } }] };
}

function quickHelpPrompt() {
  return promptMessage([
    "The user requested Quick Print help, not a physical print action. Do not call any printing tool.",
    "Explain this usage clearly in Thai:",
    "",
    "/print <path> [options]",
    "Examples:",
    "/print D:\\Invoices\\invoice.pdf",
    "/print D:\\Invoices\\batch1 --copies 2 --bw",
    "/print @tts-creator --pdf --recursive",
    "/print D:\\Invoices --name \"TTSTHAC*\" --exclude \"Expense*\"",
    "/print D:\\Invoices --newer-than 2026-10-01 --preview",
    "",
    "Options: --copies N, --printer NAME_OR_ALIAS, --profile NAME, --pages 1-3,5, --bw, --color, --duplex long|short|off, --orientation portrait|landscape, --recursive, --pdf, --name GLOB, --exclude GLOB, --newer-than YYYY-MM-DD, --preview, --force.",
    "Defaults: Windows default printer, one copy, all supported files in the selected folder, no subfolders.",
    "Useful commands: /print stop (cancel every queued job on every printer), /queue, /cancel <job-id|all>, /retry <history-id>, /print-check.",
    "Help aliases: /print how to use, /print help, /print ?, /print ใช้งายยังไง.",
  ].join("\n"), "Printer MCP quick-print help");
}

server.registerPrompt(
  "print",
  {
    title: "Quick print",
    description: "Print a file/folder with flags, or show help with '/print how to use' or '/print ใช้งายยังไง'.",
    argsSchema: { path: z.string().optional().describe("Path plus optional flags, or a help phrase.") },
  },
  ({ path: rawCommand }) => {
    const command = rawCommand?.trim() ?? "";
    const normalized = command.toLocaleLowerCase().replace(/\s+/g, " ");
    if (HELP_TERMS.has(normalized)) return quickHelpPrompt();
    if (STOP_TERMS.has(normalized)) {
      return promptMessage([
        "This slash command is an explicit request to stop all printing.",
        "Call the printer MCP tool stop_all_printing now with confirmed=true.",
        "Do not ask for another confirmation. Report the printers and queued jobs that were cancelled.",
        "Explain that a page already transferred to or physically printing on the device may not stop in time.",
      ].join("\n"), "Stop all printing");
    }
    return promptMessage([
      "This slash command is an explicit request to physically print unless it contains --preview.",
      "Call the printer MCP tool quick_print now with:",
      `- command: ${JSON.stringify(command)}`,
      "- confirmed: true",
      "Do not ask for another confirmation. Return the job ID and a concise result.",
    ].join("\n"), `Quick print: ${command}`);
  },
);

server.registerPrompt(
  "queue",
  { title: "Print queue", description: "Show the current Windows print queue.", argsSchema: { printer: z.string().optional() } },
  ({ printer }) => promptMessage(
    `Show the print queue using get_print_queue${printer ? ` with printer ${JSON.stringify(printer)}` : " for the default printer"}. Do not modify any jobs.`,
    "Show print queue",
  ),
);

server.registerPrompt(
  "cancel",
  { title: "Cancel print jobs", description: "Cancel a queued print job by ID, or all jobs.", argsSchema: { job: z.string().min(1) } },
  ({ job }) => promptMessage([
    "This slash command is an explicit request to cancel queued print jobs.",
    job.toLowerCase() === "all"
      ? "Call cancel_print_jobs with all_jobs=true and confirmed=true."
      : `Call cancel_print_jobs with job_ids=[${JSON.stringify(Number.parseInt(job, 10))}] and confirmed=true.`,
    "Use the default printer unless the user specified another printer.",
  ].join("\n"), `Cancel print job: ${job}`),
);

server.registerPrompt(
  "retry",
  { title: "Retry print job", description: "Retry a previous Printer MCP history job.", argsSchema: { history_id: z.string().min(1) } },
  ({ history_id }) => promptMessage(
    `This is an explicit print request. Call retry_print_job with history_id=${JSON.stringify(history_id)} and confirmed=true.`,
    `Retry print job ${history_id}`,
  ),
);

server.registerPrompt(
  "print-check",
  { title: "Printer health check", description: "Check Printer MCP, Windows printers, dependencies, and optional paths.", argsSchema: { path: z.string().optional() } },
  ({ path: checkPath }) => promptMessage(
    `Call printer_health_check${checkPath ? ` with paths=[${JSON.stringify(checkPath)}]` : " with no paths"}. This is read-only and must not print.`,
    "Printer health check",
  ),
);

function normalizeExtensions(extensions) {
  const values = extensions?.length ? extensions : DEFAULT_EXTENSIONS;
  return new Set(values.map((value) => {
    const lowered = value.trim().toLowerCase();
    return lowered.startsWith(".") ? lowered : `.${lowered}`;
  }));
}

function wildcardRegex(pattern) {
  if (!pattern) return null;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function classify(file) {
  const ext = path.extname(file).toLowerCase();
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  if (OFFICE_EXTENSIONS.has(ext)) return "office";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  return "other";
}

function findCaseInsensitive(record, key) {
  if (!key) return undefined;
  const matched = Object.keys(record ?? {}).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return matched ? record[matched] : undefined;
}

function expandPathAlias(input, settings) {
  if (!input.startsWith("@")) return input;
  const match = /^@([^\\/]+)(.*)$/.exec(input);
  if (!match) return input;
  const base = findCaseInsensitive(settings.pathAliases, match[1]);
  if (!base) throw new Error(`Unknown path alias '@${match[1]}'.`);
  const suffix = match[2].replace(/^[\\/]+/, "");
  return suffix ? path.join(base, suffix) : base;
}

async function resolveFiles(inputPaths, options = {}) {
  const {
    recursive = false, extensions, maxFiles = 500,
    namePattern, excludePattern, newerThan,
  } = options;
  const allowed = normalizeExtensions(extensions);
  const includeRegex = wildcardRegex(namePattern);
  const excludeRegex = wildcardRegex(excludePattern);
  const newerTimestamp = newerThan ? Date.parse(newerThan) : null;
  if (newerThan && Number.isNaN(newerTimestamp)) throw new Error(`Invalid newer_than date: ${newerThan}`);
  const files = [];
  const missing = [];
  const unsupported = [];

  async function eligible(file, stat) {
    const name = path.basename(file);
    if (!allowed.has(path.extname(file).toLowerCase())) return false;
    if (includeRegex && !includeRegex.test(name)) return false;
    if (excludeRegex && excludeRegex.test(name)) return false;
    if (newerTimestamp !== null && stat.mtimeMs <= newerTimestamp) return false;
    return true;
  }

  async function addPath(candidate) {
    let stat;
    try { stat = await fs.stat(candidate); } catch { missing.push(candidate); return; }
    if (stat.isFile()) {
      if (await eligible(candidate, stat)) files.push(path.resolve(candidate));
      else if (!allowed.has(path.extname(candidate).toLowerCase())) unsupported.push(candidate);
      return;
    }
    if (!stat.isDirectory()) { unsupported.push(candidate); return; }
    const entries = await fs.readdir(candidate, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const child = path.join(candidate, entry.name);
      if (entry.isFile()) {
        const childStat = await fs.stat(child);
        if (await eligible(child, childStat)) files.push(path.resolve(child));
      } else if (entry.isDirectory() && recursive) {
        await addPath(child);
      }
    }
  }

  for (const candidate of inputPaths) {
    if (files.length >= maxFiles) break;
    await addPath(path.resolve(candidate));
  }
  return { files: [...new Set(files)].slice(0, maxFiles), missing, unsupported, truncated: files.length >= maxFiles };
}

async function runPowerShell(args = [], timeout = 120000) {
  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PRINT_SCRIPT, ...args],
    { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 },
  );
  if (stderr?.trim()) process.stderr.write(stderr);
  return stdout.trim();
}

async function listWindowsPrinters() {
  const output = await runPowerShell(["-Mode", "list"]);
  const parsed = output ? JSON.parse(output) : [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function selectPrinter(requestedPrinter, settings) {
  const aliasTarget = findCaseInsensitive(settings.printerAliases, requestedPrinter);
  const requested = aliasTarget ?? requestedPrinter;
  const printers = await listWindowsPrinters();
  const selected = requested
    ? printers.find((item) => item.name.toLowerCase() === requested.toLowerCase())
    : printers.find((item) => item.isDefault);
  return { selected, printers, aliasUsed: aliasTarget ? requestedPrinter : null };
}

function countSelectedPages(spec, totalPages) {
  if (!spec) return totalPages;
  const pages = new Set();
  for (const part of spec.split(",")) {
    const [startRaw, endRaw] = part.trim().split("-");
    const start = Number.parseInt(startRaw, 10);
    const end = endRaw ? Number.parseInt(endRaw, 10) : start;
    for (let pageNumber = start; pageNumber <= end && pageNumber <= totalPages; pageNumber += 1) {
      if (pageNumber >= 1) pages.add(pageNumber);
    }
  }
  return pages.size;
}

async function estimateFiles(files, options = {}) {
  let pdfPages = 0;
  const pdfDetails = [];
  const unknownPageFiles = [];
  const errors = [];
  for (const file of files) {
    if (classify(file) !== "pdf") { unknownPageFiles.push(file); continue; }
    try {
      const document = await PDFDocument.load(await fs.readFile(file), { ignoreEncryption: true });
      const totalPages = document.getPageCount();
      const selectedPages = countSelectedPages(options.pages, totalPages);
      pdfPages += selectedPages;
      pdfDetails.push({ file, totalPages, selectedPages });
    } catch (error) {
      errors.push({ file, error: error.message });
    }
  }
  const copies = options.copies ?? 1;
  const printedPdfPages = pdfPages * copies;
  const minimumUnknownPages = unknownPageFiles.length * copies;
  const minimumPages = printedPdfPages + minimumUnknownPages;
  const duplex = options.duplex && options.duplex !== "simplex";
  return {
    pdfPages, copies, printedPdfPages, unknownPageFiles, pdfDetails, errors,
    estimatedMinimumPages: minimumPages,
    estimatedMinimumSheets: duplex ? Math.ceil(minimumPages / 2) : minimumPages,
    estimateNote: unknownPageFiles.length
      ? "Non-PDF files are estimated as at least one page each; their actual page count depends on the application."
      : "All selected files are PDFs, so the page estimate is exact unless a PDF could not be read.",
  };
}

function requestSchema() {
  return {
    paths: z.array(z.string().min(1)).min(1).describe("File/folder paths or @path-alias values."),
    recursive: z.boolean().optional().default(false),
    extensions: z.array(z.string().min(1)).optional(),
    max_files: z.number().int().min(1).max(1000).optional().default(500),
    name_pattern: z.string().min(1).optional().describe("Filename glob such as TTSTHAC*.pdf."),
    exclude_pattern: z.string().min(1).optional().describe("Filename glob to exclude."),
    newer_than: z.string().min(1).optional().describe("Only files modified after this ISO date/time."),
  };
}

async function inspectRequest(input) {
  const settings = await readSettings();
  const paths = input.paths.map((item) => expandPathAlias(item, settings));
  const resolved = await resolveFiles(paths, {
    recursive: input.recursive,
    extensions: input.extensions,
    maxFiles: input.max_files,
    namePattern: input.name_pattern,
    excludePattern: input.exclude_pattern,
    newerThan: input.newer_than,
  });
  const byType = Object.create(null);
  for (const file of resolved.files) byType[classify(file)] = (byType[classify(file)] ?? 0) + 1;
  return { settings, paths, resolved, byType };
}

async function performPrint(input) {
  if (input.confirmed !== true) return errorResult("Printing was not confirmed. No files were printed.");
  const settings = await readSettings();
  const profile = input.profile ? findCaseInsensitive(settings.profiles, input.profile) : undefined;
  if (input.profile && !profile) return errorResult(`Unknown print profile '${input.profile}'. No files were printed.`);
  const options = { ...(profile ?? {}), ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) };
  const expandedPaths = options.paths.map((item) => expandPathAlias(item, settings));
  const resolved = await resolveFiles(expandedPaths, {
    recursive: options.recursive,
    extensions: options.extensions,
    maxFiles: options.max_files,
    namePattern: options.name_pattern,
    excludePattern: options.exclude_pattern,
    newerThan: options.newer_than,
  });
  if (resolved.missing.length) return errorResult("One or more requested paths do not exist. No files were printed.", resolved);
  if (!resolved.files.length) return errorResult("No supported printable files were found. No files were printed.", resolved);

  const threshold = options.safety_threshold ?? settings.safetyThreshold;
  if (resolved.files.length > threshold && !options.force) {
    const estimate = await estimateFiles(resolved.files, options);
    return errorResult(
      `Safety threshold reached: ${resolved.files.length} files exceed the limit of ${threshold}. Nothing was printed. Review the estimate and retry with force=true or --force.`,
      { ...resolved, threshold, estimate, requiresForce: true },
    );
  }

  if (!options.force && !options.skip_duplicate_check) {
    const duplicates = await recentDuplicates(resolved.files, settings.duplicateWindowMinutes);
    if (duplicates.length) {
      return errorResult(
        `${duplicates.length} file(s) were printed within the last ${settings.duplicateWindowMinutes} minutes. Nothing was printed. Retry with force=true or --force if intentional.`,
        { duplicates, requiresForce: true },
      );
    }
  }

  const { selected, printers, aliasUsed } = await selectPrinter(options.printer, settings);
  if (!selected) {
    return errorResult(
      options.printer ? `Printer or alias '${options.printer}' was not found.` : "No default Windows printer is configured.",
      { availablePrinters: printers.map((item) => item.name), printerAliases: settings.printerAliases },
    );
  }
  if (selected.isOffline) return errorResult(`Printer '${selected.name}' is offline. No files were printed.`);

  const copies = options.copies ?? 1;
  const duplex = options.duplex ?? "simplex";
  const submitted = [];
  const failed = [];
  for (const file of resolved.files) {
    try {
      if (classify(file) === "pdf") {
        await pdfPrinter.print(file, {
          printer: selected.name,
          copies,
          monochrome: options.monochrome ?? false,
          side: duplex === "duplex-long-edge" ? "duplexlong" : duplex === "duplex-short-edge" ? "duplexshort" : "simplex",
          ...(options.pages ? { pages: options.pages } : {}),
          ...(options.orientation ? { orientation: options.orientation } : {}),
        });
      } else {
        await runPowerShell([
          "-Mode", "print", "-FilePath", file, "-PrinterName", selected.name, "-Copies", String(copies),
        ], 180000);
      }
      submitted.push(file);
    } catch (error) {
      failed.push({ file, error: error.message });
    }
  }

  const signatures = [];
  for (const file of submitted) signatures.push({ file, signature: await fileSignature(file) });
  const history = await addHistory({
    printer: selected.name,
    aliasUsed,
    requestedPaths: input.paths,
    expandedPaths,
    files: resolved.files,
    submitted,
    failed,
    signatures,
    options: {
      silentMode: true,
      copies, duplex, pages: options.pages, orientation: options.orientation,
      monochrome: options.monochrome ?? false, recursive: options.recursive ?? false,
      extensions: options.extensions, namePattern: options.name_pattern,
      excludePattern: options.exclude_pattern, newerThan: options.newer_than,
      profile: options.profile,
    },
  });
  const summary = `Submitted ${submitted.length} file(s) to '${selected.name}'${failed.length ? `; ${failed.length} failed` : ""}. History ID: ${history.id}.`;
  const details = { historyJobId: history.id, printer: selected.name, copies, silentMode: true, submitted, failed };
  return failed.length ? errorResult(summary, details) : textResult(summary, details);
}

server.registerTool(
  "list_printers",
  {
    title: "List Windows printers",
    description: "Lists installed Windows printers, aliases, and the default printer. Does not print.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => {
    try {
      const [printers, settings] = await Promise.all([listWindowsPrinters(), readSettings()]);
      const defaultPrinter = printers.find((printer) => printer.isDefault)?.name ?? null;
      return textResult(`Found ${printers.length} printer(s). Default: ${defaultPrinter ?? "none"}.`, { printers, defaultPrinter, aliases: settings.printerAliases });
    } catch (error) { return errorResult(`Unable to list printers: ${error.message}`); }
  },
);

server.registerTool(
  "inspect_print_job",
  {
    title: "Inspect a print job",
    description: "Previews files selected by paths, aliases, recursion, extension, glob, exclusion, and date filters. Does not print.",
    inputSchema: requestSchema(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async (input) => {
    try {
      const { paths, resolved, byType } = await inspectRequest(input);
      return textResult(`Resolved ${resolved.files.length} printable file(s). No print job was submitted.`, { ...resolved, expandedPaths: paths, byType });
    } catch (error) { return errorResult(`Unable to inspect the print job: ${error.message}`); }
  },
);

server.registerTool(
  "estimate_print_job",
  {
    title: "Estimate pages and sheets",
    description: "Previews selected files and estimates PDF pages and paper sheets before printing. Non-PDF files are conservatively estimated. Does not print.",
    inputSchema: {
      ...requestSchema(), copies: z.number().int().min(1).max(20).optional().default(1),
      pages: z.string().optional(), duplex: z.enum(["simplex", "duplex-long-edge", "duplex-short-edge"]).optional().default("simplex"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async (input) => {
    try {
      const { resolved, byType } = await inspectRequest(input);
      const estimate = await estimateFiles(resolved.files, input);
      return textResult(`Estimated at least ${estimate.estimatedMinimumPages} page(s) and ${estimate.estimatedMinimumSheets} sheet(s). Nothing was printed.`, { ...resolved, byType, estimate });
    } catch (error) { return errorResult(`Unable to estimate the print job: ${error.message}`); }
  },
);

const printInputSchema = {
  ...requestSchema(),
  printer: z.string().min(1).optional().describe("Installed printer name or saved alias."),
  profile: z.string().min(1).optional(),
  copies: z.number().int().min(1).max(20).optional(),
  pages: z.string().regex(/^\s*\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*$/).optional(),
  duplex: z.enum(["simplex", "duplex-long-edge", "duplex-short-edge"]).optional(),
  orientation: z.enum(["portrait", "landscape"]).optional(),
  monochrome: z.boolean().optional(),
  safety_threshold: z.number().int().min(1).max(1000).optional(),
  force: z.boolean().optional().default(false).describe("Bypass duplicate and large-job safeguards after explicit user intent."),
  confirmed: z.literal(true),
};

server.registerTool(
  "print_paths",
  {
    title: "Print files or folders",
    description: "Prints selected files with aliases, profiles, filters, duplicate protection, and a large-job safety threshold. Requires explicit user intent and confirmed=true.",
    inputSchema: printInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async (input) => {
    try { return await performPrint(input); } catch (error) { return errorResult(`Unable to submit the print job: ${error.message}`); }
  },
);

server.registerTool(
  "quick_print",
  {
    title: "Run a quick print command",
    description: "Parses the argument text from /print, including flags, aliases, profiles, filters, preview, and force. Requires explicit slash-command intent and confirmed=true.",
    inputSchema: { command: z.string().min(1), confirmed: z.literal(true) },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ command, confirmed }) => {
    try {
      const parsed = parseQuickCommand(command);
      const settings = await readSettings();
      const profile = parsed.options.profile ? findCaseInsensitive(settings.profiles, parsed.options.profile) : undefined;
      if (parsed.options.profile && !profile) return errorResult(`Unknown profile '${parsed.options.profile}'.`, { profiles: Object.keys(settings.profiles) });
      const effective = { ...(profile ?? {}), ...parsed.options };
      const baseInput = {
        paths: [parsed.path], recursive: effective.recursive ?? false, extensions: effective.extensions,
        max_files: 500, name_pattern: effective.namePattern, exclude_pattern: effective.excludePattern,
        newer_than: effective.newerThan, copies: effective.copies ?? 1, pages: effective.pages,
        duplex: effective.duplex ?? "simplex", orientation: effective.orientation,
        monochrome: effective.monochrome ?? false, printer: effective.printer,
        profile: parsed.options.profile, force: parsed.force, confirmed,
      };
      if (parsed.preview) {
        const inspection = await inspectRequest(baseInput);
        if (inspection.resolved.missing.length) {
          return errorResult("Preview path does not exist. Nothing was printed.", inspection.resolved);
        }
        const estimate = await estimateFiles(inspection.resolved.files, baseInput);
        return textResult(`Preview: ${inspection.resolved.files.length} file(s), at least ${estimate.estimatedMinimumSheets} sheet(s). Nothing was printed.`, { ...inspection.resolved, byType: inspection.byType, estimate, parsed });
      }
      return await performPrint(baseInput);
    } catch (error) { return errorResult(`Invalid quick-print command: ${error.message}`); }
  },
);

server.registerTool(
  "get_print_queue",
  {
    title: "Get Windows print queue",
    description: "Lists current print jobs for one printer or alias. Does not change jobs.",
    inputSchema: { printer: z.string().min(1).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ printer }) => {
    try {
      const settings = await readSettings();
      const target = findCaseInsensitive(settings.printerAliases, printer) ?? printer;
      const args = ["-Mode", "queue"];
      if (target) args.push("-PrinterName", target);
      const output = await runPowerShell(args);
      const result = output ? JSON.parse(output) : { printer: target ?? null, jobs: [] };
      return textResult(`Found ${result.jobs.length} queued print job(s) for '${result.printer}'.`, result);
    } catch (error) { return errorResult(`Unable to read the print queue: ${error.message}`); }
  },
);

server.registerTool(
  "cancel_print_jobs",
  {
    title: "Cancel queued print jobs",
    description: "Cancels specified Windows print queue job IDs, or all queued jobs for one printer. This cannot be undone and requires explicit user intent.",
    inputSchema: {
      printer: z.string().min(1).optional(), job_ids: z.array(z.number().int().positive()).optional(),
      all_jobs: z.boolean().optional().default(false), confirmed: z.literal(true),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ printer, job_ids, all_jobs, confirmed }) => {
    if (confirmed !== true) return errorResult("Cancellation was not confirmed.");
    if (!all_jobs && !job_ids?.length) return errorResult("Provide job_ids or set all_jobs=true.");
    try {
      const settings = await readSettings();
      const target = findCaseInsensitive(settings.printerAliases, printer) ?? printer;
      const args = ["-Mode", "cancel"];
      if (target) args.push("-PrinterName", target);
      if (all_jobs) args.push("-AllJobs"); else args.push("-JobIds", job_ids.join(","));
      const result = JSON.parse(await runPowerShell(args));
      return textResult(`Cancelled ${result.cancelled.length} job(s) from '${result.printer}'.`, result);
    } catch (error) { return errorResult(`Unable to cancel print jobs: ${error.message}`); }
  },
);

server.registerTool(
  "stop_all_printing",
  {
    title: "Stop all printing",
    description: "Cancels every job currently present in every installed Windows print queue. This cannot be undone and requires an explicit '/print stop' or equivalent user request.",
    inputSchema: { confirmed: z.literal(true) },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ confirmed }) => {
    if (confirmed !== true) return errorResult("Stopping all printing was not confirmed.");
    try {
      const printers = await listWindowsPrinters();
      const cancelled = [];
      const failed = [];
      for (const printer of printers) {
        try {
          const output = await runPowerShell(["-Mode", "cancel", "-PrinterName", printer.name, "-AllJobs"]);
          const result = output ? JSON.parse(output) : { printer: printer.name, cancelled: [] };
          const jobs = Array.isArray(result.cancelled)
            ? result.cancelled
            : result.cancelled ? [result.cancelled] : [];
          cancelled.push(...jobs.map((job) => ({ printer: printer.name, ...job })));
        } catch (error) {
          failed.push({ printer: printer.name, error: error.message });
        }
      }
      const summary = `Cancelled ${cancelled.length} queued job(s) across ${printers.length} printer(s)${failed.length ? `; ${failed.length} queue(s) could not be changed` : ""}.`;
      const details = { cancelled, failed, checkedPrinters: printers.map((printer) => printer.name) };
      return failed.length ? errorResult(summary, details) : textResult(summary, details);
    } catch (error) { return errorResult(`Unable to stop all printing: ${error.message}`); }
  },
);

server.registerTool(
  "get_print_history",
  {
    title: "Get Printer MCP history",
    description: "Lists recent Printer MCP submissions and stable history IDs for retry and duplicate diagnostics. Does not print.",
    inputSchema: { limit: z.number().int().min(1).max(100).optional().default(20) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ limit }) => {
    try {
      const history = await readHistory(limit);
      return textResult(`Found ${history.length} Printer MCP history job(s).`, { history });
    } catch (error) { return errorResult(`Unable to read print history: ${error.message}`); }
  },
);

server.registerTool(
  "retry_print_job",
  {
    title: "Retry a Printer MCP history job",
    description: "Prints the original files and options from a prior Printer MCP history ID. Requires explicit user intent and confirmed=true.",
    inputSchema: { history_id: z.string().uuid(), confirmed: z.literal(true) },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ history_id, confirmed }) => {
    try {
      const entry = await findHistory(history_id);
      if (!entry) return errorResult(`History job '${history_id}' was not found.`);
      return await performPrint({
        paths: entry.files, printer: entry.printer, ...entry.options,
        max_files: 1000, force: true, skip_duplicate_check: true, confirmed,
      });
    } catch (error) { return errorResult(`Unable to retry print job: ${error.message}`); }
  },
);

server.registerTool(
  "get_print_settings",
  {
    title: "Get print aliases and profiles",
    description: "Lists saved printer aliases, path aliases, profiles, duplicate window, and safety threshold. Does not print.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => {
    try { return textResult("Loaded Printer MCP settings.", await readSettings()); }
    catch (error) { return errorResult(`Unable to read print settings: ${error.message}`); }
  },
);

server.registerTool(
  "set_printer_alias",
  {
    title: "Save a printer alias",
    description: "Creates or replaces a short alias for an installed Windows printer.",
    inputSchema: { alias: z.string().regex(/^[a-zA-Z0-9_-]+$/), printer: z.string().min(1) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ alias, printer }) => {
    try {
      const printers = await listWindowsPrinters();
      const match = printers.find((item) => item.name.toLowerCase() === printer.toLowerCase());
      if (!match) return errorResult(`Printer '${printer}' is not installed.`, { availablePrinters: printers.map((item) => item.name) });
      const settings = await updateSettings((current) => { current.printerAliases[alias] = match.name; return current; });
      return textResult(`Saved printer alias '${alias}' -> '${match.name}'.`, { alias, printer: match.name, aliases: settings.printerAliases });
    } catch (error) { return errorResult(`Unable to save printer alias: ${error.message}`); }
  },
);

server.registerTool(
  "set_path_alias",
  {
    title: "Save a path alias",
    description: "Creates or replaces a short @alias for a local or UNC file/folder path after verifying that it exists.",
    inputSchema: { alias: z.string().regex(/^[a-zA-Z0-9_-]+$/), path: z.string().min(1) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ alias, path: aliasPath }) => {
    try {
      await fs.access(aliasPath);
      const resolvedPath = path.resolve(aliasPath);
      const settings = await updateSettings((current) => { current.pathAliases[alias] = resolvedPath; return current; });
      return textResult(`Saved path alias '@${alias}' -> '${resolvedPath}'.`, { alias, path: resolvedPath, aliases: settings.pathAliases });
    } catch (error) { return errorResult(`Unable to save path alias: ${error.message}`); }
  },
);

server.registerTool(
  "set_print_profile",
  {
    title: "Save a print profile",
    description: "Creates or replaces a reusable print profile for copies, printer/alias, color, duplex, orientation, and PDF pages.",
    inputSchema: {
      name: z.string().regex(/^[a-zA-Z0-9_-]+$/), printer: z.string().min(1).optional(),
      copies: z.number().int().min(1).max(20).optional(), monochrome: z.boolean().optional(),
      duplex: z.enum(["simplex", "duplex-long-edge", "duplex-short-edge"]).optional(),
      orientation: z.enum(["portrait", "landscape"]).optional(), pages: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ name, ...profile }) => {
    try {
      const cleaned = Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== undefined));
      const settings = await updateSettings((current) => { current.profiles[name] = cleaned; return current; });
      return textResult(`Saved print profile '${name}'.`, { name, profile: cleaned, profiles: settings.profiles });
    } catch (error) { return errorResult(`Unable to save print profile: ${error.message}`); }
  },
);

server.registerTool(
  "remove_print_setting",
  {
    title: "Remove a print alias or profile",
    description: "Removes one saved printer alias, path alias, or print profile. Does not affect files, printers, or queued jobs.",
    inputSchema: { kind: z.enum(["printer_alias", "path_alias", "profile"]), name: z.string().min(1) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ kind, name }) => {
    try {
      const result = await removePrintSetting(kind, name);
      return result.removed ? textResult(`Removed ${kind} '${name}'.`, result) : errorResult(`${kind} '${name}' was not found.`, result);
    } catch (error) { return errorResult(`Unable to remove print setting: ${error.message}`); }
  },
);

server.registerTool(
  "set_print_safety",
  {
    title: "Configure print safeguards",
    description: "Updates the large-job file threshold and/or duplicate-print detection window used by Printer MCP.",
    inputSchema: {
      safety_threshold: z.number().int().min(1).max(1000).optional(),
      duplicate_window_minutes: z.number().int().min(0).max(1440).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ safety_threshold, duplicate_window_minutes }) => {
    if (safety_threshold === undefined && duplicate_window_minutes === undefined) {
      return errorResult("Provide safety_threshold and/or duplicate_window_minutes.");
    }
    try {
      const settings = await updateSettings((current) => {
        if (safety_threshold !== undefined) current.safetyThreshold = safety_threshold;
        if (duplicate_window_minutes !== undefined) current.duplicateWindowMinutes = duplicate_window_minutes;
        return current;
      });
      return textResult("Updated Printer MCP safeguards.", {
        safetyThreshold: settings.safetyThreshold,
        duplicateWindowMinutes: settings.duplicateWindowMinutes,
      });
    } catch (error) { return errorResult(`Unable to update print safeguards: ${error.message}`); }
  },
);

server.registerTool(
  "printer_health_check",
  {
    title: "Check Printer MCP health",
    description: "Checks Windows printing, default printer, PDF engine, Office apps, local storage, and optional local/UNC paths. Does not print.",
    inputSchema: { paths: z.array(z.string().min(1)).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ paths = [] }) => {
    try {
      const [printers, settings, runtime, storage] = await Promise.all([
        listWindowsPrinters(), readSettings(), runPowerShell(["-Mode", "health"]).then(JSON.parse), ensureStorage(),
      ]);
      const pathChecks = [];
      for (const requested of paths) {
        const expanded = expandPathAlias(requested, settings);
        try {
          const stat = await fs.stat(expanded);
          pathChecks.push({ requested, expanded, accessible: true, type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other" });
        } catch (error) { pathChecks.push({ requested, expanded, accessible: false, error: error.message }); }
      }
      const defaultPrinter = printers.find((item) => item.isDefault) ?? null;
      const checks = {
        nodeVersion: process.version,
        storage: { ...storage, accessible: true },
        runtime,
        printers,
        defaultPrinter,
        pathChecks,
      };
      const healthy = Boolean(defaultPrinter && !defaultPrinter.isOffline && runtime.printManagement && runtime.sumatraPdf && runtime.systemDrawing && runtime.silentMode && pathChecks.every((item) => item.accessible));
      return textResult(`Printer MCP health: ${healthy ? "healthy" : "attention required"}.`, { healthy, checks });
    } catch (error) { return errorResult(`Printer health check failed: ${error.message}`); }
  },
);

await ensureStorage();
const transport = new StdioServerTransport();
await server.connect(transport);
