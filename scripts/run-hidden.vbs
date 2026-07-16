' Runs the given command with no visible window. Scheduled tasks launch
' console apps in a visible console; routing them through wscript avoids
' the window flash.
Dim sh, cmd, i
Set sh = CreateObject("Wscript.Shell")
cmd = ""
For i = 0 To WScript.Arguments.Count - 1
  cmd = cmd & """" & WScript.Arguments(i) & """ "
Next
If Len(cmd) > 0 Then sh.Run Trim(cmd), 0, False
