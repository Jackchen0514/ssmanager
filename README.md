# Shadowsocks-rust (ssmanager 模式) Web 管理面板

管理 `shadowsocks-rust` ssmanager 模式的 Web 面板。

- **后端**：Node.js + Express，通过 shadowsocks-rust 的 Manager Protocol（UDP 文本命令）管理端口/用户，同时负责 ssmanager 进程的启动/停止/重启/日志采集，数据持久化用 SQLite。
- **前端**：Vue 3 + Vite + Pinia + Vue Router + Element Plus。

## 目录结构

```
install.sh    一键安装脚本
update.sh     一键升级脚本（不影响已有账号密码/端口配置/数据库）
uninstall.sh  一键卸载脚本
VERSION       当前版本号
backend/      Node.js API 服务（生产模式下也直接托管前端静态文件）
frontend/     Vue 3 管理界面
```

## 一键安装（推荐，生产部署用）

在一台全新的 Ubuntu/Debian/CentOS 服务器（root 权限）上，不需要先 `git clone`，直接下载 `install.sh` 这一个文件运行即可，脚本会自己去 GitHub 拉源码：

```bash
curl -fsSL https://raw.githubusercontent.com/Jackchen0514/ssmanager/main/install.sh -o install.sh
sudo bash install.sh
```

源码默认会装到 `/opt/ssmanager`（可用 `--dir` 改路径）。之后要升级，用 `sudo /opt/ssmanager/update.sh` 即可（见下方「升级」一节），不会丢账号密码和端口配置。

如果更习惯用 git（比如你 fork 了这个仓库、想本地改代码再装），也可以照旧：

```bash
git clone <本仓库地址> ssmanager && cd ssmanager
sudo ./install.sh
```

这种方式下升级同样用 `sudo ./update.sh`（内部会 `git pull --ff-only`），或者手动 `git pull && sudo ./install.sh` 也一样。

脚本会自动完成：

