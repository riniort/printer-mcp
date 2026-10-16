# Printer MCP

**English** | [ไทย](README.md)

A local MCP server for printing files on Windows through Codex, using natural-language requests or the `/print` quick command. It supports PDF, Microsoft Office documents, images, text files, local paths, and UNC network paths.

Printer MCP runs locally over MCP `stdio`. Print jobs are submitted by the Windows computer running Codex directly to printers installed on that computer.

## Features

- Print one file or every supported file in a folder
- Use `/print <path>` for common print jobs
- Select a printer or use the Windows default printer
- Configure copies, PDF pages, orientation, monochrome mode, and duplex mode
- Inspect files and estimate PDF pages before printing
- List installed printers and current print queues
- Save printer aliases, path aliases, and reusable print profiles
- Detect duplicate print attempts within a configurable time window
- Require confirmation for large jobs
- Filter by filename glob, exclusion glob, and modification date
- Review history, retry previous jobs, and cancel queued jobs
- Run system diagnostics with `/print-check`
- Print silently without opening application windows or print dialogs
- Handle paths containing spaces, Unicode characters, and UNC shares
- Require explicit user intent before any tool submits a physical print job

## Quick Print

Display help without printing anything:

```text
/print how to use
/print help
/print ?
/print ใช้งายยังไง
```

After installing the server and restarting Codex, print a file or folder with:

```text
/print D:\Invoices\invoice-001.pdf
/print D:\Invoices\batch1
/print \\fileserver\shared\invoices\batch1
```

### Quick flags

Put the path before the options. Wrap option values containing spaces in quotes.

```text
/print D:\Invoices\batch1 --copies 2
/print D:\Invoices\batch1 --pdf --bw
/print D:\Invoices\batch1 --duplex long
/print D:\Invoices\batch1 --recursive
/print D:\Invoices\invoice.pdf --pages 1-3,5
/print D:\Invoices\batch1 --printer office
/print D:\Invoices\batch1 --profile draft
/print D:\Invoices --name "TTSTHAC*" --exclude "Expense*"
/print D:\Invoices --newer-than 2026-10-01
/print D:\Invoices\batch1 --preview
/print D:\LargeBatch --force
/print stop
```

| Flag | Meaning |
|---|---|
| `--copies N` | Number of copies, from 1 to 20 |
| `--printer NAME` | Installed printer name or alias |
| `--profile NAME` | Use a saved print profile |
| `--pages 1-3,5` | Select PDF pages |
| `--bw` / `--color` | Print in monochrome or color |
| `--duplex long` | Two-sided printing on the long edge |
| `--duplex short` | Two-sided printing on the short edge |
| `--duplex off` | Single-sided printing |
| `--orientation portrait\|landscape` | PDF orientation |
| `--recursive` | Include subfolders |
| `--pdf` | Select PDF files only |
| `--name GLOB` | Include matching filenames, such as `TTSTHAC*` |
| `--exclude GLOB` | Exclude matching filenames |
| `--newer-than DATE` | Include files modified after the given date or time |
| `--preview` | List files and estimate sheets without printing |
| `--force` | Bypass duplicate and large-job safeguards |

### Stop all printing

```text
/print stop
```

This calls `stop_all_printing`, which cancels every job still present in every Windows print queue on the computer. It does not delete or modify source files. A page already transferred to a printer may be too late to cancel.

Default `/print` behavior:

- Uses the Windows default printer
- Prints one copy of each file
- Prints every supported file when the path is a folder
- Sorts filenames naturally, so `file2.pdf` comes before `file10.pdf`
- Does not search subfolders unless `--recursive` is used
- Treats `/print` as an explicit request to print, so it does not ask for confirmation again
- Does not create a print job if the path is missing or no supported files are found

### Aliases and profiles

```text
/print @receipts\batch1
/print D:\Invoices\batch1 --printer office
/print D:\Invoices\batch1 --profile invoice
/print D:\Invoices\batch1 --profile draft
```

Printer aliases and path aliases are empty by default. Configure them for the current computer. Two profiles are included:

- `invoice`: one copy, color, single-sided
- `draft`: one copy, monochrome, duplex on the long edge

