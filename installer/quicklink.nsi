; QuickLink Windows 服务版安装脚本 (独立 makensis 脚本, 不再依赖 electron-builder)
;
; 文件为 UTF-8 (带 BOM): makensis 无 BOM 时按系统 ANSI 代码页读取, 中文会乱码;
; 构建脚本另外传入 /INPUTCHARSET UTF8 作为双重保险。
;
; 与旧版 Electron 安装包的关键差异:
;   - 安装为 per-machine ($PROGRAMFILES64), 需要管理员权限: 注册 Windows 服务无法在 per-user 下完成
;   - 不再安装 Electron 外壳, 改为 node.exe + 服务端 + 前端静态文件, 由 NSSM 托管为服务
;   - 配置与密钥从 %APPDATA%\QuickLink 迁到 %ProgramData%\QuickLink:
;     服务以 LocalSystem 运行, 其 %APPDATA% 指向 C:\Windows\System32\config\systemprofile, 读不到用户目录
;   - 访问方式改为浏览器打开 http://localhost:3000 (开始菜单/桌面放 .url 快捷方式)

Unicode true

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!ifndef STAGE_DIR
  !define STAGE_DIR "stage"
!endif
!ifndef OUTFILE
  !define OUTFILE "release\QuickLink-Setup-${VERSION}.exe"
!endif

!define PRODUCT_NAME "QuickLink"
!define SERVICE_NAME "QuickLink"
!define APP_PORT     "3000"
!define APP_URL      "http://localhost:${APP_PORT}"
!define UNINST_KEY   "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"

Name "${PRODUCT_NAME} ${VERSION}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES64\${PRODUCT_NAME}"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUnInstDetails show

; ---- MUI 外观 ----
!define MUI_ICON   "assets\icon.ico"
!define MUI_UNICON "assets\icon.ico"
!define MUI_ABORTWARNING
; MUI2 的完成页只有在定义了 MUI_FINISHPAGE_RUN 时才创建那个勾选框, 之后才轮到
; MUI_FINISHPAGE_RUN_FUNCTION 接管点击动作 (二者同时定义时 RUN 的值不会被 Exec),
; 所以这里必须给 RUN 一个值, 否则"立即打开浏览器"选项根本不会出现。
!define MUI_FINISHPAGE_RUN "${APP_URL}"
!define MUI_FINISHPAGE_RUN_FUNCTION "OpenInBrowser"
!define MUI_FINISHPAGE_RUN_TEXT "立即在浏览器中打开 ${PRODUCT_NAME}"
!define MUI_FINISHPAGE_NOREBOOTSUPPORT

; ---- 变量 ----
; NSIS 没有 $PROGRAMDATA 常量, 机器级配置目录必须在运行时解析 (见 InitPaths)
Var ConfigDir
Var DataDirValue        ; 向导中最终选择的数据目录
Var MigrationSource     ; 需要迁移数据的旧目录 (与 DataDirValue 不同时写入 pending_migration.txt)
Var NssmPath
Var ExecOutput
; ReadDirPointer 的出入参 (用独立变量而非 $R 寄存器, 避免与页面函数互相覆盖)
Var PtrFile
Var PtrResult
Var PtrByte
Var PtrChar
Var PtrHandle
; 数据目录页控件句柄 (必须跨 Create/Leave 存活)
Var HwndDirText

; ======================================================================
; 页面
; ======================================================================
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Page custom DataDirPageCreate DataDirPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

; ======================================================================
; 工具函数
; ======================================================================

Function .onInit
  ; 32 位安装器默认操作注册表 32 位视图, 卸载项会落到 WOW6432Node; 本安装是 per-machine 的, 统一用 64 位视图
  SetRegView 64
  ; 服务对所有用户生效, 快捷方式也应放到共用位置 (开始菜单 C:\ProgramData\...\Start Menu, 桌面 C:\Users\Public\Desktop),
  ; 否则只有执行安装的那个账户能看到入口
  SetShellVarContext all
  Call InitPaths
  ; 覆盖安装沿用上次位置。不用 InstallDirRegKey: 它在 .onInit 之前求值, 吃不到上面的 SetRegView
  ReadRegStr $0 HKLM "${UNINST_KEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $INSTDIR $0
  ${EndIf}
FunctionEnd

