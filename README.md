# Shadowsocks-rust (ssmanager 模式) Web 管理面板

管理 `shadowsocks-rust` ssmanager 模式的 Web 面板。

- **后端**：Node.js + Express，通过 shadowsocks-rust 的 Manager Protocol（UDP 文本命令）管理端口/用户，同时负责 ssmanager 进程的启动/停止/重启/日志采集，数据持久化用 SQLite。
- **前端**：Vue 3 + Vite + Pinia + Vue Router + Element Plus。

## 目录结构

```
install.sh   一键安装脚本
backend/     Node.js API 服务（生产模式下也直接托管前端静态文件）
frontend/    Vue 3 管理界面
```

## 一键安装（推荐，生产部署用）

在一台全新的 Ubuntu/Debian/CentOS 服务器（root 权限）上：

```bash
git clone <本仓库地址> ssmanager && cd ssmanager
sudo ./install.sh
```

脚本会自动完成：

1. 安装 Node.js 20（如未安装或版本 <18）、编译工具链（gcc/make 等，供 better-sqlite3 编译原生模块用）。
2. 从 GitHub Releases 下载并校验 checksum 安装 shadowsocks-rust（`ssserver`/`ssmanager`/`sslocal`/`ssservice`）到 `/usr/local/bin`。
3. 安装后端依赖，首次运行时生成带随机 `JWT_SECRET` 和随机管理员密码的 `backend/.env`，创建管理员账号。
4. 准备前端生产包（`frontend/dist`），由后端 Express 直接托管（`/` 走静态文件，`/api` 走接口），单进程单端口，无需额外装 nginx。**优先从 GitHub Releases 下载 CI 预编译好的产物**（见下方「前端预编译」一节），下载失败时才会退回到本机跑 `npm run build`。
5. 注册为 systemd 服务 `ssmanager-panel`（开机自启、崩溃自动重启）。

跑完会打印面板访问地址和随机生成的管理员密码。**shadowsocks-rust 二进制只是装好，并不会自动启动**——登录面板后去「设置」页面点「启动」，由面板自己的进程管理来拉起 `ssmanager`（避免和 systemd 重复管理同一个进程）。

常用参数：

```bash
sudo ./install.sh --skip-ssrust      # 已经自己装好 shadowsocks-rust，跳过下载安装
sudo ./install.sh --force-ssrust     # 强制重新下载安装 shadowsocks-rust
sudo ./install.sh --port 8080        # 面板监听端口（默认 3000，仅首次生成 .env 时生效）
sudo ./install.sh --no-swap          # 不自动创建 swap 文件（默认低内存无 swap 时会加 2G swap）
sudo ./install.sh --build-frontend   # 强制本机构建前端，不去 GitHub Releases 找预编译产物
```

脚本可以安全重复执行：已存在的 `backend/.env`、已装好的 shadowsocks-rust、已创建的管理员账号都不会被覆盖/重建，只会重新走 `npm install`/准备前端/重启 systemd 服务。

### 前端预编译（低配置服务器推荐）

`frontend/` 依赖较多（Element Plus + ECharts），`npm run build` 需要的内存在 1GB 以下的小内存 VPS 上容易触发 OOM（内核直接杀掉进程，或 Node 报 `JavaScript heap out of memory`）。为此仓库带了 `.github/workflows/build-frontend.yml`：每次 push 到 `main` 分支且改动了 `frontend/**`，GitHub Actions 会在其构建机上跑 `npm run build`，把产物打包成 `frontend-dist.tar.gz` 连同 `.sha256` 校验文件发布到一个滚动更新的 Release（tag: `frontend-dist-latest`）。

`install.sh` 默认会先尝试从这个 Release 下载并校验 checksum，成功就直接用，完全跳过本机的 `npm install`/`vite build`，即使服务器只有几百 MB 内存也不受影响。只有在下载失败（比如 fork 出来的仓库还没跑过这个 workflow、没有 GitHub Releases 权限、或断网访问不了 github.com）时才会退回本机构建（这时上面的 swap + `NODE_OPTIONS=--max-old-space-size` 兜底逻辑会尽量保证本机构建也能跑成功）。

