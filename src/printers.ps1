param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('list', 'queue', 'print', 'cancel', 'health')]
    [string]$Mode,
    [string]$FilePath,
    [string]$PrinterName,
    [ValidateRange(1, 20)]
    [int]$Copies = 1,
    [string]$JobIds,
    [switch]$AllJobs
)

$ErrorActionPreference = 'Stop'

function Get-DefaultPrinterName {
    $default = Get-CimInstance Win32_Printer | Where-Object Default | Select-Object -First 1
    if ($null -eq $default) { return $null }
    return $default.Name
}

if ($Mode -eq 'list') {
    $items = @(Get-CimInstance Win32_Printer | Sort-Object Name | ForEach-Object {
        [pscustomobject]@{
            name       = $_.Name
            isDefault  = [bool]$_.Default
            isOffline  = [bool]$_.WorkOffline
            isNetwork  = [bool]$_.Network
            status     = [string]$_.Status
            driverName = [string]$_.DriverName
            portName   = [string]$_.PortName
        }
    })
    ConvertTo-Json -InputObject $items -Depth 4 -Compress
    exit 0
}

if ($Mode -eq 'health') {
    $sumatra = Join-Path $PSScriptRoot '..\node_modules\pdf-to-printer\dist\SumatraPDF-3.4.6-32.exe'
    $systemDrawing = $true
    try { Add-Type -AssemblyName System.Drawing -ErrorAction Stop }
    catch { $systemDrawing = $false }
    [pscustomobject]@{
        powershellVersion = $PSVersionTable.PSVersion.ToString()
        printManagement   = [bool](Get-Command Get-Printer -ErrorAction SilentlyContinue)
        sumatraPdf        = Test-Path -LiteralPath $sumatra -PathType Leaf
        word              = $null -ne [type]::GetTypeFromProgID('Word.Application')
        excel             = $null -ne [type]::GetTypeFromProgID('Excel.Application')
        powerPoint        = $null -ne [type]::GetTypeFromProgID('PowerPoint.Application')
        systemDrawing     = $systemDrawing
        silentMode        = $true
    } | ConvertTo-Json -Depth 4 -Compress
    exit 0
}

if ([string]::IsNullOrWhiteSpace($PrinterName)) {
    $PrinterName = Get-DefaultPrinterName
}
if ([string]::IsNullOrWhiteSpace($PrinterName)) {
    throw 'No default Windows printer is configured.'
}
if (-not (Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue)) {
    throw "Printer '$PrinterName' is not installed."
}

if ($Mode -eq 'queue') {
    $jobs = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue | ForEach-Object {
        [pscustomobject]@{
            id         = $_.ID
            document   = $_.DocumentName
            user       = $_.UserName
            status     = [string]$_.JobStatus
            sizeBytes  = $_.Size
            submitted  = $_.SubmittedTime
        }
    })
    [pscustomobject]@{ printer = $PrinterName; jobs = $jobs } | ConvertTo-Json -Depth 5 -Compress
    exit 0
}

if ($Mode -eq 'cancel') {
    $jobs = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue)
    if (-not $AllJobs) {
        $requested = @($JobIds -split ',' | ForEach-Object { if ($_ -match '^\d+$') { [int]$_ } })
        if ($requested.Count -eq 0) { throw 'Provide at least one print job ID or use AllJobs.' }
        $jobs = @($jobs | Where-Object { $requested -contains $_.ID })
    }
    $cancelled = @()
    foreach ($job in $jobs) {
        Remove-PrintJob -PrinterName $PrinterName -ID $job.ID -ErrorAction Stop
        $cancelled += [pscustomobject]@{ id = $job.ID; document = $job.DocumentName }
    }
    [pscustomobject]@{ printer = $PrinterName; cancelled = $cancelled } | ConvertTo-Json -Depth 5 -Compress
    exit 0
}

if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
    throw "File not found: $FilePath"
}

$extension = [IO.Path]::GetExtension($FilePath).ToLowerInvariant()
$wordExtensions = @('.doc', '.docx', '.docm', '.rtf')
$excelExtensions = @('.xls', '.xlsx', '.xlsm', '.csv')
$powerPointExtensions = @('.ppt', '.pptx', '.pptm')

