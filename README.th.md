# Printer MCP

[English](README.md) | **ไทย**

MCP server สำหรับสั่งพิมพ์ไฟล์บน Windows ผ่าน Codex ด้วยภาษาธรรมชาติหรือคำสั่งลัด `/print` รองรับไฟล์ PDF, Microsoft Office, รูปภาพ, ไฟล์ข้อความ, path ภายในเครื่อง และ UNC network path

โปรเจกต์นี้ทำงานแบบ local ผ่าน MCP `stdio` งานพิมพ์จึงถูกส่งจากเครื่อง Windows ที่รัน Codex ไปยังเครื่องพิมพ์ที่ติดตั้งอยู่ใน Windows โดยตรง

## ความสามารถหลัก

- สั่งพิมพ์ไฟล์เดียวหรือทุกไฟล์ที่รองรับภายในโฟลเดอร์
- ใช้คำสั่งลัด `/print <path>` สำหรับงานพิมพ์ทั่วไป
- เลือกเครื่องพิมพ์หรือใช้เครื่องพิมพ์เริ่มต้นของ Windows
- ระบุจำนวนชุด หน้าที่ต้องการพิมพ์ แนวกระดาษ สีขาวดำ และการพิมพ์สองหน้า
- ตรวจรายการไฟล์ก่อนพิมพ์โดยไม่สร้างงานพิมพ์
- อ่านรายการเครื่องพิมพ์และคิวงานพิมพ์ปัจจุบัน
- ใช้ printer aliases, path aliases และ print profiles
- ป้องกันการสั่งพิมพ์ไฟล์เดิมซ้ำภายในช่วงเวลาที่กำหนด
- เตือนงานขนาดใหญ่ก่อนพิมพ์และประเมินจำนวนหน้า/แผ่นของ PDF
- กรองไฟล์ตามชื่อ, exclusion pattern และวันที่แก้ไข
- ดูประวัติ, retry งานเดิม และยกเลิกงานใน Windows print queue
- ตรวจสุขภาพระบบด้วย `/print-check`
- Silent Mode ทุกงานพิมพ์ ไม่เปิดหน้าต่างแอปหรือ print dialog
- รองรับ path ที่มีช่องว่าง อักษรไทย และ UNC network path
- ตรวจสอบว่าได้รับคำสั่งพิมพ์อย่างชัดเจนก่อนเรียกเครื่องมือที่สร้างงานพิมพ์จริง

## Quick Print

เปิดวิธีใช้ได้โดยไม่สร้างงานพิมพ์:

```text
/print how to use
/print ใช้งายยังไง
/print help
/print ?
```

ระบบรู้จักทั้ง `ใช้งายยังไง` ตามรูปแบบคำสั่งที่กำหนด และคำสะกดทั่วไปอย่าง `ใช้งานยังไง`, `ใช้ยังไง` และ `วิธีใช้`

หลังจากติดตั้งและเปิด Codex ใหม่ สามารถพิมพ์ไฟล์หรือทั้งโฟลเดอร์ด้วยคำสั่ง:

```text
/print D:\Invoices\invoice-001.pdf
/print D:\Invoices\batch1
/print \\fileserver\shared\invoices\batch1
```

### Quick flags

วาง path ก่อน options เสมอ หากค่าของ option มีช่องว่างให้ครอบด้วย `"..."`

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

