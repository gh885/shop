# E2E

真实浏览器路径覆盖，连运行中的 web / seller 与 Spring Boot，不在测试进程内 mock API。

覆盖两条链路：

- **买家下单主路径**：商详选规格 → 立即购买 → 结算 → 提交订单 → 支付成功
- **跨角色发货物流链路**：卖家登录 → 待发货订单 → 发货（选承运商 + 填运单号）→ 平台补录轨迹节点 → 买家查看物流，并断言卖家请求带对了 `X-Shop-Id`

## 每轮自带数据，不依赖演示库

`globalSetup.ts` 在第一个测试之前只走公开 HTTP 接口现造一套本轮数据，写完落进 `e2e/.fixture/run.json`（清单），测试读同一份：

```
注册卖家（随机 139 手机号）→ 设密码 → 开店 → admin 审核放行 → 建发货地址
  → 按类目属性模板造商品（草稿 → 规格 → SKU 价格库存 → 上架）
注册买家 → 设密码 → 建收货地址 → 预览下单 → 创建订单 → MOCK 渠道支付到 PAID
```

店名 / 商品名 / 地址 / 运单号都带本轮 `runId`，手机号与订单号每轮新起。所以：

- 测试里没有任何写死的手机号、订单号、演示库残留；CI 那台 Postgres 服务容器每次都是 Flyway 从零迁移的干净库，跑的就是真话
- 因此 CI 不再执行 `pnpm seed:demo`。本地想手工逛演示数据是另一件事，跟 E2E 无关
- 一轮跑完，库里留下的是本轮自己的行；重复跑不冲突，代价是本地 `shop` 库会攒下 `E2E店XXXX` 这类行，需要时人工清

密码由造数侧首设（`POST /auth/password`），浏览器侧一律走**密码登录**：那个手机号刚发过一次码，进页面再点「获取验证码」会撞 60s 重发窗。

发码要过图形验证码，dev 通道（`shop.auth.captcha-channel: dev` → `DevCaptchaChannel`）固定码直通，生产 profile 是 `real`，后门不装配。

## 本地运行

```bash
pnpm db:up
pnpm dev:server        # 另开终端
pnpm dev:web           # 另开终端
pnpm dev:seller        # 另开终端（跑卖家/跨角色用例才需要）
pnpm test:e2e
```

首次运行安装浏览器：`pnpm exec playwright install chromium`

只跑一条：`pnpm exec playwright test --config=e2e/playwright.config.ts --project=cross-role`

## 项目结构

- `fixtures/env.ts`：URL、dev 固定码、库连接、清单路径的唯一出处
- `fixtures/api.ts`：接口造数（每步失败都带状态码和响应片段）
- `fixtures/db.ts`：按运单号反查包裹 id（见下）
- `fixtures/run.ts`：本轮清单的读写
- `fixtures/ui-auth.ts`：浏览器登录，setup 与跨角色 spec 共用
- `tests/*.setup.ts` → `storageState`；`tests/*.spec.ts` → 用例

## 几个刻意的形状

**跨角色 spec 不用 storageState，自己现登录两个 context。** refresh token 是一次一换：同一个保存好的状态文件只允许一个消费方，两个 project 共用时先跑的那个把 token 轮换掉，后跑的静默失效。所以 `logistics.spec.ts` 买卖双方各开一个 context 现登录。

**卖家侧用例在 seller 未起时跳过，不判死整轮**（`E2E_SELLER_URL` 留空即跳过）。

**`shipmentId` 只能反查库。** 补录轨迹的端点 `POST /admin/logistics/shipments/{id}/tracking-nodes` 要包裹 UUID，而今天没有任何读接口给得出它（买家轨迹只有运单号/状态/节点，卖家侧没有包裹列表）。管理端补录轨迹那条 UI 建起来时必然要先有「按订单列包裹」的接口，届时把 `fixtures/db.ts` 换成接口调用。

**商详选规格用 `expect.poll` 重试点击。** TanStack Start 会把按钮 SSR 出来，水合完成前的点击被静默吞掉；判据用 `aria-pressed`，点着了才算，而不是靠 `waitForTimeout` 猜时间。

