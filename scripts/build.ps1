<#
.SYNOPSIS
  编译 DSH 万用壁纸补丁。

.DESCRIPTION
  需要 .NET Framework 4.x 自带的 csc.exe（Windows 上一般都有）。
  皮肤包不参与编译 —— 它是纯 JS，直接由安装包内嵌或手动复制。

.PARAMETER Setup
  额外编译「一键安装包」（内嵌主程序 + 使用说明）。

.PARAMETER OutDir
  产物目录，默认 build。

.EXAMPLE
  .\scripts\build.ps1
  .\scripts\build.ps1 -Setup
#>
[CmdletBinding()]
param(
    [switch]$Setup,
    [string]$OutDir = 'build'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$skin = Join-Path $root 'skin'
$src = Join-Path $root 'src'
$out = Join-Path $root $OutDir
$name = 'DSH万用壁纸补丁'
$readme = Join-Path $root 'docs\使用说明.md'

function Find-Csc {
    $cands = @(
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
    )
    foreach ($c in $cands) { if (Test-Path $c) { return $c } }
    $cmd = Get-Command csc.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw '找不到 csc.exe —— 需要 .NET Framework 4.x'
}

$csc = Find-Csc
Write-Host "编译器: $csc"
New-Item -ItemType Directory -Force -Path $out | Out-Null

# 皮肤包以 /resource: 方式内嵌，资源名必须和 Suite.cs 里的 Skin.ReadText() 一致。
$resArgs = @(
    "/resource:$(Join-Path $skin 'lib\index.js'),Skin.lib.index.js",
    "/resource:$(Join-Path $skin 'lib\page.js'),Skin.lib.page.js",
    "/resource:$(Join-Path $skin 'cordis.patch.yml'),Skin.cordis.patch.yml",
    "/resource:$(Join-Path $skin 'package.json'),Skin.package.json"
)
foreach ($opt in @(
    @{ Path = (Join-Path $skin 'README.zh.md'); Name = 'Skin.README.zh.md' },
    @{ Path = (Join-Path $skin 'LICENSE'); Name = 'Skin.LICENSE' },
    @{ Path = $readme; Name = 'Docs.readme.md' }
)) {
    if (Test-Path $opt.Path) { $resArgs += "/resource:$($opt.Path),$($opt.Name)" }
    else { Write-Warning "缺少可选资源: $($opt.Path)" }
}

$exe = Join-Path $out "$name.exe"
Write-Host '编译主程序…'
& $csc /nologo /target:winexe /codepage:65001 "/out:$exe" `
    /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll `
    @resArgs "$src\Suite.cs" "$src\AlphaForm.cs"
if ($LASTEXITCODE -ne 0) { throw '主程序编译失败' }
Write-Host "  $exe  ($((Get-Item $exe).Length) 字节)"

if ($Setup) {
    Write-Host '编译一键安装包…'
    $setupExe = Join-Path $out "$name-安装程序.exe"
    $setupRes = @("/resource:$exe,Payload.app.exe")
    if (Test-Path $readme) { $setupRes += "/resource:$readme,Payload.usage.md" }
    & $csc /nologo /target:winexe /codepage:65001 "/out:$setupExe" @setupRes "$src\Setup.cs"
    if ($LASTEXITCODE -ne 0) { throw '安装包编译失败' }
    Write-Host "  $setupExe  ($((Get-Item $setupExe).Length) 字节)"
}

function Find-Node {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    # DSH 自带一个 node，但不在 PATH 里；再兜一下常规安装位置。
    $cands = @(
        (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'),
        (Join-Path $env:ProgramFiles 'nodejs\node.exe')
    )
    foreach ($c in $cands) { if ($c -and (Test-Path $c)) { return $c } }
    return $null
}

Write-Host ''
Write-Host '自检…'
$node = Find-Node
if ($node) {
    & $node (Join-Path $root 'scripts\verify-pkg.mjs') $skin
} else {
    Write-Warning '没找到 node，跳过自检。可手动执行: node scripts/verify-pkg.mjs skin'
}
