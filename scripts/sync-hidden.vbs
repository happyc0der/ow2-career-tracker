' Runs "owdash sync" with no console window (used by the "OW2 dashboard sync" scheduled task).
Dim fso, root
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
CreateObject("WScript.Shell").Run "cmd /c cd /d """ & root & """ && uv run owdash sync >> ""data\sync.log"" 2>&1", 0, False