| Flag | ความหมาย |
|---|---|
| `--copies N` | จำนวนชุด 1–20 |
| `--printer NAME` | ชื่อเครื่องพิมพ์หรือ alias; ครอบด้วย quotes หากมีช่องว่าง |
| `--profile NAME` | ใช้ print profile ที่บันทึกไว้ |
| `--pages 1-3,5` | เลือกหน้าของ PDF |
| `--bw` / `--color` | ขาวดำหรือสี |
| `--duplex long` | พิมพ์สองหน้ากลับด้านยาว |
| `--duplex short` | พิมพ์สองหน้ากลับด้านสั้น |
| `--duplex off` | พิมพ์หน้าเดียว |
| `--orientation portrait\|landscape` | แนวกระดาษ PDF |
| `--recursive` | รวมโฟลเดอร์ย่อย |
| `--pdf` | เลือกเฉพาะ PDF |
| `--name GLOB` | เลือกชื่อไฟล์ เช่น `TTSTHAC*` |
| `--exclude GLOB` | ตัดชื่อไฟล์ที่ตรง pattern ออก |
| `--newer-than DATE` | เลือกไฟล์ที่แก้ไขหลังวันที่/เวลาที่ระบุ |
| `--preview` | แสดงไฟล์และประมาณจำนวนแผ่นโดยไม่พิมพ์ |
| `--force` | ยืนยันข้ามระบบตรวจไฟล์ซ้ำและเกณฑ์งานขนาดใหญ่ |

### หยุดการพิมพ์ทั้งหมด

```text
/print stop
```

คำสั่งนี้เรียก `stop_all_printing` เพื่อยกเลิกทุกงานที่ยังอยู่ในทุก Windows print queue ที่ติดตั้งในเครื่อง ไม่ลบหรือแก้ไขไฟล์ต้นฉบับ หน้าที่ถูกส่งถึงเครื่องพิมพ์หรือกำลังพิมพ์ออกมาแล้วอาจหยุดไม่ทัน

พฤติกรรมเริ่มต้นของ `/print`:

- ใช้เครื่องพิมพ์เริ่มต้นของ Windows
- พิมพ์ไฟล์ละ 1 ชุด
- ถ้าเป็นโฟลเดอร์ จะพิมพ์ไฟล์ที่รองรับทั้งหมดในโฟลเดอร์นั้น
- เรียงไฟล์ตามชื่อแบบ natural order เช่น `file2.pdf` มาก่อน `file10.pdf`
- ไม่ค้นหาในโฟลเดอร์ย่อย
- ถือว่าการเรียก `/print` เป็นคำขอพิมพ์จริงโดยชัดแจ้ง จึงไม่ถามยืนยันซ้ำ
- ถ้า path ไม่มีอยู่หรือไม่พบไฟล์ที่รองรับ จะไม่สร้างงานพิมพ์

### Aliases และ profiles

```text
/print @receipts\batch1
/print D:\Invoices\batch1 --printer office
/print D:\Invoices\batch1 --profile invoice
/print D:\Invoices\batch1 --profile draft
```

- Printer alias และ path alias เริ่มต้นเป็นค่าว่าง ให้ผู้ใช้ตั้งให้ตรงกับเครื่องของตน
- Profile `invoice`: 1 ชุด, สี, หน้าเดียว
- Profile `draft`: 1 ชุด, ขาวดำ, สองหน้ากลับด้านยาว

ตั้งค่าเหล่านี้ด้วยภาษาธรรมชาติได้ เช่น `สร้าง path alias ชื่อ receipts สำหรับ D:\Receipts` หรือแก้ไฟล์ `data/settings.json`

### คำสั่งลัดอื่น

```text
/queue
/cancel 42
/cancel all
/retry <history-id>
/print-check
/print-check \\server\share\folder
```

หากต้องการควบคุมรายละเอียดเพิ่มเติม ให้สั่งด้วยภาษาธรรมชาติแทน เช่น:

```text
พิมพ์ PDF ใน D:\Invoices\batch1 จำนวน 2 ชุด
พิมพ์หน้า 1-3,5 ของ D:\Invoices\invoice.pdf
พิมพ์ไฟล์นี้เป็นขาวดำและกลับด้านยาว
พิมพ์ทุก PDF รวมโฟลเดอร์ย่อยด้วยเครื่องพิมพ์ชื่อ Office Printer
ตรวจรายการไฟล์ในโฟลเดอร์นี้ก่อนพิมพ์
ดูคิวพิมพ์ของเครื่องพิมพ์เริ่มต้น
```

## รูปแบบไฟล์ที่รองรับ

