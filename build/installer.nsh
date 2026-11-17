!ifndef BUILD_UNINSTALLER
!include nsDialogs.nsh

Var TaskbarPinCheckbox
Var TaskbarPinSelected
Var StartupCheckbox
Var StartupSelected

!macro customPageAfterChangeDir
  Page custom TaskbarPinPageCreate TaskbarPinPageLeave
!macroend

Function TaskbarPinPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 24u "Vuoi aggiungere l'app alla barra delle applicazioni?"
  Pop $1
  ${NSD_CreateCheckbox} 0 34u 100% 14u "Aggiungi Gestione Supermercato alla barra delle applicazioni"
  Pop $TaskbarPinCheckbox
  ${NSD_Uncheck} $TaskbarPinCheckbox
  ${NSD_CreateCheckbox} 0 54u 100% 14u "Avvia Gestione Supermercato all'avvio di Windows"
  Pop $StartupCheckbox
  ${NSD_Uncheck} $StartupCheckbox
  nsDialogs::Show
FunctionEnd

Function TaskbarPinPageLeave
  ${NSD_GetState} $TaskbarPinCheckbox $0
  StrCpy $TaskbarPinSelected "false"
  StrCmp $0 1 taskbar_pin_checked
  Goto startup_option
taskbar_pin_checked:
  StrCpy $TaskbarPinSelected "true"
startup_option:
  ${NSD_GetState} $StartupCheckbox $0
  StrCpy $StartupSelected "false"
  StrCmp $0 1 startup_checked
  Return
startup_checked:
  StrCpy $StartupSelected "true"
FunctionEnd
!endif

!macro customInstall
  IfFileExists "$INSTDIR\.initial-setup-done" initial_setup_done
  FileOpen $0 "$INSTDIR\.initial-setup-done" w
  FileClose $0
initial_setup_done:
  StrCmp $TaskbarPinSelected "true" 0 taskbar_pin_done
  IfFileExists "$newStartMenuLink" 0 taskbar_pin_done
  FileOpen $0 "$PLUGINSDIR\pin-taskbar.vbs" w
  FileWrite $0 "On Error Resume Next$\r$\n"
  FileWrite $0 "Set shell = CreateObject($\"Shell.Application$\")$\r$\n"
  FileWrite $0 "Set fso = CreateObject($\"Scripting.FileSystemObject$\")$\r$\n"
  FileWrite $0 "linkPath = WScript.Arguments(0)$\r$\n"
  FileWrite $0 "Set folder = shell.Namespace(fso.GetParentFolderName(linkPath))$\r$\n"
  FileWrite $0 "Set item = folder.ParseName(fso.GetFileName(linkPath))$\r$\n"
  FileWrite $0 "For Each verb In item.Verbs$\r$\n"
  FileWrite $0 "  name = LCase(Replace(verb.Name, $\"&$\", $\"$\"))$\r$\n"
  FileWrite $0 "  If InStr(name, $\"pin to taskbar$\") > 0 Or InStr(name, $\"aggiungi alla barra delle applicazioni$\") > 0 Then verb.DoIt$\r$\n"
  FileWrite $0 "Next$\r$\n"
  FileClose $0
  ExecWait '"$SYSDIR\wscript.exe" "$PLUGINSDIR\pin-taskbar.vbs" "$newStartMenuLink"' $1
taskbar_pin_done:
  StrCmp $StartupSelected "true" startup_enabled
  Delete "$SMSTARTUP\Gestione Supermercato.lnk"
  Goto startup_done
startup_enabled:
  CreateDirectory "$SMSTARTUP"
  CreateShortCut "$SMSTARTUP\Gestione Supermercato.lnk" "$INSTDIR\Gestione Supermercato.exe"
startup_done:
!macroend

!macro customUnInstall
  Delete "$INSTDIR\.initial-setup-done"
  Delete "$SMSTARTUP\Gestione Supermercato.lnk"
!macroend
