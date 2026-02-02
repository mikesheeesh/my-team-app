# ============================================
# Team Camera App - Advanced Backup Script
# ============================================
# PowerShell version με progress bar και καλύτερη απόδοση
# ============================================

param(
    [switch]$KeepOld = $false,  # Κρατάει παλιά backups
    [int]$MaxBackups = 10       # Μέγιστος αριθμός backups που κρατάει
)

# Χρώματα για console output
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White",
        [switch]$NoNewline
    )
    if ($NoNewline) {
        Write-Host $Message -ForegroundColor $Color -NoNewline
    } else {
        Write-Host $Message -ForegroundColor $Color
    }
}

# Header
Clear-Host
Write-Host ""
Write-ColorOutput "========================================" "Cyan"
Write-ColorOutput "  Team Camera App - Backup Script" "Cyan"
Write-ColorOutput "========================================" "Cyan"
Write-Host ""

# Ορισμός φακέλων
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackupDir = "C:\Users\Michael\BackUp"
$ProjectName = "my-team-app"

# Δημιουργία φακέλου BackUp αν δεν υπάρχει
if (-not (Test-Path $BackupDir)) {
    Write-ColorOutput "[*] Δημιουργία φακέλου BackUp..." "Yellow"
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

# Δημιουργία ονόματος αρχείου με ημερομηνία
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupName = "${ProjectName}_$Timestamp.zip"
$BackupPath = Join-Path $BackupDir $BackupName

Write-ColorOutput "[*] Project Directory: " "Gray" -NoNewline
Write-ColorOutput $ProjectDir "White"
Write-ColorOutput "[*] Backup Directory:  " "Gray" -NoNewline
Write-ColorOutput $BackupDir "White"
Write-ColorOutput "[*] Backup Filename:   " "Gray" -NoNewline
Write-ColorOutput $BackupName "White"
Write-Host ""

# Λίστα φακέλων/αρχείων που θα εξαιρεθούν
$ExcludeDirs = @(
    "node_modules",
    ".git",
    ".expo",
    "BackUp",
    ".next",
    "build",
    "dist",
    ".cache"
)

$ExcludeFiles = @(
    "*.log",
    ".DS_Store",
    "Thumbs.db",
    ".env.local",
    "backup.bat",
    "backup.ps1",
    "backup_exclude.txt"
)

Write-ColorOutput "[*] Εξαίρεση φακέλων: " "Gray" -NoNewline
Write-ColorOutput ($ExcludeDirs -join ", ") "DarkGray"
Write-Host ""

# Συλλογή αρχείων
Write-ColorOutput "[*] Συλλογή αρχείων..." "Yellow"

$FilesToBackup = Get-ChildItem -Path $ProjectDir -Recurse -File | Where-Object {
    $file = $_
    $shouldExclude = $false

    # Έλεγχος αν το αρχείο είναι σε excluded directory
    foreach ($excludeDir in $ExcludeDirs) {
        if ($file.FullName -like "*\$excludeDir\*") {
            $shouldExclude = $true
            break
        }
    }

    # Έλεγχος αν το αρχείο ταιριάζει σε excluded pattern
    foreach ($excludeFile in $ExcludeFiles) {
        if ($file.Name -like $excludeFile) {
            $shouldExclude = $true
            break
        }
    }

    -not $shouldExclude
}

$TotalFiles = $FilesToBackup.Count
$TotalSize = ($FilesToBackup | Measure-Object -Property Length -Sum).Sum
$TotalSizeMB = [math]::Round($TotalSize / 1MB, 2)

Write-ColorOutput "[✓] Βρέθηκαν $TotalFiles αρχεία " "Green" -NoNewline
Write-ColorOutput "($TotalSizeMB MB)" "Gray"
Write-Host ""

# Δημιουργία ZIP με progress
Write-ColorOutput "[*] Δημιουργία ZIP αρχείου..." "Yellow"
Write-ColorOutput "    Αυτό μπορεί να πάρει λίγα δευτερόλεπτα..." "DarkGray"
Write-Host ""

try {
    # Δημιουργία προσωρινού φακέλου
    $TempDir = Join-Path $env:TEMP "my-team-app-backup-$(Get-Date -Format 'yyyyMMddHHmmss')"
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    # Αντιγραφή αρχείων με progress
    $Current = 0
    foreach ($file in $FilesToBackup) {
        $Current++
        $PercentComplete = [math]::Round(($Current / $TotalFiles) * 100, 0)

        Write-Progress -Activity "Αντιγραφή αρχείων" `
                       -Status "$Current από $TotalFiles αρχεία" `
                       -PercentComplete $PercentComplete

        $RelativePath = $file.FullName.Substring($ProjectDir.Length + 1)
        $DestPath = Join-Path $TempDir $RelativePath
        $DestDir = Split-Path -Parent $DestPath

        if (-not (Test-Path $DestDir)) {
            New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
        }

        Copy-Item -Path $file.FullName -Destination $DestPath -Force
    }

    Write-Progress -Activity "Αντιγραφή αρχείων" -Completed

    # Δημιουργία ZIP
    Write-Progress -Activity "Δημιουργία ZIP" -Status "Συμπίεση αρχείων..."
    Compress-Archive -Path "$TempDir\*" -DestinationPath $BackupPath -CompressionLevel Optimal -Force

    # Καθαρισμός προσωρινού φακέλου
    Remove-Item -Path $TempDir -Recurse -Force

    Write-Progress -Activity "Δημιουργία ZIP" -Completed

    # Επιτυχία
    Write-Host ""
    Write-ColorOutput "========================================" "Green"
    Write-ColorOutput "  ✓ BACKUP ΟΛΟΚΛΗΡΩΘΗΚΕ ΕΠΙΤΥΧΩΣ!" "Green"
    Write-ColorOutput "========================================" "Green"
    Write-Host ""

    $BackupFile = Get-Item $BackupPath
    $BackupSizeMB = [math]::Round($BackupFile.Length / 1MB, 2)

    Write-ColorOutput "[✓] Αρχείο:  " "Green" -NoNewline
    Write-ColorOutput $BackupName "White"
    Write-ColorOutput "[✓] Μέγεθος: " "Green" -NoNewline
    Write-ColorOutput "$BackupSizeMB MB" "White"
    Write-ColorOutput "[✓] Τοποθεσία: " "Green" -NoNewline
    Write-ColorOutput $BackupDir "White"
    Write-Host ""

    # Καθαρισμός παλιών backups αν χρειάζεται
    if (-not $KeepOld) {
        Write-ColorOutput "[*] Έλεγχος παλιών backups..." "Yellow"
        $OldBackups = Get-ChildItem -Path $BackupDir -Filter "${ProjectName}_*.zip" |
                      Sort-Object LastWriteTime -Descending |
                      Select-Object -Skip $MaxBackups

        if ($OldBackups) {
            Write-ColorOutput "[*] Διαγραφή $($OldBackups.Count) παλιών backups..." "Yellow"
            $OldBackups | Remove-Item -Force
        }
    }

    # Άνοιγμα φακέλου BackUp
    Write-ColorOutput "[*] Άνοιγμα φακέλου BackUp..." "Cyan"
    Start-Process explorer.exe $BackupDir

} catch {
    # Σφάλμα
    Write-Host ""
    Write-ColorOutput "========================================" "Red"
    Write-ColorOutput "  ✗ ΣΦΑΛΜΑ ΚΑΤΑ ΤΟ BACKUP" "Red"
    Write-ColorOutput "========================================" "Red"
    Write-Host ""
    Write-ColorOutput "[✗] $($_.Exception.Message)" "Red"
    Write-Host ""

    # Καθαρισμός
    if (Test-Path $TempDir) {
        Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-ColorOutput "Πάτησε οποιοδήποτε πλήκτρο για έξοδο..." "Gray"
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