| ประเภท | นามสกุล | วิธีพิมพ์ |
|---|---|---|
| PDF | `.pdf` | `pdf-to-printer` พร้อม SumatraPDF ที่มากับแพ็กเกจ ไม่พึ่ง PDF file association ของ Windows |
| Word | `.doc`, `.docx`, `.docm`, `.rtf` | Microsoft Word COM automation |
| Excel | `.xls`, `.xlsx`, `.xlsm`, `.csv` | Microsoft Excel COM automation |
| PowerPoint | `.ppt`, `.pptx`, `.pptm` | Microsoft PowerPoint COM automation |
| รูปภาพ | `.bmp`, `.gif`, `.jpg`, `.jpeg`, `.png`, `.tif`, `.tiff` | Windows `System.Drawing.Printing.PrintDocument` แบบ silent |
| ข้อความ | `.txt`, `.log` | Windows `System.Drawing.Printing.PrintDocument` แบบ silent |

ไฟล์ Word, Excel และ PowerPoint ต้องมีโปรแกรม Microsoft Office desktop ที่ตรงกับประเภทไฟล์ติดตั้งอยู่ในเครื่อง ส่วน PDF ไม่จำเป็นต้องติดตั้ง Adobe Acrobat หรือกำหนด default PDF application

## Silent Mode

งานพิมพ์ทุกชนิดทำงานแบบ background และไม่เปิดหน้าต่างโปรแกรม, preview window หรือ print dialog:

- PDF ใช้ SumatraPDF ผ่าน `pdf-to-printer` แบบ command-line
- Word, Excel และ PowerPoint ใช้ COM automation โดยตั้ง application เป็น hidden และปิด alerts
- รูปภาพและข้อความส่งเข้า Windows spooler ผ่าน `StandardPrintController` โดยตรง
- ไม่มีการ fallback ไปเปิด default application หากพบชนิดไฟล์ที่ไม่รองรับ ระบบจะคืน error แทน

เครื่องพิมพ์เสมือนที่ต้องรับข้อมูลจากผู้ใช้ เช่น Microsoft Print to PDF ซึ่งต้องเลือกชื่อไฟล์ปลายทาง อาจไม่เหมาะกับ Silent Mode ควรใช้เครื่องพิมพ์จริงสำหรับงาน unattended

## MCP tools

### `list_printers`

แสดงเครื่องพิมพ์ที่ติดตั้งใน Windows พร้อมชื่อเครื่องพิมพ์, สถานะ default/offline/network, driver และ port เครื่องมือนี้เป็น read-only และไม่สร้างงานพิมพ์

ตัวอย่างคำสั่ง:

```text
แสดงเครื่องพิมพ์ทั้งหมด
เครื่องพิมพ์เริ่มต้นคืออะไร
```

### `inspect_print_job`

ตรวจและแสดงรายการไฟล์ที่จะถูกพิมพ์ โดยยังไม่ส่งไฟล์เข้าคิวเครื่องพิมพ์ เหมาะสำหรับโฟลเดอร์ที่มีไฟล์จำนวนมากหรือมีหลายชนิดไฟล์

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | รายละเอียด |
|---|---|---:|---|
| `paths` | `string[]` | จำเป็น | รายการไฟล์หรือโฟลเดอร์ |
| `recursive` | `boolean` | `false` | รวมไฟล์ในโฟลเดอร์ย่อย |
| `extensions` | `string[]` | รูปแบบที่รองรับทั้งหมด | จำกัดนามสกุล เช่น `['pdf', 'docx']` |
| `max_files` | `number` | `500` | จำนวนไฟล์สูงสุด ช่วง 1–1000 |
| `name_pattern` | `string` | ไม่จำกัด | glob ของชื่อไฟล์ที่ต้องการ |
| `exclude_pattern` | `string` | ไม่มี | glob ของชื่อไฟล์ที่ไม่ต้องการ |
| `newer_than` | `string` | ไม่จำกัด | เลือกไฟล์ที่แก้ไขหลัง ISO date/time |

