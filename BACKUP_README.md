# Backup Scripts - Ergon Work Management

## Διαθέσιμα Scripts

### `backup.bat` (Απλό)
Double-click → Δημιουργεί ZIP backup → Ανοίγει φάκελο BackUp

### `backup.ps1` (Advanced)
Progress bar, auto-cleanup (κρατάει 10 πιο πρόσφατα), detailed errors

```powershell
.\backup.ps1              # Βασική χρήση
.\backup.ps1 -KeepOld     # Χωρίς cleanup
.\backup.ps1 -MaxBackups 5  # Κράτα 5 πιο πρόσφατα
```

Αν execution policy error: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

## Αποθήκευση
- **Τοποθεσία:** `C:\Users\Michael\BackUp\`
- **Ονομασία:** `my-team-app_YYYY-MM-DD_HH-MM-SS.zip`

## Εξαιρούνται
`node_modules/`, `.git/`, `.expo/`, `BackUp/`, build outputs, `.env.local`, log files