如果你 fork 了这个仓库，第一次用之前记得让 Actions 跑一次（push 到 main，或去 Actions 页面手动触发 `workflow_dispatch`），不然 install.sh 找不到预编译产物，会自动退回本机构建。

安装完成后常用命令：

```bash
systemctl status ssmanager-panel
journalctl -u ssmanager-panel -f
systemctl restart ssmanager-panel
```

如果你更想手动控制每一步（比如本地开发调试），看下面「后端」「前端」两节的手动安装方式。

## 后端

### 安装与初始化（手动方式，本地开发用）

```bash
cd backend
npm install
cp .env.example .env    # 按需修改 JWT_SECRET / ADMIN_PASSWORD 等
npm run seed             # 首次运行，创建管理员账号（用户名/密码来自 .env）
npm run dev               # 或 npm start
```

后端默认监听 `http://localhost:3000`。SQLite 数据库文件位于 `backend/data/ssmanager.db`（自动创建）。

### 连接真实的 shadowsocks-rust ssmanager

面板通过 UDP 与 `ssmanager` 的 `--manager-addr host:port` 通信，命令格式为：

```
add: {"server_port":8388,"password":"...","method":"aes-256-gcm"}   -> ok
remove: {"server_port":8388}                                        -> ok
list                                                                 -> [{"server_port":8388,"password":"..."}]
ping                                                                  -> stat: {"8388":12345}
```

以上命令格式已经用真实的 `ssmanager` 二进制（v1.24.0）验证过：`list` 回复的是裸数组，不是 `{"servers":[...]}`（一些文档/旧版本描述的格式），`protocolClient.js` 里两种格式都能兼容解析。

真实部署时，在服务器上启动（示例）：

```bash
ssmanager --manager-addr 127.0.0.1:6100 -s 0.0.0.0 -m aes-256-gcm
```

然后在面板「设置」页面把 Manager 地址/端口指向 `127.0.0.1:6100`，并填写「服务器公网地址」（供生成 `ss://` 分享链接和二维码使用，例如服务器的公网 IP 或域名）。

面板也可以直接帮你**启动/停止/重启**这个 `ssmanager` 进程——在「设置」页面配置好可执行文件路径与启动参数后，用页面上的按钮控制即可，无需手动 SSH 到服务器敲命令；异常退出会自动重启。

### 本地开发 / 无真实 ssmanager 时的 mock 模式

仓库自带一个实现同样协议的假 manager，方便本地开发和演示，无需安装 shadowsocks-rust：

```bash
npm run mock-manager    # 监听 127.0.0.1:6100，流量数字每次 ping 随机增长
```

`.env.example` 里的默认 `MANAGER_HOST`/`MANAGER_PORT` 正好指向它，开箱即用。

### 后端测试

```bash
npm test    # node:test，用一个内存里的假 manager 验证 protocolClient 的编解码逻辑
```

## 前端

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173，已配置 /api 反向代理到后端 :3000
npm run build   # 生产构建，产物在 frontend/dist，可用任意静态文件服务器托管
```

## 功能

- 登录鉴权（JWT，单管理员账号）
- 概览：manager 连通性、ssmanager 进程状态、端口数、今日/累计流量、7 日流量趋势图
- 端口管理：新增/编辑/启停/删除、随机生成端口和密码、`ss://` 链接与二维码分享
- 单端口流量曲线（7/30 天）
- 设置：Manager 连接参数、ssmanager 进程控制与日志查看、修改管理员密码

## 已知限制

- 只支持 UDP 传输的 manager-address（不支持 Unix Domain Socket），这是 shadowsocks-rust 文档里最常见的配置方式。
- 单机单 ssmanager 实例，不支持多节点集中管理。
- ssmanager 没有原生的“更新端口配置”命令，编辑端口密码/加密方式时后端会自动做 remove + add。
- 进程启动参数按空格切分，暂不支持带空格的带引号参数。
- `install.sh` 依赖 systemd，非 systemd 系统（部分容器、旧版 init）需要自己写启动脚本；也只自动识别 x86_64/aarch64/armv7 三种架构。