ผลลัพธ์ประกอบด้วยไฟล์ที่พบ, path ที่ไม่มีอยู่, ไฟล์ที่ไม่รองรับ, สถานะว่ารายการถูกตัดหรือไม่ และจำนวนไฟล์แยกตามประเภท

### `estimate_print_job`

นับจำนวนหน้าของ PDF และประมาณจำนวนกระดาษก่อนพิมพ์ รองรับจำนวนชุด, page selection และ duplex สำหรับไฟล์ที่ไม่ใช่ PDF ระบบจะนับขั้นต่ำไฟล์ละหนึ่งหน้าและระบุว่าเป็นค่าประมาณ

### `print_paths`

ส่งไฟล์จริงไปยังเครื่องพิมพ์ รองรับไฟล์เดี่ยว หลายไฟล์ โฟลเดอร์ และ UNC path

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | รายละเอียด |
|---|---|---:|---|
| `paths` | `string[]` | จำเป็น | ไฟล์หรือโฟลเดอร์ที่ต้องการพิมพ์ |
| `recursive` | `boolean` | `false` | รวมไฟล์ในโฟลเดอร์ย่อย |
| `extensions` | `string[]` | รูปแบบที่รองรับทั้งหมด | จำกัดชนิดไฟล์ |
| `max_files` | `number` | `500` | จำนวนไฟล์สูงสุด ช่วง 1–1000 |
| `printer` | `string` | เครื่องพิมพ์เริ่มต้น | ต้องตรงกับชื่อเครื่องพิมพ์ที่ติดตั้งใน Windows |
| `copies` | `number` | `1` | จำนวนชุด ช่วง 1–20 |
| `pages` | `string` | ทุกหน้า | ช่วงหน้าของ PDF เช่น `1-3,5` ใช้กับ PDF เท่านั้น |
| `duplex` | `enum` | `simplex` | `simplex`, `duplex-long-edge` หรือ `duplex-short-edge` |
| `orientation` | `enum` | ตามเอกสาร | `portrait` หรือ `landscape` ใช้กับ PDF |
| `monochrome` | `boolean` | `false` | พิมพ์ PDF แบบขาวดำ |
| `profile` | `string` | ไม่มี | print profile ที่บันทึกไว้ |
| `name_pattern` | `string` | ไม่จำกัด | เลือกไฟล์ตาม glob |
| `exclude_pattern` | `string` | ไม่มี | ตัดไฟล์ตาม glob |
| `newer_than` | `string` | ไม่จำกัด | เลือกไฟล์ที่แก้ไขหลังวันที่/เวลา |
| `safety_threshold` | `number` | `20` | จำนวนไฟล์ที่เกินแล้วต้องยืนยันด้วย `force` |
| `force` | `boolean` | `false` | ข้าม duplicate/large-job safeguards |
| `confirmed` | `true` | จำเป็น | ยืนยันว่าผู้ใช้สั่งให้พิมพ์จริงอย่างชัดเจน |

ถ้ามี path ที่ระบุโดยตรงไม่พบ ระบบจะหยุดก่อนเริ่มพิมพ์ไฟล์ใด ๆ หากบางไฟล์พิมพ์ไม่สำเร็จหลังเริ่มงาน ระบบจะดำเนินการกับไฟล์ถัดไปและคืนรายการ `submitted` กับ `failed` ให้ตรวจสอบ

### `get_print_queue`

อ่านงานพิมพ์ที่อยู่ในคิวของเครื่องพิมพ์หนึ่งเครื่อง โดยไม่แก้ไขหรือยกเลิกงาน พารามิเตอร์ `printer` เป็นตัวเลือก หากไม่ระบุจะอ่านคิวของเครื่องพิมพ์เริ่มต้น

```text
ดูคิวเครื่องพิมพ์เริ่มต้น
ดูคิวของ Office Printer
```

### Tools เพิ่มเติม