Function un.onInit
  ; 必须与安装时一致, 否则删不掉 64 位视图的注册表项与 all-users 快捷方式
  SetRegView 64
  SetShellVarContext all
  Call un.InitPaths
FunctionEnd

; 解析机器级配置目录 %ProgramData%\QuickLink。
; 该目录存放 data_dir.txt / pending_migration.txt / jwt_secret.txt / config.json / logs,
; 必须是机器级而非用户级: 服务以 LocalSystem 运行, 且在任何用户登录之前就要启动。
;
; NSIS 要求卸载段只能调用 un. 前缀的函数, 因此实现体放进宏, 安装侧与卸载侧各展开一份。
!macro InitPathsImpl
  ReadEnvStr $ConfigDir "ProgramData"
  ${If} $ConfigDir == ""
    ; 环境变量缺失时退回注册表 (值形如 %SystemDrive%\ProgramData, 需展开)
    ReadRegStr $ConfigDir HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList" "ProgramData"
    ExpandEnvStrings $ConfigDir $ConfigDir
  ${EndIf}
  ${If} $ConfigDir == ""
    ; ProgramData 自 Vista 起固定在系统盘根目录, $WINDIR 的上一级即系统盘根
    StrCpy $ConfigDir "$WINDIR\..\ProgramData"
  ${EndIf}
  StrCpy $ConfigDir "$ConfigDir\QuickLink"
!macroend

Function InitPaths
  !insertmacro InitPathsImpl
FunctionEnd

Function un.InitPaths
  !insertmacro InitPathsImpl
FunctionEnd

; 读取目录指针文件并解码。
; 安装器一律用 FileWriteUTF16LE 写入 (Unicode 安装器中 FileWrite 输出 ANSI 单字节, 中文路径会损坏),
; 因此首选按 UTF-16LE 解析; 早期版本曾误写成 "FF FE + 单字节 ANSI", 此时按字节重建:
; 跳过 NUL 字节后去掉前缀 ÿþ 即为原值 (与 ANSI 代码页无关)。
; 直接 FileRead 按 ANSI 代码页解码会把 FF FE 变成乱码字符, 不能使用。
; 入参: $PtrFile = 文件完整路径; 出参: $PtrResult = 目录 (读不到或非法则为空串)
Function ReadDirPointer
  StrCpy $PtrResult ""
  ${IfNot} ${FileExists} "$PtrFile"
    Return
  ${EndIf}

  FileOpen $PtrHandle "$PtrFile" r
  FileReadUTF16LE $PtrHandle $PtrResult
  ; 合法绝对路径 (如 C:\...) 的第二个字符必为 ":"; 不是则说明是早期误写的编码, 需按字节重建
  StrCpy $PtrChar $PtrResult 1 1
  ${If} $PtrChar != ":"
    FileSeek $PtrHandle 0
    StrCpy $PtrResult ""
    readPtrLoop:
      FileReadByte $PtrHandle $PtrByte
      IfErrors readPtrDone
      ${If} $PtrByte == 0
        Goto readPtrLoop
      ${EndIf}
      IntFmt $PtrChar "%c" $PtrByte
      StrCpy $PtrResult "$PtrResult$PtrChar"
      Goto readPtrLoop
    readPtrDone:
    StrCpy $PtrChar $PtrResult 2
    ${If} $PtrChar == "ÿþ"
      StrCpy $PtrResult $PtrResult "" 2
    ${EndIf}
    StrCpy $PtrChar $PtrResult 1 1
    ${If} $PtrChar != ":"
      StrCpy $PtrResult ""
    ${EndIf}
  ${EndIf}
  FileClose $PtrHandle
FunctionEnd

