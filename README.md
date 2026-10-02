# 奶蛙桌宠

一款基于 Tauri 2、Rust 和原生 JavaScript 的 Windows 桌宠。奶蛙、肥嘟嘟和牛来可以在桌面上走动、播放动作，也可以拖到喜欢的位置。

## 下载与运行

1. 在本仓库的 **Releases** 页面下载 `nw.exe`。
2. 将程序放在一个固定的位置，双击启动。
3. 右键桌宠打开菜单；系统托盘也可以控制桌宠。

运行需要 Windows 和 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section)。素材已嵌入 exe，使用便携版不需要安装 Node.js 或 Rust，也不需要另外下载素材。

本地整理好的运行版位于 `dist/奶蛙桌宠.exe`。GitHub 的 **Source code** 下载项是源码；想直接体验，请下载 Release 中的 exe。

## 操作说明

| 操作 | 效果 |
| --- | --- |
| 左键单击 | 播放当前形态的默认动作 |
| 按住左键拖动 | 移动桌宠 |
| 右键单击 | 打开动作和设置菜单 |
| 托盘图标左键单击 | 显示桌宠 |
| 托盘图标右键单击 | 打开托盘菜单 |

菜单支持切换形态、选择动作、调整大小（80% / 100% / 120%）、暂停自动动作与移动、开机自启动、隐藏和退出。暂停后仍可手动播放动作或拖动。

隐藏的桌宠可以通过托盘图标重新显示；需要结束程序时，选择菜单里的“退出奶蛙”。

## 形态与动作

| 形态 | 单击默认动作 | 可播放的动作 |
| --- | --- | --- |
| 奶蛙 | 大笑 | 大笑、拳击、扭动、举手比耶、胸前比耶、托腮沉思 |
| 肥嘟嘟 | 坐下 | 坐下、坐下比耶吐舌 |
| 牛来 | 点赞 | 点赞、six seven |

- 桌宠会自动走动，并随机播放当前形态支持的动作。
- 靠近桌面文件图标时会触发动作，离开图标后才可再次触发，并有 10 秒冷却时间。
- 右键菜单和托盘菜单只显示当前形态支持的动作。

## 设置保存

位置、大小、形态和暂停状态保存在：

```text
%APPDATA%\com.asus.naiwa-pet\settings.json
```

开机自启动默认关闭，可以在菜单中开启。

## 项目目录

```text
naiwa-pet/
├─ README.md                 使用、开发和发布说明
├─ package.json              npm 命令与开发依赖
├─ package-lock.json         npm 依赖锁文件
├─ .gitignore                本地文件忽略规则
├─ .vscode/                  推荐的编辑器扩展
├─ src/                      前端页面、动画和交互
│  ├─ index.html
│  ├─ main.js
│  ├─ styles.css
│  └─ assets/pet/
│     ├─ naiwa/              奶蛙素材与大笑帧时间
│     ├─ feidudu/            肥嘟嘟素材
│     └─ niulai/             牛来素材
├─ src-tauri/                Rust 后端与 Tauri 配置
│  ├─ src/                   窗口、菜单、拖动和设置保存
│  ├─ capabilities/          窗口权限配置
│  ├─ icons/                 应用图标
│  ├─ Cargo.toml
│  ├─ Cargo.lock
│  ├─ build.rs
│  └─ tauri.conf.json
├─ tests/                    动作、朝向和交互回归测试
└─ dist/                     本地最新版便携 exe，不提交到 Git
```

`node_modules/`、`src-tauri/target/` 和 `src-tauri/gen/schemas/` 会在安装依赖或构建时生成，已被 Git 忽略，不需要放进源码仓库。

## 本地开发

在 Windows 上准备以下工具：

- Node.js LTS 与 npm。
- Rust MSVC 工具链。
- Microsoft C++ Build Tools，安装时勾选“使用 C++ 的桌面开发”。
- Microsoft Edge WebView2 Runtime。

安装步骤可参考 [Tauri 官方环境准备说明](https://v2.tauri.app/start/prerequisites/#windows)。

在项目根目录执行：

```powershell
npm ci
npm run tauri dev
```

前端直接使用 `src/` 中的静态文件，不需要单独运行前端打包工具。

### 检查

```powershell
npm test
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
```

JavaScript 测试使用 Node.js 内置测试工具，覆盖默认动作、素材路径、左右朝向、大笑朝向、图标反应、缩放边界和连续拖动。

## 构建与发布

### 便携 exe

在项目根目录执行，以下命令适用于 PowerShell：

```powershell
npm run tauri build -- --no-bundle -- --locked
if ($LASTEXITCODE -ne 0) { throw "构建失败" }

New-Item -ItemType Directory -Path dist -Force | Out-Null
Copy-Item -LiteralPath src-tauri/target/release/naiwa-pet.exe -Destination dist/奶蛙桌宠.exe -Force
```

`dist/` 只保留当前版本，文件名统一为 `奶蛙桌宠.exe`。

### 安装包

```powershell
npm run tauri build -- --locked
```

当前配置生成 NSIS 安装包，输出到 `src-tauri/target/release/bundle/nsis/`。

### GitHub 发布

源码仓库提交 `src/`、`src-tauri/`、`tests/`、README、npm 配置和锁文件。保留 `package-lock.json` 与 `src-tauri/Cargo.lock`，以便其他人使用相同的依赖版本构建。

将 `dist/奶蛙桌宠.exe` 作为 [GitHub Release 附件](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) 上传，供大家直接下载。依赖目录、编译缓存和本地 exe 不提交到 Git 历史。
