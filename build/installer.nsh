!macro customInstall
  IfFileExists "$INSTDIR\.initial-setup-done" initial_setup_done
  FileOpen $0 "$INSTDIR\.initial-setup-done" w
  FileClose $0
initial_setup_done:
!macroend

!macro customUnInstall
  Delete "$INSTDIR\.initial-setup-done"
!macroend
