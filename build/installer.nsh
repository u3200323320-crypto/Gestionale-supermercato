!macro customInstall
  IfFileExists "$INSTDIR\.initial-setup-done" initial_setup_done
  StrCpy $1 18
initial_setup_wait:
  DetailPrint "Configurazione iniziale: attendere 3 minuti."
  Sleep 10000
  IntOp $1 $1 - 1
  StrCmp $1 0 initial_setup_complete initial_setup_wait
initial_setup_complete:
  FileOpen $0 "$INSTDIR\.initial-setup-done" w
  FileClose $0
initial_setup_done:
!macroend

!macro customUnInstall
  Delete "$INSTDIR\.initial-setup-done"
!macroend
