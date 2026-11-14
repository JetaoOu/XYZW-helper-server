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

```bash
cp .env.example .env   # 修改 ADMIN_PASSWORD / CREDENTIAL_SECRET
docker compose up -d --build
```

访问 `http://<服务器IP>:3000/`。

> 当前部署不走 HTTPS，登录凭据与游戏凭据会在公网明文传输。请使用高强度随机密码，并在条件允许时尽快在反向代理层补上 TLS。

## 阶段

- 阶段一（已实现）：登录、角色录入（手动 / URL / BIN）、旧备份导入（含 BIN 原件）、25 个动作、计划调度（cron、补跑、防重叠）、按需连接执行、运行记录与 SSE 实时日志、动作级资源收益、每日资源增长、手动快照、凭据失效处理、设置页、Docker 部署。
- 阶段二（计划中）：微信扫码 / 手机号登录（含前端游戏加密模块与 Fastify 代理）、失败告警 webhook。

### 动作清单

日常、签到、挂机奖励、一键加钟、邮件、军团签到、珍宝阁、功法领取、重置盐罐、领取盐罐、爬塔、竞技场、竞技场 3 次、怪异塔、宝库前 3 层、宝库 4-5 层、咸王梦境、营地任务、开箱、宝箱积分、招募、钓鱼、灯神扫荡、免费道具、四圣碎片。

暂未迁移（依赖额外配置或题库）：自动答题、蟠桃园任务、换皮闯关、营地挑战、玄武赐福、竞猜类、兑换码、黑市采购清单、功法赠送。
