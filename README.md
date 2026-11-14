# xyzw-helper-server

XYZW 游戏自动化的服务端定时任务版。关掉浏览器后，计划仍会到点执行。

## 结构

```
server/   后端：Node + TypeScript + Fastify + SQLite
web/      前端：Vue 3 + Vite + TypeScript + Naive UI
docs/adr/ 架构决策记录
GLOSSARY.md 领域术语
```

## 开发

```bash
pnpm install
pnpm dev:server   # http://localhost:3000
pnpm dev:web      # Vite 开发服务器，代理 /api 到 3000
pnpm test
```

首次启动会自动创建数据库并把 `.env` 中的管理员账号初始化进去。

## 部署

单容器部署：Fastify 同时托管前端静态文件与 API，数据用 SQLite 存在挂载卷里。
下面以阿里云 ECS（Ubuntu 22.04/24.04 或 Debian 12）为例，其它 Linux 服务器同理。

### 前置条件

- 服务器建议 2C4G 以上；2C2G 也能跑，但构建阶段需要加 swap（见「常见问题」）
- 已安装 Docker + Compose v2
- 安全组/防火墙放行 `22`、`3000`（启用 HTTPS 后改为只放 `80/443`）
- 服务器能访问 GitHub（拉代码）和 npm 源（构建依赖）

### 1. 安装 Docker（使用阿里云镜像源）

```bash
sudo apt update && sudo apt install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh -s -- --mirror Aliyun
sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # 重新登录后生效
docker compose version          # 需要 Compose v2
```

### 2. 拉取代码

```bash
sudo mkdir -p /opt && cd /opt
git clone https://github.com/JetaoOu/XYZW-helper-server.git xyzw-helper-server
cd xyzw-helper-server
```

### 3. 配置 `.env`

```bash
cp .env.example .env

# 生成凭据加密密钥（务必妥善保存）
sed -i "s|^CREDENTIAL_SECRET=.*|CREDENTIAL_SECRET=$(openssl rand -hex 32)|" .env

# 设置管理员密码（不要保留示例里的占位符）
sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=你的强密码|" .env

chmod 600 .env
```

| 变量 | 说明 |
|---|---|
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 首次启动时创建的管理员；数据库已有用户后再改 `.env` 不会生效，需要在页面「设置 → 修改密码」 |
| `CREDENTIAL_SECRET` | 64 位十六进制，用于加密游戏凭据；**丢失后已保存的角色凭据无法解密** |
| `DATABASE_PATH` | 默认 `./data/xyzw.db`，compose 中覆盖为 `/app/data/xyzw.db` |
| `SESSION_DAYS` | 登录会话有效期（天），默认 30 |
| `PORT` | 服务端口，默认 3000 |

### 4. 构建并启动

```bash
mkdir -p data
docker compose up -d --build
```

国内服务器如果拉不到 Docker Hub 的 `node:22-bookworm-slim`，指定镜像站即可（也可以把 `NODE_IMAGE` 写进 `.env`）：

```bash
NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim docker compose up -d --build
```

可用的镜像站：`docker.m.daocloud.io`、`docker.1ms.run`、`docker.xuanyuan.me`，格式都是 `<镜像站>/library/node:22-bookworm-slim`。

### 5. 验证与首次登录

```bash
docker compose ps                                  # STATUS 应为 Up (healthy)
curl http://127.0.0.1:3000/api/health              # {"status":"ok",...}
docker compose logs -f --tail=100                  # 有异常时看这里
```

浏览器访问 `http://<服务器IP>:3000`，用 `.env` 里的管理员账号登录，然后：

1. **角色管理**：添加角色（手动粘贴 token / URL / 导入 BIN 文件 / 导入旧版全量备份）
2. **计划管理**：新建计划，选动作 + cron + 角色或分组
3. **设置**：按需调整并发角色数、命令间隔、`clientVersion`、`platform`

### 6. 日常运维

```bash
docker compose logs -f --tail=200   # 实时日志
docker compose restart              # 重启
docker compose down                 # 停止（保留数据）
docker compose up -d                # 再启动
```

更新版本（代码在远程仓库）：

```bash
cd /opt/xyzw-helper-server
git pull
docker compose up -d --build
```

数据与备份：

- 宿主机 `./data/xyzw.db`：SQLite 数据库（角色、凭据密文、计划、运行记录）
- 宿主机 `./data/backups/`：服务每天 03:00 自动备份，保留最近 7 份
- 建议再叠加一层：ECS 自动快照，或定时 `ossutil sync data/ oss://<bucket>/xyzw/`
- 升级前可以先手动留一份：`cp -a data /opt/xyzw-data-$(date +%F)`

### 7. 安全建议（重要）

- 默认部署不带 HTTPS，登录密码与游戏凭据在公网明文传输。上线公网前建议用 Nginx/Caddy 反向代理并配置证书。
- 启用反向代理后，把 compose 的端口改成只监听本机，安全组只放 `80/443`：

  ```yaml
  ports:
    - "127.0.0.1:3000:3000"
  ```

- 暂时没有域名/TLS 时，至少把安全组里的 `3000` 限制为自己的固定 IP。
- `.env` 和 `data/` 已在 `.gitignore` 中，**不要提交**；`CREDENTIAL_SECRET` 一旦泄露，已保存的游戏凭据可被解密。

### 8. 常见问题

| 现象 | 处理 |
|---|---|
| `load metadata for docker.io/library/node:22-bookworm-slim` 失败 | 配置 Docker 镜像加速器，或用 `NODE_IMAGE=...` 指定镜像站 |
| 构建过程中被 OOM 杀掉 | 加 swap：`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| `pnpm install` 很慢或超时 | 把 Dockerfile 里 `pnpm install` 前加 `RUN pnpm config set registry https://registry.npmmirror.com` 后重新构建 |
| 浏览器打不开 3000 | 安全组未放行、`ufw` 未开端口，或容器未 healthy（`docker compose ps`） |
| 改了 `.env` 密码仍登录不上 | 管理员账号只在数据库为空时创建；已初始化请登录后在页面改密码 |
| 忘记管理员密码 | 先停容器，把 `.env` 里的 `ADMIN_PASSWORD` 改好，再删除 `data/xyzw.db` 重启（会清空角色与运行记录），或联系维护者用脚本重置密码哈希 |

## 阶段

- 阶段一（已实现）：登录、角色录入（手动 / URL / BIN）、旧备份导入（含 BIN 原件）、25 个动作、计划调度（cron、补跑、防重叠）、按需连接执行、运行记录与 SSE 实时日志、动作级资源收益、每日资源增长、手动快照、凭据失效处理、设置页、Docker 部署。
- 阶段二（计划中）：微信扫码 / 手机号登录（含前端游戏加密模块与 Fastify 代理）、失败告警 webhook。

### 动作清单

日常、签到、挂机奖励、一键加钟、邮件、军团签到、珍宝阁、功法领取、重置盐罐、领取盐罐、爬塔、竞技场、竞技场 3 次、怪异塔、宝库前 3 层、宝库 4-5 层、咸王梦境、营地任务、开箱、宝箱积分、招募、钓鱼、灯神扫荡、免费道具、四圣碎片。

暂未迁移（依赖额外配置或题库）：自动答题、蟠桃园任务、换皮闯关、营地挑战、玄武赐福、竞猜类、兑换码、黑市采购清单、功法赠送。