| Tool | หน้าที่ |
|---|---|
| `quick_print` | แปลง flags จาก `/print` แล้ว preview หรือพิมพ์ |
| `cancel_print_jobs` | ยกเลิก job IDs ที่ระบุหรือทุก job ของเครื่องพิมพ์ |
| `stop_all_printing` | ยกเลิกงานที่ยังค้างอยู่ในทุก Windows print queue |
| `get_print_history` | อ่านประวัติงานที่ส่งผ่าน Printer MCP สูงสุด 500 รายการ |
| `retry_print_job` | พิมพ์ไฟล์และ options เดิมด้วย history ID |
| `get_print_settings` | อ่าน aliases, profiles และ safety settings |
| `set_printer_alias` | เพิ่มหรือเปลี่ยน printer alias หลังตรวจว่าเครื่องพิมพ์มีอยู่จริง |
| `set_path_alias` | เพิ่มหรือเปลี่ยน path alias หลังตรวจว่า path เข้าถึงได้ |
| `set_print_profile` | เพิ่มหรือเปลี่ยน reusable print profile |
| `remove_print_setting` | ลบ printer alias, path alias หรือ profile |
| `set_print_safety` | ตั้งเกณฑ์จำนวนไฟล์และช่วงเวลาตรวจการพิมพ์ซ้ำ |
| `printer_health_check` | ตรวจ Node, PowerShell, SumatraPDF, Office, apps, printers และ paths |

## Duplicate protection และ large-job safety

- หลังพิมพ์สำเร็จ ระบบบันทึก path, ขนาดไฟล์ และเวลาแก้ไขไว้ใน `data/history.json`
- ถ้าไฟล์เดิมถูกสั่งซ้ำภายใน 5 นาที ระบบจะหยุดทั้งงานและแสดง history ID เดิม
- หากตั้งใจพิมพ์ซ้ำ ให้ใช้ `--force` หรือบอก Codex ให้ force
- ถ้างานมีมากกว่า 20 ไฟล์ ระบบจะหยุดและแสดงจำนวนไฟล์/ประมาณจำนวนหน้า
- เปลี่ยนค่าได้ด้วย `set_print_safety` หรือใน `data/settings.json`

ระบบบันทึกประวัติสูงสุด 500 งาน และแต่ละงานได้รับ UUID สำหรับ `/retry <history-id>`

## ระบบความปลอดภัย

การพิมพ์และยกเลิกคิวมีผลภายนอก ดังนั้น `print_paths`, `quick_print`, `retry_print_job` และ `cancel_print_jobs` จึงถูกประกาศเป็น write/destructive MCP tools และบังคับให้ส่ง `confirmed: true`

Codex ควรตั้งค่า `confirmed: true` เฉพาะเมื่อผู้ใช้สั่งพิมพ์อย่างชัดเจน เช่น `พิมพ์ไฟล์นี้`, `พิมพ์ PDF ใน batch1` หรือ `/print D:\Invoices\batch1`

คำขอประเภท `ดู`, `เช็ก`, `ตรวจ`, `มีไฟล์อะไรบ้าง` หรือ `ถ้าพิมพ์จะมีอะไรบ้าง` ต้องใช้ `inspect_print_job` และต้องไม่สร้างงานพิมพ์

## ความต้องการของระบบ

- Windows 10 หรือ Windows 11
- Node.js 20 ขึ้นไป
- npm
- เครื่องพิมพ์ที่ติดตั้งและใช้งานได้ใน Windows
- Microsoft Office desktop สำหรับไฟล์ Word, Excel และ PowerPoint
- สิทธิ์อ่านไฟล์และ network share ที่ต้องการพิมพ์

ตรวจสอบเวอร์ชัน:

```powershell
node --version
npm --version
codex --version
```

## การติดตั้ง

เปิด PowerShell แล้วรัน:

```powershell
$installPath = Join-Path $env:USERPROFILE '.codex\mcp-servers\printer-mcp'
git clone https://github.com/riniort/printer-mcp.git $installPath
Set-Location -LiteralPath $installPath
npm install
npm run check
npm test
```

`npm test` เป็น smoke test แบบไม่พิมพ์จริง โดยตรวจ MCP tools 17 รายการ, prompts 5 รายการ, `/print stop`, quick flags, settings, printer list, inspection, page estimation, queue และ health check

