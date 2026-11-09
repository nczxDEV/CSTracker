!define CST_INSTALLER_SOURCE "${__FILEDIR__}"
!macro CST_STOP_INSTALLED_APP
  InitPluginsDir
  File /oname=$PLUGINSDIR\cstracker-stop.ps1 "${CST_INSTALLER_SOURCE}\stop-installed-app.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\cstracker-stop.ps1" -InstallDirectory "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Please use Quit CS Tracker Completely, then run this installer again." /SD IDOK
    Abort
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro CST_STOP_INSTALLED_APP
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CST_STOP_INSTALLED_APP
!macroend