**登录走 UI 而不是塞 cookie。** setup 与跨角色用例都真点登录弹窗（`fixtures/ui-auth.ts`），为的是顺带跑住前端链路。代价是它按文案认元素（弹窗名「登录/注册」、Tab「密码登录」、头部按钮精确名「登录」）——这些文案改了这里要跟改，改错会红在登录那一步，不会静默跳过。

**轨迹录入走 admin API 而不是 UI**：管理端还没这个页面，产品里另一个写入方是承运商 webhook，它要验签、E2E 造不出签名。

## 环境变量

| 变量                                                                      | 默认                    | 说明                                                                    |
| ------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `E2E_API_URL`                                                             | `http://localhost:8080` | 后端地址（直连，无 `/api` 前缀）                                        |
| `E2E_WEB_URL`                                                             | `http://localhost:3000` | 买家端                                                                  |
| `E2E_SELLER_URL`                                                          | 未设置                  | 卖家工作台；不设则卖家侧用例跳过                                        |
| `E2E_DEV_SMS_CODE`                                                        | `666666`                | dev 短信固定码                                                          |
| `E2E_DEV_CAPTCHA_CODE`                                                    | `DEV4`                  | dev 图形码直通值                                                        |
| `E2E_PHONE_BASE`                                                          | 随机                    | 本轮手机号的随机段（调试想固定时用）                                    |
| `E2E_ADMIN_EMPLOYEE_NO` / `E2E_ADMIN_PASSWORD`                            | `admin` / `admin123`    | 平台员工，迁移种子创建，每次从零跑同一对                                |
| `E2E_FIXTURE_CATEGORY_ID`                                                 | 智能手机叶子            | 造商品挂靠的类目（须带 SPEC 属性）                                      |
| `E2E_FIXTURE_MANIFEST`                                                    | `e2e/.fixture/run.json` | 本轮清单路径                                                            |
| `SHOP_DB_HOST` / `PORT` / `USER` / `NAME` / `PASSWORD`、`SHOP_WSL_DISTRO` | 见 `fixtures/env.ts`    | 仅 `db.ts` 反查包裹 id 用；Windows 侧经 `wsl.exe` 里的 psql，Linux 直连 |

## 失败诊断

`playwright.config.ts` 里 trace / video / screenshot 都是 `retain-on-failure`，落在 `e2e/test-results/`。CI 在失败时额外上传 `e2e-diagnostics` 产物，把 `test-results` 和本轮清单 `e2e/.fixture` 一起留着——照清单能直接用接口重放出同样的数据。

## 三端 i18n 验收（不需要后端）

```bash
pnpm exec playwright install chromium
pnpm typecheck:e2e
pnpm test:e2e:i18n
```

Linux CI 安装浏览器时加 `--with-deps`，同时安装系统依赖。

- e2e/i18n.config.ts 自动构建三端，再启动 127.0.0.1:4310/4311/4312 的生产 preview。端口占用直接失败，不复用未知旧服务；测试结束由 Playwright 关闭子进程。
- 不加载业务 E2E 的 globalSetup、认证缓存或数据库配置。只在浏览器网络层替换认证响应与遥测收集，不创建账号、不调用真实登录或发短信接口。
- 覆盖英文首次加载、中英切换、未提交输入保留、SDK 两种语言请求头、刷新后 cookie 优先、软导航/刷新/返回时的页面标题和 hydration 错误。
- HTTP 并发检查 cookie 优先于 Accept-Language；文档必须返回 private, no-store 与 Vary: Accept-Language, Cookie。构建产物不能存在 welcome/index.html、sell/index.html，旧静态路径不得返回 200。
- 失败保留 e2e/test-results/i18n 内的 screenshot、trace。CI 的 frontend-i18n job 自动运行，不依赖后端 job。

这是生产构建在本机 preview 入口的验收，不等于验证真实 CDN/反向代理部署。部署层必须遵守文档缓存头，并整体替换旧构建目录，不能留下旧的单语言 HTML。

**已知诊断噪声：**页面卸载时的遥测 Beacon 在 Chromium 关闭/导航边界可能绕过 Playwright route；本机未起后端时，preview 会打印 `/api/rum/events` 的 `AggregateError [ECONNREFUSED]`。本套不验证遥测接收端，不能把这条日志算作监控链路已通过；认证和业务写操作仍由网络替身隔离。
