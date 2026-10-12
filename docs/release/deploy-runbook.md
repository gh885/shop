# 部署与发布 runbook

无域名阶段的拓扑（2026-10）：一台阿里云主机（2 核 1.6G，北京），同一公网 IP 按端口分三站。证书是 Let's Encrypt 的
**IP 证书**（6 天短期，certbot 自动续）。上线前的业务门槛（真实短信通道、支付网关等）另见
[production-readiness.md](production-readiness.md)——本篇只管「怎么把当前代码跑到主机上」。

```
浏览器 ──443──▶ 主机 nginx ──┬─ / 与 /assets ──────▶ web 容器（srvx + TanStack Start SSR，127.0.0.1:13000）
          8443（seller）    ├─ API 前缀 ──────────▶ server 容器（Spring Boot，127.0.0.1:18080）
          9443（admin）     ├─ 静态 SPA ──────────▶ /var/www/shop/current/{seller,admin}
                            └─ /img/ ─────────────▶ 七牛测试域名（http，经此转成 https）
server 容器 ──docker 网络 shop-infra_default──▶ shop-pg / shop-redis（~/shop-infra，数据面独立项目）
```

## 文件地图

| 位置                                                | 作用                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `deploy/docker/{server,web,static}.Dockerfile`      | 三份运行镜像；web 只装 dist + srvx（生产 SSR 开了 `ssr.noExternal`，没有裸 import） |
| `.github/workflows/build-images.yml`                | push main / 手动触发：打 jar、构建三端、推 GHCR，产出 `images.env` artifact         |
| `deploy/app/compose.yml` · `deploy/app/env.example` | 主机 `~/shop-app/` 的 compose 与常驻变量模板                                        |
| `deploy/host/setup-host.sh`                         | 一次性初始化（root）：certbot、目录、`.env` 生成、IP 证书、nginx 站点               |
| `deploy/host/deploy.sh`                             | 发布 / 回滚（部署用户，不需要 root）：拉镜像、切静态目录、起容器、等健康            |
| `deploy/host/nginx/`                                | nginx 站点与 snippets 模板，占位符由 setup-host.sh 渲染                             |

## 一次性初始化

1. 阿里云安全组入方向放行 TCP 443、8443、9443（80 已开，certbot 的 http-01 验证靠它）。
2. GitHub 仓库 Variables（Settings → Secrets and variables → Actions → Variables）：
   `SHOP_WEB_ORIGIN=https://<ip>`、`SHOP_SELLER_ORIGIN=https://<ip>:8443`、`SHOP_IMAGE_BASE_URL=https://<ip>/img`。
   这些是构建期烘进前端产物的，改了要重跑 build-images。
3. 把 `deploy/` 传到主机并以 root 跑初始化：

    ```bash
    scp -r deploy aliyun:~/shop-deploy-src
    ssh aliyun 'sudo bash ~/shop-deploy-src/host/setup-host.sh'
    ```

    脚本幂等：已有的 `.env`、证书不会被覆盖。它会打印证书目录与到期时间；`sudo certbot renew --dry-run` 验证续期链路。

4. 首次发布见下一节。GHCR 包首次推送后到 GitHub Packages 页面确认可见性是 **Public**（主机经镜像站匿名拉取，私有包拉不到）。

## 每次发布

1. push 到 main（或手动触发 `Build images`），等工作流绿。
2. 下载 artifact `images-env-<sha>`，传到主机，跑 deploy.sh：

    ```bash
    gh run download --name "images-env-$(git rev-parse HEAD)" --dir /tmp/images-env
    scp /tmp/images-env/images.env aliyun:~/shop-app/images/$(git rev-parse --short HEAD).env
    ssh aliyun "bash ~/shop-app/deploy.sh ~/shop-app/images/$(git rev-parse --short HEAD).env"
    ```

3. 冒烟：按 [smoke-matrix.md](smoke-matrix.md) 最小顺序过一遍；后端 `curl -s https://<ip>/api/…` 任挑一条、
   `ssh aliyun 'curl -s 127.0.0.1:18080/actuator/health'` 应为 `UP`。

发布顺序与 production-readiness 一致：数据库迁移由新 server 启动时 Flyway 执行（单实例，无并行发布），
静态产物先切、容器后换；迁移须向前兼容旧应用版本，回滚只回应用。

## 回滚

```bash
ssh aliyun 'ls ~/shop-app/images/'                     # 历史清单
ssh aliyun 'bash ~/shop-app/deploy.sh ~/shop-app/images/<上一版 sha>.env'
```

静态目录保留最近 3 个 release，镜像按 digest 钉死，回滚不依赖网络上还有没有那个 tag。

## 证书

- 6 天有效期，certbot（snap）定时器每天两次检查、剩 1/3 寿命时续，`--deploy-hook` 会 reload nginx。
- 看状态：`sudo certbot certificates`；演练续期：`sudo certbot renew --dry-run`。
- **续期断了 6 天内站就挂**：续期依赖 80 口对公网可达且默认站 root 仍是 `/var/www/html`。排查先看
  `journalctl -u snap.certbot.renew.service`。

## 排障速查

| 现象                         | 看哪                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| deploy.sh 卡在「后端未就绪」 | `docker compose --env-file .env --env-file images/<sha>.env logs server`；多半是 .env 缺项（prod profile 漏配即启动失败）或迁移失败 |
| 页面 502                     | `docker compose ps`；web 容器挂了看 `logs web`；nginx 侧 `sudo nginx -t`                                                            |
| 订单详情页刷新变 JSON 或 404 | nginx 的 `/orders` `/cart` Accept 分流没生效，对照 `deploy/host/nginx/shop.conf` 的 map                                             |
| 图片裂                       | `/img/` 反代目标（七牛测试域名）变了，改 setup-host.sh 的 `IMAGE_ORIGIN` 重跑                                                       |
| 登录 10 分钟后掉             | refresh cookie 是 Secure 的，只在 https 下生效；确认没有走 http 访问                                                                |

## 本阶段的已知例外

- **短信通道是 dev 固定码 666666**（`SHOP_AUTH_SMS_CHANNEL=dev`）：仓库里没有真实 `SmsChannel` 实现，公开 demo 要能登录只能如此。
  这是 production-readiness 明令禁止的「生产继承 dev」，接入短信服务商后第一件事就是改掉。
- 没有域名：三端按端口分站，refresh cookie 不能设父域，买家/卖家各自登录；买家站的 `VITE_SELLER_URL` 指向 `:8443`。
- 图片走主机反代七牛 **测试** 域名：带宽经主机、测试域名随时可能回收；换成自有 CDN 域名后改 `SHOP_IMAGE_BASE_URL` 并删掉 `/img/` 段。
- 观测栈未上主机（内存放不下），日志只在 `~/shop-app/logs/shop-server.log`（ECS JSON）与 `docker compose logs`。