; 决定数据目录的初始值。按"越新越优先"排列, 目的是升级安装时一定能找到用户既有的数据,
; 而不是安静地建一个空目录让人以为数据丢了。
Function ResolveInitialDataDir
  StrCpy $MigrationSource ""

  ; 1) 服务版上次的选择
  StrCpy $PtrFile "$ConfigDir\data_dir.txt"
  Call ReadDirPointer
  ${If} $PtrResult != ""
    StrCpy $DataDirValue $PtrResult
    StrCpy $MigrationSource $PtrResult
    Return
  ${EndIf}

  ; 2) 旧版 Electron 桌面版的选择
  StrCpy $PtrFile "$APPDATA\QuickLink\data_dir.txt"
  Call ReadDirPointer
  ${If} $PtrResult != ""
    StrCpy $DataDirValue $PtrResult
    StrCpy $MigrationSource $PtrResult
    Return
  ${EndIf}

  ; 3) 旧版默认目录 (用户目录下 .quick_link), 非空则沿用
  ${If} ${FileExists} "$PROFILE\.quick_link\*.*"
    StrCpy $DataDirValue "$PROFILE\.quick_link"
    StrCpy $MigrationSource "$PROFILE\.quick_link"
    Return
  ${EndIf}

  ; 4) 更早期默认目录 (安装目录内 user_data)。数据目录不应留在安装目录里 (卸载会连带删除),
  ;    因此这里把目标定为机器级默认目录, 并把旧目录记为迁移源, 由服务首次启动复制出来。
  ${If} ${FileExists} "$INSTDIR\user_data\*.*"
    StrCpy $DataDirValue "$ConfigDir\data"
    StrCpy $MigrationSource "$INSTDIR\user_data"
    Return
  ${EndIf}

  ; 5) 全新安装: 机器级默认目录。不能用 $PROFILE, 服务以 LocalSystem 运行时读不到登录用户的 profile
  StrCpy $DataDirValue "$ConfigDir\data"
FunctionEnd

Function DataDirPageCreate
  Call ResolveInitialDataDir

  !insertmacro MUI_HEADER_TEXT "选择用户数据目录" "笔记、附件与账号数据的存放位置"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 46u "${PRODUCT_NAME} 将安装为 Windows 服务并开机自动启动，通过浏览器访问 ${APP_URL}。$\r$\n$\r$\n笔记、附件、链接与账号密码将存放在以下目录，卸载软件时该目录中的数据不会被删除。"
  Pop $0
  ${NSD_CreateText} 0 50u 84% 13u "$DataDirValue"
  Pop $HwndDirText
  ${NSD_CreateBrowseButton} 86% 49u 14% 14u "浏览…"
  Pop $0
  ${NSD_OnClick} $0 DataDirBrowse

  nsDialogs::Show
FunctionEnd

Function DataDirBrowse
  ${NSD_GetText} $HwndDirText $0
  nsDialogs::SelectFolderDialog "选择用户数据存放目录" "$0"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $HwndDirText "$0"
  ${EndIf}
FunctionEnd

Function DataDirPageLeave
  ${NSD_GetText} $HwndDirText $DataDirValue
  ${If} $DataDirValue == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "用户数据目录不能为空"
    Abort
  ${EndIf}
  ; 必须是绝对路径 (盘符开头, 如 D:\QuickLinkData): 服务以 LocalSystem 运行, 相对路径无从解析
  StrCpy $0 $DataDirValue 1 1
  ${If} $0 != ":"
    MessageBox MB_OK|MB_ICONEXCLAMATION "请输入绝对路径 (如 D:\QuickLinkData)"
    Abort
  ${EndIf}
  ; 去除结尾反斜杠 (根目录 D:\ 保留)
  StrCpy $0 $DataDirValue "" -1
  ${If} $0 == "\"
    StrLen $0 $DataDirValue
    ${If} $0 > 3
      StrCpy $DataDirValue $DataDirValue -1
    ${EndIf}
  ${EndIf}
FunctionEnd

Function OpenInBrowser
  ExecShell "open" "${APP_URL}"
FunctionEnd

; 停止并移除已有服务。必须在复制文件之前完成: 运行中的 node.exe 会锁住 node.exe 自身与 .db 文件,
; 否则随后的 File 覆盖会失败。全新安装时 $INSTDIR 下还没有 nssm.exe, 用系统 sc 兜底。
!macro StopAndRemoveServiceImpl
  ${If} ${FileExists} "$INSTDIR\nssm\nssm.exe"
    nsExec::ExecToLog '"$INSTDIR\nssm\nssm.exe" stop ${SERVICE_NAME}'
    nsExec::ExecToLog '"$INSTDIR\nssm\nssm.exe" remove ${SERVICE_NAME} confirm'
  ${Else}
    nsExec::ExecToLog '"$SYSDIR\sc.exe" stop ${SERVICE_NAME}'
    nsExec::ExecToLog '"$SYSDIR\sc.exe" delete ${SERVICE_NAME}'
  ${EndIf}
  ; 等待 node.exe 真正退出并释放文件句柄
  Sleep 2000
