' Runs "owdash sync" with no console window (used by the "OW2 dashboard sync" scheduled task), then
' "owdash publish", which updates the public copy on GitHub Pages if one was set up and the stats changed.
Dim fso, root
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
CreateObject("WScript.Shell").Run "cmd /c cd /d """ & root & """ && uv run owdash sync >> ""data\sync.log"" 2>&1 & uv run owdash publish >> ""data\sync.log"" 2>&1", 0, False
