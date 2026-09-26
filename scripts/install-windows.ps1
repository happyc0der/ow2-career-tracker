<#
  install-windows.ps1 : set up the OW2 dashboard on this Windows user account (no Admin needed).
    - scheduled task "OW2 dashboard sync": syncs your career stats every 3 hours (and 5 min after logon)
    - Start menu shortcut "OW2 Career Tracker": opens the dashboard
  Run again any time; it replaces the existing task/shortcut. Remove with:  install-windows.ps1 -Uninstall
#>
param([switch]$Uninstall)
$root = Split-Path $PSScriptRoot -Parent
$task = 'OW2 dashboard sync'
$lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'OW2 Career Tracker.lnk'

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item $lnk -ErrorAction SilentlyContinue
    'Removed the scheduled task and the Start menu shortcut.'; return
}

$act = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wscript.exe" -Argument "`"$root\scripts\sync-hidden.vbs`""
$every3h = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 3)
$logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME; $logon.Delay = 'PT5M'
$set = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$prn = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $task -Action $act -Trigger $every3h, $logon -Settings $set -Principal $prn `
    -Description "Snapshots Overwatch 2 career stats for the dashboard in $root" -Force | Out-Null
"Scheduled task '$task' registered (every 3 hours + 5 min after logon)."

$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = "$root\scripts\start-dashboard.cmd"; $s.WorkingDirectory = $root; $s.Description = 'Open the OW2 career dashboard'
$s.Save()
"Start menu shortcut created: $lnk"