!macroend

Function StopAndRemoveService
  !insertmacro StopAndRemoveServiceImpl
FunctionEnd

Function un.StopAndRemoveService
  !insertmacro StopAndRemoveServiceImpl
FunctionEnd

Function InstallService
  StrCpy $NssmPath "$INSTDIR\nssm\nssm.exe"

  nsExec::ExecToLog '"$NssmPath" install ${SERVICE_NAME} "$INSTDIR\node\node.exe"'
  ; NSSM 把 AppParameters 原样拼到命令行、自己不补引号, 而安装目录含空格 (C:\Program Files\...),
  ; 所以参数必须自带字面引号 (\$\" 展开成 \"), 否则 node 把 "C:\Program" 当脚本路径:
  ; MODULE_NOT_FOUND -> 进程秒退 -> NSSM 按 AppExit 反复重启, 服务状态显示 PAUSED。
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} AppParameters "\$\"$INSTDIR\server\service.js\$\""'
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} DisplayName "${PRODUCT_NAME}"'
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} Description "QuickLink 链接与笔记收藏服务, 浏览器访问 ${APP_URL}"'
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} AppDirectory "$INSTDIR\server"'
  ; 开机自动启动 (服务在任何用户登录之前就已就绪)
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} Start SERVICE_AUTO_START'
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} ObjectName LocalSystem'

  ; 日志: 重定向 stdout/stderr, 单文件超过 10MB 自动轮转, 避免长期运行占满磁盘
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} AppStdout "$ConfigDir\logs\service.out.log"'
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} AppStderr "$ConfigDir\logs\service.err.log"'
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} AppRotateFiles 1'
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} AppRotateOnline 1'
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} AppRotateBytes 10485760'

  ; 异常退出 5 秒后重启; AppThrottle 让"启动即崩溃"被判定为失败, 而不是无限快速重启
  ; (端口 ${APP_PORT} 被占用是最常见的崩溃原因)
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} AppExit Default Restart'
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} AppRestartDelay 5000'
  nsExec::ExecToLog '"$NssmPath" set ${SERVICE_NAME} AppThrottle 10000'

  nsExec::ExecToLog '"$NssmPath" start ${SERVICE_NAME}'
FunctionEnd

; 启动后确认真的能提供服务。用 HTTP 探测而不是 SCM 服务状态:
; 服务可能显示 RUNNING 而 Express 已经崩在 listen 上 (端口 ${APP_PORT} 被占用时就是如此),
; NSSM 会按 AppExit 策略不停重启, 界面上看着"正常"实则完全不可用。
Function VerifyServiceRunning
  ; 服务端启动要跑数据库迁移, 留出时间
  Sleep 4000
  nsExec::ExecToStack '"$INSTDIR\node\node.exe" "$INSTDIR\server\check-health.js" ${APP_PORT}'
  Pop $0
  Pop $ExecOutput
  ${If} $0 != "0"
    MessageBox MB_OK|MB_ICONEXCLAMATION "QuickLink 服务已安装，但当前无法访问 ${APP_URL}。$\r$\n$\r$\n最常见的原因是端口 ${APP_PORT} 已被其他程序占用。$\r$\n$\r$\n详细日志: $ConfigDir\logs\service.err.log$\r$\n$\r$\n排查后可在开始菜单运行「QuickLink Service Control」重启服务。"
  ${EndIf}
FunctionEnd

Function CreateShortcuts
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"

  ; .url 文件被 Windows 原生当作快捷方式处理, 双击用默认浏览器打开
  ; (内容全为 ASCII; IconFile 路径按 ANSI 写入, 正好是 Windows 解析 .url 时期望的编码)
  FileOpen $0 "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.url" w
  FileWrite $0 "[InternetShortcut]$\r$\n"
  FileWrite $0 "URL=${APP_URL}$\r$\n"
  FileWrite $0 "IconFile=$INSTDIR\icon.ico$\r$\n"
  FileWrite $0 "IconIndex=0$\r$\n"
  FileClose $0

  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\QuickLink Service Control.lnk" "$INSTDIR\quicklink-ctl.cmd" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall QuickLink.lnk" "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"

  FileOpen $0 "$DESKTOP\${PRODUCT_NAME}.url" w
  FileWrite $0 "[InternetShortcut]$\r$\n"
  FileWrite $0 "URL=${APP_URL}$\r$\n"
  FileWrite $0 "IconFile=$INSTDIR\icon.ico$\r$\n"
  FileWrite $0 "IconIndex=0$\r$\n"
  FileClose $0