1. 安装 Node.js 20（如未安装或版本 <18）、编译工具链（gcc/make 等，供 better-sqlite3 编译原生模块用）。
2. 从 [Jackchen0514/shadowsocks-rust](https://github.com/Jackchen0514/shadowsocks-rust) 的 GitHub Releases 下载并校验 checksum 安装 shadowsocks-rust（`ssserver`/`ssmanager`/`sslocal`/`ssservice`）到 `/usr/local/bin`（`install.sh` 里的 `SSRUST_REPO` 变量可改成其他仓库，比如切回官方 `shadowsocks/shadowsocks-rust`）。
3. 安装后端依赖，首次运行时生成带随机 `JWT_SECRET` 和随机管理员密码的 `backend/.env`，创建管理员账号。
4. 准备前端生产包（`frontend/dist`），由后端 Express 直接托管（`/` 走静态文件，`/api` 走接口），单进程单端口，无需额外装 nginx。**优先从 GitHub Releases 下载 CI 预编译好的产物**（见下方「前端预编译」一节），下载失败时才会退回到本机跑 `npm run build`。
5. 注册为 systemd 服务 `ssmanager-panel`（开机自启、崩溃自动重启）。
6. 等面板 API 起来后，用管理员账号登录并调用面板自己的「启动进程」接口拉起 `ssmanager`（不是通过 systemd 单独起——面板本身就把 `ssmanager` 当子进程管理，systemd 只管面板这一层，避免两边重复管理同一个进程冲突）。

跑完会打印面板访问方式和随机生成的管理员密码，此时 `ssmanager` 应该已经在跑了（终端输出会明确告诉你是否自动启动成功；如果没成功，会打印原因，去「设置」页面确认配置后手动点「启动」即可）。

**面板默认只监听 `127.0.0.1`**（`backend/.env` 里的 `PANEL_HOST`），因为面板自己没有 TLS，不适合直接暴露公网。装完后想访问，三选一：

1. SSH 隧道（推荐）：本机执行 `ssh -L 3000:127.0.0.1:3000 root@你的服务器IP`，然后浏览器打开 `http://127.0.0.1:3000`
2. 自己在前面加反向代理（nginx/caddy）转发到 `127.0.0.1:3000`，走 HTTPS 对外
3. 装的时候加 `--public`（或者把已有的 `backend/.env` 里 `PANEL_HOST` 改成 `0.0.0.0` 后 `systemctl restart ssmanager-panel`），直接公网暴露 3000 端口（注意自己做好访问控制）

（不管选哪种，面板新增的 shadowsocks 端口本身始终是公网监听的，这个开关只影响面板管理界面本身。）

常用参数：

```bash
sudo ./install.sh --skip-ssrust      # 已经自己装好 shadowsocks-rust，跳过下载安装
sudo ./install.sh --force-ssrust     # 强制重新下载安装 shadowsocks-rust
sudo ./install.sh --port 8080        # 面板监听端口（默认 3000，仅首次生成 .env 时生效）
sudo ./install.sh --no-swap          # 不自动创建 swap 文件（默认低内存无 swap 时会加 2G swap）
sudo ./install.sh --build-frontend   # 强制本机构建前端，不去 GitHub Releases 找预编译产物
sudo ./install.sh --no-autostart     # 装完不自动启动 ssmanager，自己去「设置」页面点「启动」
sudo ./install.sh --dir /opt/ssmanager  # 不走 git clone 时，源码下载/更新到哪个目录（默认 /opt/ssmanager）
sudo ./install.sh --public           # 面板直接监听 0.0.0.0，公网可访问（默认只监听 127.0.0.1，仅首次生成 .env 时生效）
```

脚本可以安全重复执行：已存在的 `backend/.env`、已装好的 shadowsocks-rust、已创建的管理员账号都不会被覆盖/重建，只会重新走 `npm install`/准备前端/重启 systemd 服务。

### 前端预编译（低配置服务器推荐）

`frontend/` 依赖较多（Element Plus + ECharts），`npm run build` 需要的内存在 1GB 以下的小内存 VPS 上容易触发 OOM（内核直接杀掉进程，或 Node 报 `JavaScript heap out of memory`）。为此仓库带了 `.github/workflows/build-frontend.yml`：每次 push 到 `main` 分支且改动了 `frontend/**`，GitHub Actions 会在其构建机上跑 `npm run build`，把产物打包成 `frontend-dist.tar.gz` 连同 `.sha256` 校验文件发布到一个滚动更新的 Release（tag: `frontend-dist-latest`）。

`install.sh` 默认会先尝试从这个 Release 下载并校验 checksum（限时 10 秒连接 + 最多 60 秒传输，超时会打印具体错误后退回本机构建，不会无限卡住），成功就直接用，完全跳过本机的 `npm install`/`vite build`，即使服务器只有几百 MB 内存也不受影响。只有在下载失败（比如 fork 出来的仓库还没跑过这个 workflow、没有 GitHub Releases 权限、或服务器网络到 `github.com` 通但到 `objects.githubusercontent.com` 这个 Release 资源 CDN 不通/很慢）时才会退回本机构建（这时上面的 swap + `NODE_OPTIONS=--max-old-space-size` 兜底逻辑会尽量保证本机构建也能跑成功，但小内存服务器上仍可能非常慢）。

如果你 fork 了这个仓库，第一次用之前记得让 Actions 跑一次（push 到 main，或去 Actions 页面手动触发 `workflow_dispatch`），不然 install.sh 找不到预编译产物，会自动退回本机构建。

如果服务器网络确实连不上 GitHub 的 Release CDN，也可以在别的机器（自己电脑、这台服务器以外任意能跑 `npm run build` 的机器）上构建好 `frontend/dist`，用 `scp` 拷贝到服务器的 `frontend/dist/` 目录下，再执行 `install.sh`：只要 `frontend/dist/index.html` 已经存在，脚本会直接用它，跳过下载和本机构建（传 `--build-frontend` 可以强制忽略已有的 `dist` 重新本机构建）。这个跳过判断只认外部手动放进去的 `dist`——`install.sh` 自己下载/构建出来的 `dist` 会带一个内部标记文件，每次重新执行都还是会去检查有没有新的预编译产物，不会因为上次装过就一直用旧的。

安装完成后常用命令：

```bash
systemctl status ssmanager-panel
journalctl -u ssmanager-panel -f
systemctl restart ssmanager-panel
```

### 升级

```bash
sudo ./update.sh
```

（standalone 安装直接用 `sudo /opt/ssmanager/update.sh`，或者是自己 `--dir` 指定的路径。）

`update.sh` 只做两件事：拉取最新代码（git 仓库用 `git pull --ff-only`，standalone 安装重新下载源码 tarball），然后把活交给 `install.sh` 刷新依赖/前端产物/systemd 服务。全程不碰 `backend/.env`（JWT 密钥、管理员密码、Manager 连接配置）和 `backend/data/`（SQLite 数据库，也就是所有端口配置、流量记录、API Token），已装好的 shadowsocks-rust 二进制也不会重装（除非加 `--force-ssrust`）。

git 仓库模式下如果本地有未提交的改动导致 `git pull --ff-only` 失败，`update.sh` 会直接报错退出，不会做任何自动 `stash`/`reset` 之类的操作——先自己处理好本地改动（`git status`/`git stash`）再重跑。

`update.sh` 支持透传 `install.sh` 的所有参数，比如 `sudo ./update.sh --force-ssrust` 顺带升级 shadowsocks-rust 二进制。

已经装好的面板要切换成 IPv4+IPv6 双栈，因为 `binary_args` 实际存在面板的数据库里（不是 `backend/.env`，那个只在数据库第一次建表时读一次），改 `.env` 没用，得走面板自己的 API。加 `--ssmanager-args` 就是干这个的，两种脚本都能用：

```bash
sudo ./update.sh --ssmanager-args "--manager-addr 127.0.0.1:6100 -s :: -m aes-256-gcm"
# 或者已经是最新代码时，直接
sudo ./install.sh --ssmanager-args "--manager-addr 127.0.0.1:6100 -s :: -m aes-256-gcm"
```

执行时会自动登录面板、把这串参数写进数据库、然后重启 ssmanager 进程生效，不用手动进「设置」页面改。

用之前确认两件事，不然 IPv4 也可能跟着一起连不上：
- 内核没有彻底禁用 IPv6：`cat /proc/sys/net/ipv6/conf/all/disable_ipv6` 应该是 `0`，`ip -6 addr` 应该至少能看到 `::1`。真彻底禁用的话绑定 `::` 会直接失败，`ssserver` 那个端口连 IPv4 都起不来（双栈绑定失败没有自动退回纯 v4 的逻辑）；如果只是没有公网 IPv6 地址（内核本身支持），绑 `::` 是安全的，v6 客户端连不上（没有路由），v4 完全不受影响。
- 云厂商防火墙/安全组给这个端口放行了 `::/0`：IPv4 和 IPv6 通常是两条独立规则（比如 AWS 安全组），只放行 `0.0.0.0/0` 不会自动覆盖 IPv6，很容易漏加。

### 卸载

```bash
sudo ./uninstall.sh
```

默认只停止并移除 `ssmanager-panel` 这个 systemd 服务（会连带杀掉它拉起的 `ssmanager` 子进程），`backend/.env`、数据库（管理员账号和所有端口配置）、已安装的 shadowsocks-rust 二进制、install.sh 可能加的 swapfile 都会保留，方便重新 `sudo ./install.sh` 时原样恢复。

需要彻底清理时加参数：

```bash
sudo ./uninstall.sh --purge-data       # 连数据库和 .env 一起删（不可恢复）
sudo ./uninstall.sh --remove-ssrust    # 连 shadowsocks-rust 二进制一起删
sudo ./uninstall.sh --remove-swap      # 连 install.sh 加的 swapfile 一起删
sudo ./uninstall.sh --all              # 以上三个都删
```

仓库代码本身（这个 git 目录）不会被删除，需要的话自己 `rm -rf` 对应目录。

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

如果 `ssmanager` 是 [Jackchen0514/shadowsocks-rust](https://github.com/Jackchen0514/shadowsocks-rust) ≥ v1.23.8，`add:` 命令还可以附带三个可选字段（面板在端口的「TCP 连接数」「UDP 会话数」「在线 IP 数」有值时会自动带上，0/不填就不带）：

```
add: {"server_port":8388,"password":"...","method":"aes-256-gcm","tcp_max_connections":100,"udp_max_associations":100,"max_online_ips":50}
```

如果 `ssmanager` ≥ v1.23.9，还支持一个新命令 `conn-stat`，用来查询每个端口**当前实时**的连接数（不是累计流量），面板在节点详情页每 5 秒轮询一次：

```
conn-stat                                                            -> [{"server_port":8388,"tcp_conn_count":3,"udp_assoc_count":1,"online_ip_count":2,"online_ips":["1.2.3.4","5.6.7.8"]}]
```

真实部署时，在服务器上启动（示例）：

```bash
ssmanager --manager-addr 127.0.0.1:6100 -s 0.0.0.0 -m aes-256-gcm
```

`-s` 是 ssserver 的监听地址，`install.sh` 生成的默认值始终是 `0.0.0.0`（只监听 IPv4），不会自动改成 `::`——因为如果这台机器内核层面彻底禁用了 IPv6，绑定 `::` 会直接失败，连 IPv4 也起不来，所以稳妥起见默认不动。确认这台机器真的支持 IPv6 之后（见下面「升级」一节末尾），自己把它换成 `-s ::` 即可让**同一个** ssserver 同时监听 v4 和 v6（Linux 下 `::` 默认是双栈 socket，不需要跑两个进程）——面板「设置」页「启动参数」输入框下面也有同样的提示。

然后在面板「设置」页面把 Manager 地址/端口指向 `127.0.0.1:6100`，并填写「服务器公网地址 (IPv4)」（供生成 `ss://` 分享链接和二维码使用，例如服务器的公网 IP 或域名）。如果 `-s` 是 `::`（双栈）或服务器另有公网 IPv6，再填一下「服务器公网地址 (IPv6)」——两个都填的话，节点的分享弹窗会同时给出 IPv4 和 IPv6 两个 `ss://` 链接/二维码（各一个 tab），方便只有 v6 出口的客户端直接选 IPv6 那个。只填一个也完全可以，行为和以前一样。

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
- 节点管理：新增/编辑/启停/删除、随机生成端口和密码、`ss://` 链接与二维码分享
- 单端口流量曲线（7/30 天）
- 流量限额：可为每个端口设置流量上限（GB，0 表示不限），超过后自动从 manager 移除并禁用，标记为「已超限」；可编辑提高限额或点「重置流量」后重新启用
- 过期时间：可为每个端口设置到期时间（留空表示永不过期），到期后自动从 manager 移除并禁用，标记为「已过期」；编辑延长过期时间后可重新启用
- 连接限制：可为每个端口设置 TCP 最大并发连接数、UDP 最大会话数、同时在线的不同客户端 IP 数上限（0 均表示不限），由 ssmanager 自身实时拒绝超限的新连接/新 IP，不是面板轮询后才生效；IP 数限制是目前唯一能近似做到「设备数限制」的手段（依据是「不同客户端 IP」，不是真实设备指纹）。**需要 [Jackchen0514/shadowsocks-rust](https://github.com/Jackchen0514/shadowsocks-rust) ≥ v1.23.8**，官方原版或更早版本的 ssmanager 会静默忽略这三个字段
- 实时连接数：节点详情页每 5 秒展示当前 TCP 连接数、UDP 会话数、在线 IP 数（及具体 IP 列表），用于观察是否接近连接限制。**需要 [Jackchen0514/shadowsocks-rust](https://github.com/Jackchen0514/shadowsocks-rust) ≥ v1.23.9**，更早版本会一直显示 0
- 设置：Manager 连接参数、ssmanager 进程控制与日志查看、修改管理员密码
- API Token：在「设置」页面生成长期有效的 token，供第三方脚本/系统调用面板现有的所有 API（无需走用户名密码登录），可随时撤销

## 第三方 API 调用

在「设置」页面「API Token」区块点「生成新 Token」，输入一个便于识别的名称（例如 `monitoring-script`），生成的 token 只会完整显示这一次，请立即复制保存——后续列表里只显示前缀，用来分辨是哪个 token，无法找回完整内容。

拿到 token 后，像下面这样调用面板已有的任意 API（和登录后浏览器里用的是同一套接口，权限也等同于管理员）：

```bash
curl -H "Authorization: Bearer ssm_xxxxxxxxxxxxxxxxxxxx" http://<面板地址>/api/ports
curl -X POST -H "Authorization: Bearer ssm_xxxxxxxxxxxxxxxxxxxx" -H 'Content-Type: application/json' \
  -d '{"server_port":8388,"password":"xxx","method":"aes-256-gcm"}' \
  http://<面板地址>/api/ports
```

token 一旦泄露，攻击者可以做管理员能做的任何事（增删端口、改密码、控制 ssmanager 进程等），请像对待密码一样保管；怀疑泄露时去「设置」页面点「撤销」立即失效。

## 已知限制

- 只支持 UDP 传输的 manager-address（不支持 Unix Domain Socket），这是 shadowsocks-rust 文档里最常见的配置方式。
- 单机单 ssmanager 实例，不支持多节点集中管理。
- ssmanager 没有原生的“更新端口配置”命令，编辑端口密码/加密方式时后端会自动做 remove + add。
- 进程启动参数按空格切分，暂不支持带空格的带引号参数。
- `install.sh` 依赖 systemd，非 systemd 系统（部分容器、旧版 init）需要自己写启动脚本；也只自动识别 x86_64/aarch64/armv7 三种架构。
- API Token 目前不分权限范围（scope），拿到 token 就等于拿到管理员权限，没有"只读"或"只能管端口"这类受限 token。