## เชื่อมต่อกับ Codex

เพิ่ม MCP server ด้วย Codex CLI:

```powershell
$entryPoint = Join-Path $env:USERPROFILE '.codex\mcp-servers\printer-mcp\src\index.js'
codex mcp add printer -- node $entryPoint
```

หรือเพิ่มลงใน `%USERPROFILE%\.codex\config.toml` ด้วยตนเอง:

```toml
[mcp_servers.printer]
command = "node"
args = ['C:\Users\YOUR_USERNAME\.codex\mcp-servers\printer-mcp\src\index.js']
startup_timeout_sec = 30.0
tool_timeout_sec = 300.0
```

ตรวจสอบการตั้งค่า:

```powershell
codex mcp get printer
codex mcp list
```

หลังเพิ่มหรือแก้ไข MCP server ให้ปิดและเปิด Codex ใหม่ เพื่อให้ Codex โหลด tools และ prompt `/print` ชุดล่าสุด

## รัน server ด้วยตนเอง

```powershell
Set-Location -LiteralPath (Join-Path $env:USERPROFILE '.codex\mcp-servers\printer-mcp')
npm start
```

server ใช้ MCP `stdio` จึงรอรับ JSON-RPC จาก MCP client และปกติจะไม่แสดงหน้าเว็บหรือหน้าต่างโปรแกรม เมื่อใช้งานผ่าน Codex ไม่จำเป็นต้องรัน `npm start` เอง เพราะ Codex จะเริ่ม process ให้ตาม `config.toml`

## ทดสอบกับโฟลเดอร์จริงโดยไม่พิมพ์

กำหนดตัวแปร `PRINTER_MCP_TEST_PATH` เพื่อให้ smoke test ตรวจไฟล์ PDF ใน path ที่ต้องการ:

```powershell
$env:PRINTER_MCP_TEST_PATH = '\\server\share\batch1'
npm test
Remove-Item Env:PRINTER_MCP_TEST_PATH
```

คำสั่งนี้เรียก `inspect_print_job` เท่านั้นและไม่ส่งงานพิมพ์จริง

## โครงสร้างโปรเจกต์

```text
printer-mcp/
├─ data/
│  ├─ settings.json  aliases, profiles และ safety settings
│  └─ history.json   ประวัติงานสำหรับ duplicate check และ retry
├─ src/
│  ├─ index.js          MCP server, prompts และ tools
│  ├─ quick-command.js  parser สำหรับ `/print` flags
│  ├─ storage.js        settings, history และ file signatures
│  └─ printers.ps1      Windows printer, Office, image และ text integration
├─ test/
│  └─ smoke.mjs      MCP smoke test แบบไม่พิมพ์จริง
├─ package.json
├─ package-lock.json
├─ LICENSE
├─ README.md
└─ README.th.md
```

## การพัฒนา

```powershell
npm run check
npm test
```

ไฟล์หลักคือ `src/index.js` ซึ่งประกาศ MCP prompts และ tools, `src/quick-command.js` แปลง flags, `src/storage.js` จัดการ settings/history และ `src/printers.ps1` จัดการ Windows printers กับโปรแกรมที่เหมาะสมตามชนิดไฟล์

ห้ามเขียนข้อความทั่วไปลง `stdout` ของ server เพราะ `stdout` ใช้ส่ง MCP JSON-RPC เท่านั้น หากต้องบันทึก diagnostic information ให้เขียนลง `stderr`

## การแก้ปัญหา

### ไม่พบ `/print`

1. ตรวจว่า MCP ถูกติดตั้งด้วย `codex mcp get printer`
2. เข้า `%USERPROFILE%\.codex\mcp-servers\printer-mcp` แล้วรัน `npm test`
3. ปิด Codex ให้หมดแล้วเปิดใหม่

### ไม่พบเครื่องพิมพ์

ตรวจสอบใน Windows Settings > Bluetooth & devices > Printers & scanners และทดลอง:

```powershell
Get-Printer | Select-Object Name, DriverName, PortName
```