FunctionEnd

; ======================================================================
; 安装
; ======================================================================
Section "Install" SecInstall
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; 静默安装 (/S) 不经过数据目录页, $DataDirValue 为空; 若不兜底解析就会把 data_dir.txt
  ; 覆盖成空串, 服务随后回退到默认目录, 用户既有数据看起来像"丢了"。
  ${If} $DataDirValue == ""
    Call ResolveInitialDataDir
  ${EndIf}

  Call StopAndRemoveService

  File "assets\icon.ico"
  File "assets\quicklink-ctl.cmd"
  ; 构建脚本预先拼装好的载荷: node/ + server/ + public/ + nssm/
  File /r "${STAGE_DIR}\*.*"

  WriteUninstaller "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"

  ; ---- 机器级配置 ----
  CreateDirectory "$ConfigDir"
  CreateDirectory "$ConfigDir\logs"
  ; 目录创建失败 (权限/非法路径) 不阻断安装: 服务启动时会回退默认目录并在日志中留痕
  ClearErrors
  CreateDirectory "$DataDirValue"

  ; 交接旧版 JWT 密钥, 避免升级后所有已登录会话失效
  nsExec::ExecToLog '"$INSTDIR\node\node.exe" "$INSTDIR\server\migrate-legacy.js"'

  ; 写入本次选择的数据目录 (UTF-16LE, 见 ReadDirPointer 说明)
  FileOpen $0 "$ConfigDir\data_dir.txt" w
  FileWriteUTF16LE $0 "$DataDirValue"
  FileClose $0

  ; 数据目录发生变化时提示服务首次启动迁移 (仅复制不删除; 目标非空则丢弃提示, 判定在 service.js)
  ${If} $MigrationSource != ""
  ${AndIf} $MigrationSource != $DataDirValue
    FileOpen $0 "$ConfigDir\pending_migration.txt" w
    FileWriteUTF16LE $0 "$MigrationSource"
    FileClose $0
  ${EndIf}

  Call InstallService
  Call VerifyServiceRunning
  Call CreateShortcuts

  ; ---- 控制面板「程序和功能」卸载项 ----
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName"     "${PRODUCT_NAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon"     "$INSTDIR\icon.ico"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher"       "QuickLink"
  WriteRegStr HKLM "${UNINST_KEY}" "URLInfoAbout"    "${APP_URL}"
  WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"'
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1
SectionEnd

; ======================================================================
; 卸载
; ======================================================================
Section "Uninstall"
  ; 必须先停服务再删文件: 运行中的 node.exe 锁住自身与 .db 文件
  Call un.StopAndRemoveService

  ; 极早期版本把数据放在安装目录内, 备份出去避免连带删除。
  ; 新版安装器遇到该布局会把数据目录改到 $ConfigDir\data 并迁移, 此处仅为兜底。
  ${If} ${FileExists} "$INSTDIR\user_data\*.*"
    CreateDirectory "$APPDATA\QuickLink"
    ; /E 含空目录递归 /I 目标按目录处理 /Q 静默 /Y 覆盖不询问 /H 含隐藏 /K 保留属性 /R 覆盖只读 /C 遇错继续
    nsExec::ExecToLog '"$SYSDIR\xcopy.exe" "$INSTDIR\user_data" "$APPDATA\QuickLink\user_data" /E /I /Q /Y /H /K /R /C'
  ${EndIf}

  Delete "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\quicklink-ctl.cmd"
  RMDir /r "$INSTDIR"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.url"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\QuickLink Service Control.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall QuickLink.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"
  Delete "$DESKTOP\${PRODUCT_NAME}.url"

  DeleteRegKey HKLM "${UNINST_KEY}"

  ; 有意不删除 $ConfigDir (%ProgramData%\QuickLink): 默认数据目录就在其中, 且保留 config.json
  ; 可让重装后沿用同一 JWT 密钥 (用户无需重新登录)。用户自选的数据目录同理保留。
SectionEnd
