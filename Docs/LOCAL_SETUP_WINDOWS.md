# Moving the project to your Windows PC and resuming with Claude Code Local

Repository: https://github.com/M7Oth/M7Oth
Branch with the work: `claude/heist-game-ue5-multiplayer-dkzjqd`
The Unreal project is the `HeistResponse/` sub-folder of the repository.

> Status reminder: the Unreal C++ has **never been compiled**. The standalone rule tests passing does
> not prove the Unreal build works. The first real build happens on your PC.

## 1. Back up your existing project first
Your PC already has a project called `HeistResponse`. Do not open the downloaded project inside it.

```powershell
# Adjust the path to where your existing project lives
$Old = "D:\Unreal\HeistResponse"
Compress-Archive -Path "$Old\*" -DestinationPath "D:\Unreal\Backup_HeistResponse_$(Get-Date -Format yyyyMMdd_HHmm).zip"
```
(For a large project, copying the folder with `robocopy "$Old" "D:\Unreal\Backup_HeistResponse" /E` is faster.)

## 2. Download the repository into a SEPARATE folder
Option A, Git (recommended, makes later updates easy):
```powershell
cd D:\Unreal
git clone --branch claude/heist-game-ue5-multiplayer-dkzjqd https://github.com/M7Oth/M7Oth.git HR_Repo
cd HR_Repo
git lfs install
```
Option B, ZIP: https://github.com/M7Oth/M7Oth/archive/refs/heads/claude/heist-game-ue5-multiplayer-dkzjqd.zip
(The branch currently contains no Git LFS files, so the ZIP is complete.)

Check that it arrived complete (expected: 119 tracked files):
```powershell
git ls-files | Measure-Object        # Count should be 119
Test-Path .\HeistResponse\HeistResponse.uproject
Get-ChildItem .\HeistResponse\Source -Recurse -File | Measure-Object   # 87 files
```

## 3. Compare your existing project with the repository (before any merge)
```powershell
$Old = "D:\Unreal\HeistResponse"
$New = "D:\Unreal\HR_Repo\HeistResponse"
# Engine version + modules/plugins of each project
Get-Content "$Old\HeistResponse.uproject"
Get-Content "$New\HeistResponse.uproject"
# Folder-level file differences (ignoring generated folders)
$skip = '\\(Binaries|Intermediate|Saved|DerivedDataCache|\.vs)\\'
$a = Get-ChildItem $Old -Recurse -File | ? { $_.FullName -notmatch $skip } | % { $_.FullName.Substring($Old.Length) }
$b = Get-ChildItem $New -Recurse -File | % { $_.FullName.Substring($New.Length) }
Compare-Object $a $b | Sort-Object InputObject | Format-Table -AutoSize
# Config differences
foreach ($f in "DefaultEngine.ini","DefaultGame.ini","DefaultInput.ini") { "== $f"; fc.exe "$Old\Config\$f" "$New\Config\$f" }
```
What to look for:
- **EngineAssociation** in the old `.uproject` is your installed engine version. If the repo's (`5.6`) differs, right-click the repo's `.uproject` and choose *Switch Unreal Engine version* → your version.
- **Content\*.uasset / .umap** in the old project: these are your own assets (the repository has none). Keep them (step 4).
- **Source\HeistResponse** in the old project (if it is a C++ template): it has the same module name as ours. Use the repository's Source; don't mix the two.
- **Config**: the repository's configs are required (game mode, maps, input, network, online subsystem). Any settings you changed in the old project should be added on top of them by hand.

## 4. Recommended merge strategy (repository = base, nothing deleted)
1. Work in the repository folder `D:\Unreal\HR_Repo\HeistResponse`.
2. If your old project has assets you want, copy only the `Content` folder contents (don't overwrite the existing `Fonts` and `Localization` folders):
   ```powershell
   robocopy "$Old\Content" "$New\Content" /E /XC /XN /XO
   ```
   (`/XC /XN /XO` = don't overwrite any file that already exists.)
3. Leave the old project untouched as a reference, in addition to the backup.

## 5. First build
1. Install Visual Studio 2022 with the *Game development with C++* workload (plus the Windows 10/11 SDK that comes with it).
2. Right-click `HR_Repo\HeistResponse\HeistResponse.uproject` → *Generate Visual Studio project files*.
3. Open `HeistResponse.sln` → configuration `Development Editor`, platform `Win64` → Build.
4. Keep the full error log: *Output* window, or `HeistResponse\Saved\Logs\` and the `Build.log` under `%LOCALAPPDATA%\UnrealBuildTool\`.
5. After a successful build, open the editor → Tools → Execute Python Script → `HeistResponse\Tools\Editor\build_district.py`.

Compile errors are expected on the first build (the code was written without a compiler). That's where Claude Code Local starts.

## 6. Resuming with Claude Code Local
```powershell
npm install -g @anthropic-ai/claude-code   # or the native installer from code.claude.com
cd D:\Unreal\HR_Repo
claude
```
Claude reads `CLAUDE.md` automatically. Suggested first message:

> Read CLAUDE.md, Docs/PROJECT_STATUS.md and Docs/LOCAL_SETUP_WINDOWS.md. Don't add any new systems.
> Goal: build the HeistResponseEditor Win64 Development target with UnrealBuildTool from the command line,
> fix compile errors one at a time with a commit per batch, then open the editor, run build_district.py,
> and test a listen server with two players. Record what was actually verified in PROJECT_STATUS.md.

Command-line build that Claude can run itself (adjust the engine path):
```powershell
& "C:\Program Files\Epic Games\UE_5.6\Engine\Build\BatchFiles\Build.bat" HeistResponseEditor Win64 Development -Project="D:\Unreal\HR_Repo\HeistResponse\HeistResponse.uproject" -WaitMutex
```