You can configure settings through Codex with a request such as `Create a path alias named receipts for D:\Receipts`, or edit `data/settings.json` directly.

### Other quick commands

```text
/queue
/cancel 42
/cancel all
/retry <history-id>
/print-check
/print-check \\server\share\folder
```

Natural-language requests can express more detail:

```text
Print every PDF in D:\Invoices\batch1, two copies each.
Print pages 1-3 and 5 of D:\Invoices\invoice.pdf.
Print this file in monochrome with long-edge duplex.
Print every PDF in this folder and its subfolders using Office Printer.
Inspect the files in this folder before printing.
Show the default printer queue.
```

## Supported file types

| Type | Extensions | Printing method |
|---|---|---|
| PDF | `.pdf` | `pdf-to-printer` with its bundled SumatraPDF; no PDF file association is required |
| Word | `.doc`, `.docx`, `.docm`, `.rtf` | Microsoft Word COM automation |
| Excel | `.xls`, `.xlsx`, `.xlsm`, `.csv` | Microsoft Excel COM automation |
| PowerPoint | `.ppt`, `.pptx`, `.pptm` | Microsoft PowerPoint COM automation |
| Images | `.bmp`, `.gif`, `.jpg`, `.jpeg`, `.png`, `.tif`, `.tiff` | Silent Windows `System.Drawing.Printing.PrintDocument` |
| Text | `.txt`, `.log` | Silent Windows `System.Drawing.Printing.PrintDocument` |

Word, Excel, and PowerPoint files require the matching Microsoft Office desktop application. PDF printing does not require Adobe Acrobat or a configured default PDF application.

## Silent Mode

All supported file types print in the background without opening an application window, preview window, or print dialog:

- PDF uses SumatraPDF through the `pdf-to-printer` command-line interface
- Word, Excel, and PowerPoint use hidden COM automation with alerts disabled
- Images and text are sent directly to the Windows spooler using `StandardPrintController`
- Unsupported files return an error instead of falling back to the default application

Virtual printers that need user input, such as Microsoft Print to PDF asking for an output filename, may not be suitable for unattended Silent Mode. Use a physical printer for unattended jobs.

## MCP tools

### `list_printers`

Lists installed Windows printers with default, offline, and network status, plus driver and port information. This tool is read-only and never submits a print job.

### `inspect_print_job`

Expands and lists the files that would be printed without sending anything to a printer.

| Parameter | Type | Default | Description |
|---|---|---:|---|
| `paths` | `string[]` | required | Files or folders to inspect |
| `recursive` | `boolean` | `false` | Include subfolders |
| `extensions` | `string[]` | all supported | Limit extensions, such as `['pdf', 'docx']` |
| `max_files` | `number` | `500` | Maximum result count, from 1 to 1000 |
| `name_pattern` | `string` | unrestricted | Filename inclusion glob |
| `exclude_pattern` | `string` | none | Filename exclusion glob |
| `newer_than` | `string` | unrestricted | Include files modified after an ISO date/time |

The result reports matched files, missing paths, unsupported files, truncation state, and totals by type.

### `estimate_print_job`

Counts PDF pages and estimates paper consumption before printing. It accounts for copies, PDF page selection, and duplex mode. Non-PDF files are counted as at least one page each and clearly marked as estimates.

### `print_paths`

Submits files to a printer. It supports individual files, multiple files, folders, and UNC paths.

| Parameter | Type | Default | Description |
|---|---|---:|---|
| `paths` | `string[]` | required | Files or folders to print |
| `recursive` | `boolean` | `false` | Include subfolders |
| `extensions` | `string[]` | all supported | Limit file types |
| `max_files` | `number` | `500` | Maximum file count, from 1 to 1000 |
| `printer` | `string` | Windows default | Installed printer name or alias |
| `copies` | `number` | `1` | Copies, from 1 to 20 |
| `pages` | `string` | all pages | PDF pages such as `1-3,5` |
| `duplex` | `enum` | `simplex` | `simplex`, `duplex-long-edge`, or `duplex-short-edge` |
| `orientation` | `enum` | document default | `portrait` or `landscape` for PDF |
| `monochrome` | `boolean` | `false` | Print PDF in monochrome |
| `profile` | `string` | none | Saved print profile |
| `name_pattern` | `string` | unrestricted | Filename inclusion glob |
| `exclude_pattern` | `string` | none | Filename exclusion glob |
| `newer_than` | `string` | unrestricted | Include files modified after a date/time |
| `safety_threshold` | `number` | `20` | File count above which `force` is required |
| `force` | `boolean` | `false` | Bypass duplicate and large-job safeguards |
| `confirmed` | `true` | required | Confirms that the user explicitly requested printing |