if ($wordExtensions -contains $extension) {
    $app = New-Object -ComObject Word.Application
    try {
        $app.Visible = $false
        $app.DisplayAlerts = 0
        $app.ActivePrinter = $PrinterName
        $document = $app.Documents.Open($FilePath, $false, $true)
        try { $document.PrintOut($false, $false, 0, '', '', '', 0, $Copies) }
        finally { $document.Close(0) }
    }
    finally { $app.Quit() }
    exit 0
}

if ($excelExtensions -contains $extension) {
    $app = New-Object -ComObject Excel.Application
    try {
        $app.Visible = $false
        $app.DisplayAlerts = $false
        $workbook = $app.Workbooks.Open($FilePath, 0, $true)
        try { $workbook.PrintOut($null, $null, $Copies, $false, $PrinterName) }
        finally { $workbook.Close($false) }
    }
    finally { $app.Quit() }
    exit 0
}

if ($powerPointExtensions -contains $extension) {
    $app = New-Object -ComObject PowerPoint.Application
    try {
        $presentation = $app.Presentations.Open($FilePath, $true, $false, $false)
        try {
            $presentation.PrintOptions.ActivePrinter = $PrinterName
            1..$Copies | ForEach-Object { $presentation.PrintOut() }
        }
        finally { $presentation.Close() }
    }
    finally { $app.Quit() }
    exit 0
}

if (@('.txt', '.log') -contains $extension) {
    Add-Type -AssemblyName System.Drawing
    $document = New-Object System.Drawing.Printing.PrintDocument
    $font = New-Object System.Drawing.Font('Consolas', 10)
    $state = [pscustomobject]@{ Lines = [IO.File]::ReadAllLines($FilePath); Index = 0 }
    try {
        $document.PrinterSettings.PrinterName = $PrinterName
        $document.PrinterSettings.Copies = [int16]$Copies
        $document.PrintController = New-Object System.Drawing.Printing.StandardPrintController
        $document.DocumentName = [IO.Path]::GetFileName($FilePath)
        $document.add_PrintPage({
            param($sender, $eventArgs)
            $lineHeight = $font.GetHeight($eventArgs.Graphics)
            $linesPerPage = [Math]::Max(1, [Math]::Floor($eventArgs.MarginBounds.Height / $lineHeight))
            $printed = 0
            while ($state.Index -lt $state.Lines.Length -and $printed -lt $linesPerPage) {
                $y = $eventArgs.MarginBounds.Top + ($printed * $lineHeight)
                $eventArgs.Graphics.DrawString($state.Lines[$state.Index], $font, [Drawing.Brushes]::Black, $eventArgs.MarginBounds.Left, $y)
                $state.Index++
                $printed++
            }
            $eventArgs.HasMorePages = $state.Index -lt $state.Lines.Length
        })
        $document.Print()
    }
    finally { $font.Dispose(); $document.Dispose() }
    exit 0
}

if (@('.bmp', '.gif', '.jpg', '.jpeg', '.png', '.tif', '.tiff') -contains $extension) {
    Add-Type -AssemblyName System.Drawing
    $image = [Drawing.Image]::FromFile($FilePath)
    $document = New-Object System.Drawing.Printing.PrintDocument
    try {
        $document.PrinterSettings.PrinterName = $PrinterName
        $document.PrinterSettings.Copies = [int16]$Copies
        $document.PrintController = New-Object System.Drawing.Printing.StandardPrintController
        $document.DocumentName = [IO.Path]::GetFileName($FilePath)
        $document.add_PrintPage({
            param($sender, $eventArgs)
            $bounds = $eventArgs.MarginBounds
            $scale = [Math]::Min($bounds.Width / $image.Width, $bounds.Height / $image.Height)
            $width = [int]($image.Width * $scale)
            $height = [int]($image.Height * $scale)
            $x = $bounds.Left + [int](($bounds.Width - $width) / 2)
            $y = $bounds.Top + [int](($bounds.Height - $height) / 2)
            $eventArgs.Graphics.DrawImage($image, $x, $y, $width, $height)
            $eventArgs.HasMorePages = $false
        })
        $document.Print()
    }
    finally { $document.Dispose(); $image.Dispose() }
    exit 0
}

throw "Unsupported extension '$extension'. Silent mode will not open an associated desktop application as a fallback."