หากไม่มีเครื่องพิมพ์เริ่มต้น ให้กำหนด default printer ใน Windows หรือระบุชื่อเครื่องพิมพ์ในคำสั่ง

### พิมพ์ PDF ไม่สำเร็จ

- รัน `npm install` อีกครั้งเพื่อให้ไฟล์ของ `pdf-to-printer` ครบ
- ตรวจว่า antivirus ไม่ได้กัก SumatraPDF ที่มากับแพ็กเกจ
- ตรวจชื่อเครื่องพิมพ์ด้วย `list_printers`
- ลองพิมพ์ PDF หนึ่งไฟล์ก่อนพิมพ์ทั้งโฟลเดอร์

### พิมพ์ Word, Excel หรือ PowerPoint ไม่สำเร็จ

- ตรวจว่ามี Microsoft Office desktop ติดตั้งอยู่
- เปิดไฟล์ด้วยโปรแกรม Office ที่เกี่ยวข้องเพื่อยืนยันว่าไฟล์ไม่เสีย
- ปิดกล่องโต้ตอบหรือหน้าต่าง Office ที่รอการตอบจากผู้ใช้
- ตรวจว่า Office สามารถพิมพ์ไปยังเครื่องพิมพ์เดียวกันได้ตามปกติ

### เปิด UNC path ไม่ได้

ทดลองอ่าน path จาก PowerShell ด้วยบัญชี Windows เดียวกับที่เปิด Codex:

```powershell
Get-ChildItem -LiteralPath '\\server\share\folder'
```

หากล้มเหลว ให้ตรวจ network/VPN, สิทธิ์ของ share และ Windows credentials ก่อน

### งานพิมพ์ใช้เวลานานหรือ timeout

เพิ่ม `tool_timeout_sec` ใน `%USERPROFILE%\.codex\config.toml` เช่น:

```toml
tool_timeout_sec = 600.0
```

จากนั้นเปิด Codex ใหม่ งานที่มีไฟล์จำนวนมากควรแบ่งเป็น batch เพื่อให้ติดตามไฟล์ที่สำเร็จหรือล้มเหลวได้ง่าย

## ข้อจำกัดปัจจุบัน

- `/print` ใช้ค่าเริ่มต้น 1 ชุดและไม่ค้นโฟลเดอร์ย่อย
- ตัวเลือกหน้า, orientation, monochrome และ duplex ถูกส่งให้ตัวพิมพ์ PDF โดยตรง ส่วนไฟล์ชนิดอื่นขึ้นกับโปรแกรม Office หรือ Windows application ที่ใช้พิมพ์
- รูปภาพและข้อความพิมพ์ผ่าน Windows `System.Drawing` และไม่เปิด Paint หรือ Notepad
- การยกเลิกงานทำได้เฉพาะงานที่ยังอยู่ใน Windows print queue; งานที่เครื่องพิมพ์รับไปแล้วอาจยกเลิกไม่ทัน
- เครื่องพิมพ์เสมือน เช่น Microsoft Print to PDF อาจเปิดหน้าต่างให้เลือกชื่อไฟล์ จึงไม่เหมาะกับงาน unattended
- server ไม่มี authentication ของตัวเอง เพราะออกแบบให้รันเฉพาะบนเครื่องผู้ใช้ผ่าน local `stdio`

## ถอนการเชื่อมต่อจาก Codex

```powershell
codex mcp remove printer
```

คำสั่งนี้นำ MCP ออกจากการตั้งค่า Codex แต่ไม่ลบไฟล์ใน `%USERPROFILE%\.codex\mcp-servers\printer-mcp`

## License

เผยแพร่ภายใต้ [MIT License](LICENSE) สามารถนำไปใช้ แก้ไข แจกจ่าย ให้สิทธิ์ต่อ และใช้เชิงพาณิชย์ได้ โดยต้องเก็บข้อความลิขสิทธิ์และข้อความอนุญาตไว้ ซอฟต์แวร์นี้ไม่มีการรับประกัน