If any directly specified path is missing, the operation stops before printing any file. If an individual file fails after submission begins, the server continues with the remaining files and returns separate `submitted` and `failed` lists.

### `get_print_queue`

Reads the current jobs for one printer without changing or cancelling them. The optional `printer` parameter defaults to the Windows default printer.

### Additional tools

| Tool | Purpose |
|---|---|
| `quick_print` | Parses `/print` flags and previews or prints the result |
| `cancel_print_jobs` | Cancels selected job IDs or every job for one printer |
| `stop_all_printing` | Cancels pending jobs in every Windows print queue |
| `get_print_history` | Reads up to 500 jobs submitted through Printer MCP |
| `retry_print_job` | Reprints the same files and options using a history ID |
| `get_print_settings` | Reads aliases, profiles, and safety settings |
| `set_printer_alias` | Adds or updates an alias after verifying the printer exists |
| `set_path_alias` | Adds or updates an alias after verifying the path is accessible |
| `set_print_profile` | Adds or updates a reusable print profile |
| `remove_print_setting` | Removes a printer alias, path alias, or profile |
| `set_print_safety` | Configures the large-job threshold and duplicate window |
| `printer_health_check` | Checks Node, PowerShell, SumatraPDF, Office, printing capabilities, printers, and paths |

## Duplicate and large-job safeguards

- Successful jobs store file paths, sizes, and modification times in `data/history.json`
- Reprinting an identical file within five minutes stops the whole job and reports the earlier history ID
- Use `--force` only when the duplicate is intentional
- Jobs containing more than 20 files stop and report the file count and page estimate
- Change these defaults through `set_print_safety` or `data/settings.json`

The server keeps up to 500 history entries. Each entry has a UUID that can be used with `/retry <history-id>`.

## Safety model

Printing and queue cancellation have external effects. Therefore `print_paths`, `quick_print`, `retry_print_job`, and cancellation tools are declared as write/destructive MCP tools and require `confirmed: true`.

An MCP client should set `confirmed: true` only after an explicit instruction such as `Print this file`, `Print the PDFs in batch1`, or `/print D:\Invoices\batch1`.

Requests such as `show`, `check`, `inspect`, `what files are here`, or `what would be printed` must use `inspect_print_job` and must not submit a print job.

## Requirements

- Windows 10 or Windows 11
- Node.js 20 or later
- npm
- A working printer installed in Windows
- Microsoft Office desktop for Word, Excel, and PowerPoint files
- Read access to every local path or network share being printed

Check the installed versions:

```powershell
node --version
npm --version
codex --version
```

## Installation

Open PowerShell and run:

```powershell
$installPath = Join-Path $env:USERPROFILE '.codex\mcp-servers\printer-mcp'
git clone https://github.com/riniort/printer-mcp.git $installPath
Set-Location -LiteralPath $installPath
npm install
npm run check
npm test
```

`npm test` is a non-printing smoke test. It verifies all 17 MCP tools, five prompts, `/print stop`, quick flags, settings, printer discovery, inspection, page estimation, queues, and health checks.

## Connect to Codex

Register the MCP server through the Codex CLI:

```powershell
$entryPoint = Join-Path $env:USERPROFILE '.codex\mcp-servers\printer-mcp\src\index.js'
codex mcp add printer -- node $entryPoint
```

Alternatively, add it manually to `%USERPROFILE%\.codex\config.toml`:

```toml
[mcp_servers.printer]
command = "node"
args = ['C:\Users\YOUR_USERNAME\.codex\mcp-servers\printer-mcp\src\index.js']
startup_timeout_sec = 30.0
tool_timeout_sec = 300.0
```

