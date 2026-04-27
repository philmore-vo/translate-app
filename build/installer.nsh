; Custom NSIS include for EngiLink Dictionary
; Adds an uninstall feedback page before the uninstaller runs.

!include nsDialogs.nsh
!include LogicLib.nsh

Var FbDialog
Var FbReason1
Var FbReason2
Var FbReason3
Var FbReason4
Var FbReason5
Var FbFeedbackText
Var FbReasonState
Var FbFeedbackBody
Var FbMailtoURL

; ============================================================
; Hook: insert custom feedback page right after un-welcome page
; ============================================================
!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.FbPageCreate un.FbPageLeave
!macroend

; ============================================================
; Page: feedback form
; ============================================================
Function un.FbPageCreate
  !insertmacro MUI_HEADER_TEXT "Tiec vi ban roi di" "Cho chung minh biet ly do de cai thien EngiLink Dictionary"

  nsDialogs::Create 1018
  Pop $FbDialog
  ${If} $FbDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateGroupBox} 0 0 100% 95u "Ly do go cai dat (khong bat buoc)"
  Pop $0

  ${NSD_CreateRadioButton} 10 14u 95% 11u "Tim duoc app khac tot hon"
  Pop $FbReason1
  ${NSD_CreateRadioButton} 10 27u 95% 11u "Qua phuc tap, kho dung"
  Pop $FbReason2
  ${NSD_CreateRadioButton} 10 40u 95% 11u "App chay cham hoac bi loi"
  Pop $FbReason3
  ${NSD_CreateRadioButton} 10 53u 95% 11u "Khong con nhu cau su dung"
  Pop $FbReason4
  ${NSD_CreateRadioButton} 10 66u 95% 11u "Ly do khac"
  Pop $FbReason5

  ${NSD_CreateLabel} 0 105u 100% 10u "Phan hoi them (khong bat buoc):"
  Pop $0

  ${NSD_CreateText} 0 117u 100% 35u ""
  Pop $FbFeedbackText

  ${NSD_CreateLabel} 0 158u 100% 24u "Bam 'Next' de mo email mac dinh va gui phan hoi. Bam 'Cancel' de bo qua va go cai dat luon. Toan bo phan tren la tuy chon."
  Pop $0

  nsDialogs::Show
FunctionEnd

; ============================================================
; Leave handler: build mailto: and open default mail client
; ============================================================
Function un.FbPageLeave
  StrCpy $FbReasonState ""

  ${NSD_GetState} $FbReason1 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $FbReasonState "Tim duoc app khac tot hon"
  ${EndIf}
  ${NSD_GetState} $FbReason2 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $FbReasonState "Qua phuc tap, kho dung"
  ${EndIf}
  ${NSD_GetState} $FbReason3 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $FbReasonState "App chay cham hoac bi loi"
  ${EndIf}
  ${NSD_GetState} $FbReason4 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $FbReasonState "Khong con nhu cau su dung"
  ${EndIf}
  ${NSD_GetState} $FbReason5 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $FbReasonState "Ly do khac"
  ${EndIf}

  ${NSD_GetText} $FbFeedbackText $FbFeedbackBody

  ; If user provided any input, open mailto. Otherwise just continue uninstall.
  ${If} $FbReasonState != ""
  ${OrIf} $FbFeedbackBody != ""
    ; Replace spaces with %20 and newlines with %0D%0A in feedback body
    Push $FbFeedbackBody
    Call un.FbUrlEncode
    Pop $FbFeedbackBody

    Push $FbReasonState
    Call un.FbUrlEncode
    Pop $FbReasonState

    StrCpy $FbMailtoURL "mailto:noobailearning@gmail.com?subject=EngiLink%20Dictionary%20Uninstall%20Feedback&body=Reason:%20$FbReasonState%0D%0A%0D%0AFeedback:%20$FbFeedbackBody%0D%0A%0D%0AVersion:%20${VERSION}"
    ExecShell "open" "$FbMailtoURL"
  ${EndIf}
FunctionEnd

; ============================================================
; Helper: minimal URL-encoder for spaces, newlines, &, ?, =, #
; ============================================================
Function un.FbUrlEncode
  Exch $0   ; input
  Push $1
  Push $2
  Push $3
  Push $4
  StrCpy $1 ""
  StrLen $2 $0
  StrCpy $3 0
  ${While} $3 < $2
    StrCpy $4 $0 1 $3
    ${If} $4 == " "
      StrCpy $1 "$1%20"
    ${ElseIf} $4 == "$\r"
      ; skip - \n will produce %0D%0A
    ${ElseIf} $4 == "$\n"
      StrCpy $1 "$1%0D%0A"
    ${ElseIf} $4 == "&"
      StrCpy $1 "$1%26"
    ${ElseIf} $4 == "?"
      StrCpy $1 "$1%3F"
    ${ElseIf} $4 == "="
      StrCpy $1 "$1%3D"
    ${ElseIf} $4 == "#"
      StrCpy $1 "$1%23"
    ${Else}
      StrCpy $1 "$1$4"
    ${EndIf}
    IntOp $3 $3 + 1
  ${EndWhile}
  StrCpy $0 $1
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd
