param([Parameter(Mandatory = $true)][string]$InstallDirectory)
$ErrorActionPreference = 'Stop'
try {
    # Never stop by process name alone: other checkouts and development servers stay running.
    $directory = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
    if (-not [IO.Path]::IsPathRooted($InstallDirectory) -or $directory -eq [IO.Path]::GetPathRoot($directory).TrimEnd('\')) {
        throw 'Invalid installation directory'
    }
    $targets = @('cs2-overlay-frontend.exe', 'cs2-overlay-backend.exe') | ForEach-Object { Join-Path $directory $_ }
    foreach ($process in Get-Process -Name 'cs2-overlay-frontend', 'cs2-overlay-backend' -ErrorAction SilentlyContinue) {
        # Inaccessible paths are not guessed or killed.
        if ($process.Path -and $targets -contains $process.Path) {
            if ($process.CloseMainWindow()) { $null = $process.WaitForExit(2000) }
            if (-not $process.HasExited) { $process.Kill() }
            if (-not $process.WaitForExit(10000)) { throw 'CS Tracker is still running' }
        }
    }
    exit 0
} catch {
    Write-Error "Could not stop the installed CS Tracker. Use Quit CS Tracker Completely and retry installation." -ErrorAction Continue
    exit 1
}