Verify the registration:

```powershell
codex mcp get printer
codex mcp list
```

Completely close and reopen Codex after adding or changing the MCP server so it loads the latest tools and `/print` prompt.

## Run manually

```powershell
Set-Location -LiteralPath (Join-Path $env:USERPROFILE '.codex\mcp-servers\printer-mcp')
npm start
```

The server communicates through MCP `stdio`, so it waits for JSON-RPC from an MCP client and normally displays no browser or application window. Codex starts the process automatically from `config.toml`; you do not need to run `npm start` separately during normal use.

## Test against a real folder without printing

Set `PRINTER_MCP_TEST_PATH` to let the smoke test inspect PDF files in a specific path:

```powershell
$env:PRINTER_MCP_TEST_PATH = '\\server\share\batch1'
npm test
Remove-Item Env:PRINTER_MCP_TEST_PATH
```

This invokes inspection only and does not submit a print job.

## Project layout

```text
printer-mcp/
├─ data/
│  ├─ settings.json  aliases, profiles, and safety settings
│  └─ history.json   duplicate protection and retry history
├─ src/
│  ├─ index.js          MCP server, prompts, and tools
│  ├─ quick-command.js  `/print` flag parser
│  ├─ storage.js        settings, history, and file signatures
│  └─ printers.ps1      Windows printer, Office, image, and text integration
├─ test/
│  └─ smoke.mjs         non-printing MCP smoke test
├─ package.json
├─ package-lock.json
├─ README.md
└─ README.en.md
```

## Development

```powershell
npm run check
npm test
```

`src/index.js` declares MCP prompts and tools, `src/quick-command.js` parses quick flags, `src/storage.js` manages settings and history, and `src/printers.ps1` integrates with Windows printers and the appropriate application for each file type.

Do not write ordinary log messages to server `stdout`, because it carries MCP JSON-RPC. Write diagnostics to `stderr` instead.

## Troubleshooting

### `/print` is unavailable

1. Run `codex mcp get printer` to confirm the server is registered.
2. Open `%USERPROFILE%\.codex\mcp-servers\printer-mcp` and run `npm test`.
3. Completely close and reopen Codex.

### No printer is found

Check Windows Settings > Bluetooth & devices > Printers & scanners, then run:

```powershell
Get-Printer | Select-Object Name, DriverName, PortName
```

Set a Windows default printer or specify an installed printer by name.

### PDF printing fails

- Run `npm install` again to restore all `pdf-to-printer` files
- Check whether antivirus software quarantined the bundled SumatraPDF executable
- Verify the printer name with `list_printers`
- Test one PDF before printing a complete folder

### Word, Excel, or PowerPoint printing fails

- Confirm that the matching Microsoft Office desktop application is installed
- Open the file manually to verify that it is not damaged
- Close any Office dialog waiting for user input
- Verify that Office can print normally to the same printer

### A UNC path cannot be opened

Test the path from PowerShell under the same Windows account running Codex:

```powershell
Get-ChildItem -LiteralPath '\\server\share\folder'
```

If this fails, check the network or VPN connection, share permissions, and Windows credentials.

### A job times out

Increase `tool_timeout_sec` in `%USERPROFILE%\.codex\config.toml`, for example:

```toml
tool_timeout_sec = 600.0
```

Restart Codex afterward. Split large jobs into batches to make successes and failures easier to track.

## Current limitations

- `/print` defaults to one copy and does not search subfolders
- PDF options are passed directly to the PDF print engine; behavior for other formats depends on Office or the Windows printing API
- Images and text print through Windows `System.Drawing` without opening Paint or Notepad
- Cancellation only affects jobs still in a Windows queue; a printer may already have received part of a job
- Virtual printers may show a save dialog and are not suitable for unattended printing
- The server has no built-in authentication because it is designed to run locally through `stdio`

## Disconnect from Codex

```powershell
codex mcp remove printer
```

This removes the MCP registration but does not delete `%USERPROFILE%\.codex\mcp-servers\printer-mcp`.

## License

This project does not currently include a license for redistribution.
