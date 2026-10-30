# telemetry — 自建的错误与链路平台

自研的"小 Sentry"：**采集端用上游成熟件，服务端自己写**。这套东西最终会长成完整可观测平台，但当前只做 Sentry 的那部分功能（错误 + 链路 + issue 工作流 + 告警），其余是后期目标，现在只留缝、不提前建。

## 为什么目录叫 `telemetry` 而不是 `obs`

**因为 `obs` 已经被占了**：`compose.dev.yml` 的 `obs` profile 是 prometheus + grafana（指标看板），`pnpm obs` 就是起它。同名会让"起看板"和"起本平台"永远分不清。

`telemetry` 是描述性占位名，随时可改：`git mv telemetry <新名>` + 全仓 `sed 's/telemetry/<新名>/g'`，没有别的耦合点。

## 边界（唯一硬约束）

```
shop 业务代码  ──✗──→  telemetry（任何）
apps/web ──→ @shop/monitoring ──→ @sentry/react      ──→ telemetry/relay
apps/server(infra 模块)      ──→ telemetry-sdk-spring ──→ telemetry/relay
telemetry    ──✗──→ shop（连 packages/common 都不要，常量自带一份）
```

三条禁令，编译期或 review 拦住：

1. `telemetry` 不 import `shop` 的任何东西（含 `packages/*`、`contracts/`、shop 的 Java 包）。
2. `shop` 只通过两个薄适配器接入：`@shop/monitoring`（前端唯一出口）、`apps/server` 的一个 infra 模块（后端唯一出口）。**业务代码零 import。**
3. Maven 依赖方向 `app → relay, server`；`relay` 与 `server` 互不依赖。`relay` 单独成模块的唯一目的，就是让"ingest 里不许出现查询/issue 逻辑"变成编译错误。

## 进程形态：一个 artifact，四个 profile

照抄 `sentry run web / consumer / cron` 那个模式——**职责不同的代码不分仓，伸缩特性不同才分进程**。

| profile  | 干什么                                                  | 是否能多副本 | M0       |
| -------- | ------------------------------------------------------- | ------------ | -------- |
| `relay`  | 唯一公网入口：DSN 鉴权、envelope 拆分、脱敏、限流、入队 | 是           | 必须     |
| `api`    | issue / event / trace 查询 + 平台前端静态资源           | 是           | 必须     |
| `worker` | 消费队列 → 校验 → 分组 → 落库 → 更新 issue              | 是           | 必须     |
| `cron`   | 告警规则评估、issue 回归检测、SLO（后期）               | 否（单实例） | M3       |
| `all`    | 以上四个同进程，本地开发用                              | 否           | 本地默认 |

拆进程的唯一正当理由是**伸缩特性或故障域不同**，不是"职责不同"。Sentry 把 snuba / symbolicator 拆成独立服务，是因为 Python 查 ClickHouse 撑不住、Rust 符号化 CPU 密集——这两个理由在 PG 起步 + 单机量级下都不成立，所以我们不拆，只留接口缝。

## 链路：一次报错 / 一次请求分别走哪

两边**共用同一条管道**，只是 item 的 `type` 不同。

### 报错（M0 唯一必须打通的）

1. **浏览器**：global handler 抓到异常，`@shop/monitoring` 补 shop 的字段（`tenant.id` / `service.name` / 脱敏后的用户 id）
2. **SDK** 组 envelope：一行 header（`event_id`/`dsn`）+ 一行 item header（`type`/字节长度）+ payload
3. **relay**：查项目配置 → 比 key → 按字节切开 →（M2 在此插脱敏/限流/采样）→ 入队。**到此结束，不写库**
4. **worker**：`XREADGROUP` 取一条 → 按 `proto/schema` 校验（不合格就记 `dropped(原因)` 并 ACK，**不重试**）→ 归一化
5. **分组**：`StacktraceFingerprinter` 算 fingerprint（纯函数）。全系统唯一决定“算不算同一条”的地方
6. **落库**：`event` 表追加（幂等）+ `issue` 表 upsert（`count+1` / `last_seen`）
7. **符号化**（只有前端要）：按 `debug_id` 找 sourcemap 反解栈帧；**原 payload 一个字不动**，可读栈另存。Java 栈自带类名行号，跳过
8. **api + web**：issue 列表 → 详情 → 取代表样本（只有到这一步才把 payload 拖出来）
9. **cron**（M3）：轮询 `alert_rule` → `alert_state` 状态机 → 通知

### 正常请求（M1）

1. 浏览器 fetch 注入 `sentry-trace` + `baggage`（采样决策已在 SDK 掷定）
2. SSR 层 continue trace；后端 `TelemetryWebFilter` 读 traceId/父 spanId → 生成自己的 spanId → 进 MDC → 回写响应头
3. `spring/jdbc`、`spring/rx` 产生 DB / 出站 span
4. 结束时两端各发一份 transaction，走同一条管道
5. trace 视图按 `trace_id` 查两个来源并拼成一棵树——**不需要任何关联配置**

延迟分位 / QPS / 错误率都是从这个表**算**出来的，不另采一套。后期那些大目标（指标、业务、容量）长在这一点上，不是新管道。

### 四个进程的边界

| 进程   | 输入        | 输出            | 不知道       |
| ------ | ----------- | --------------- | ------------ |
| relay  | HTTP 字节   | stream          | issue 是什么 |
| worker | stream 一条 | PG 行           | HTTP         |
| api    | 查询        | JSON            | 怎么写       |
| cron   | 定时器      | 状态转移 + 通知 | stream       |

### 一个必须记住的可靠性细节

worker 是 `XREADGROUP` → 处理 → `XACK`；崩了消息留在 pending，重投 = **at-least-once**。所以：

- `event` 写入必须幂等（`event_id` 唯一键 + `ON CONFLICT DO NOTHING`，**0 行更新是正常结果**）
- `count+1` 只能挂在“event 插入成功”那个分支，否则重投会重复计数

## 符号化：按 debug_id，读取时做

前端堆栈默认是 `index-8f21c0.js:1:28371`。要变成 `summary.tsx:74:12` 只需两样东西：**sourcemap** 和 **debug_id**。

**为什么键是 debug_id，而不是 `(release, filename)`**：文件名每次构建都带新 hash，靠它匹配是"符号表永远对不上"的根源。`@sentry/bundler-plugin` 会把 debug_id 同时注入产物和事件的 `debug_meta.images[]`，两边天然对得上。

**为什么上传不复刻 `sentry-cli` 的 artifact bundle 协议**：那是一整套（org token、zip + manifest、分片上传、release 关联），M0 复制它不划算。我们钉更小的契约：

```
PUT /api/{projectId}/sourcemaps/{debugId}?url=<bundle url>     body = 原始 .map
```

`telemetry/scripts/upload-sourcemaps.mjs <distDir>` 扫 `*.map`、取 `debug_id`、逐个上传。真要接 `sentry-cli` 那天是**新增一个 controller**，表结构和解析器都不动。

**为什么在读取时符号化，而不是写入时**：

- sourcemap 经常晚于事件到达（先发版后上传、事后补传）。写入时做等于这些历史事件永远只能是压缩态
- 代价是详情页每次多解析一次 map；详情页是低频操作

改成写入时的触发条件：详情页 QPS 上来了，或要按"还原后的文件"做聚合检索。那时在 `ingest` 里调一次 `StackReader` 并把结果落列，接口不变。

**状态必须可解释**：`SymbolicatedStack.status` 区分 `NO_DEBUG_ID`（SDK 没开注入）/ `NO_SOURCEMAP`（产物没上传）/ `NO_FRAMES`。界面上直接说原因——否则用户只看到一堆压缩位置，平台说不出为什么。

`SourceMapV3` 是自己写的（VLQ 解码 + 每行二分，纯函数）：Java 侧没有 `@jridgewell/trace-mapping` 那种事实标准，而这段能单测到边界。`proto/fixtures/demo/summary.js.map` 与浏览器样本钉在一起——改任一边测试就红。

## 摄取端点（只有 relay 对公网）

```
POST /api/{projectId}/envelope/                    # 前后端共用（浏览器带 CORS，后端不带）
POST /api/{projectId}/cron/{slug}/{checkInId}/     # 心跳：@Scheduled 成功/失败/进行中
POST /api/0/projects/{org}/{project}/releases/     # 部署事件（RCA 的时间锚，越早收越好）

-- 读（api 进程，与 relay 不同进程、不同边界） --
GET  /api/{projectId}/issues                      # 待办列表
GET  /api/{projectId}/events?issueId=             # 某条 issue 的样本
GET  /api/{projectId}/traces/{traceId}            # 一条完整调用链（M1）
```

认证按 Sentry 协议：`X-Sentry-Auth: Sentry sentry_version=7, sentry_key=<key>, sentry_client=<ua>`，也接受 DSN 里的 public key。**DSN 是公开标识符**，它只表示"往哪送"，不代表能读能改。

**必须支持 `Content-Encoding: gzip`**：官方 SDK 默认压缩请求体。我们最初只用 curl 测（curl 不发 gzip），
结果"本地全通、接真 SDK 全 400"。解压放在 `relay/ingest/RequestBodies`，上限 8MB——
解压炸弹是最省力的打垮入口的方式，完整配额在 M2。

**请求体不能用 `@RequestBody`**：message converter 是按 Content-Type 挑的，curl 默认发
`application/x-www-form-urlencoded`，Spring 就把 envelope 当键值对解一遍、**换行全被吃掉**，
最后报"缺少 header 行"（离真正原因隔着一小时）。envelope 是字节级协议帧（`length` 按字节算），
所以 `RequestBodies` 直接从 `HttpServletRequest` 的流里读，任何 converter 都无权碰它。

限流回 `X-Sentry-Rate-Limits`（SDK 认这个头会自己退避），丢弃原因必须可查——"为什么这条事件没了"是自建平台最常缺的功能。

## 数据形状：一个 event 有三种访问模式

| 访问模式        | Sentry 用什么     | 我们用什么                                    | 接口                     |
| --------------- | ----------------- | --------------------------------------------- | ------------------------ |
| 点查完整原文    | nodestore（blob） | PG `jsonb` 列                                 | `EventStore.get(id)`     |
| 扫 + 聚合       | ClickHouse/snuba  | 同表提升列 + `(project_id, received_at)` 索引 | `EventStore.search(...)` |
| 事务 + 唯一约束 | Postgres（issue） | PG（issue / alert / release）                 | 关系表                   |

**现在用一个 PG 表同时扮 nodestore 和窄版 snuba，但接口按三种模式拆开写。** 将来把 search 搬去 ClickHouse 时只换实现类，上层不动。

**M0 刻意不分区**：按天/月分区需要一个 DEFAULT 分区兜底，而 DEFAULT 分区一旦有数据，后续 `ATTACH` 新分区要全表扫描并在重叠时报错——这是运维陷阱，不是优化。触发条件：单表过千万行或 >100GB，届时按 `received_at` 月分区（理由写在首条迁移的头注释里）。

脊柱用 **Redis Stream**（不用 Kafka、也不用 PG outbox）：`XADD MAXLEN` + `XREADGROUP` + `ACK` 有消费组和 pending 重投语义，零新组件，且**让 relay 完全不碰 server 的表**——共用 outbox 表是未来搬家的粘胶。

## 两端采集：为什么后端不是"再加一个 SDK"

采集端用 `@sentry/react` / `io.sentry`（协议兼容，不自研），但**后端集成层是我们自己的代码**——上游的 `sentry-spring-boot-starter` 绑死 Spring 大版本，被它卡住就卡住整条链。只依赖框架无关的 core，5 个挂载点自己写：

| 挂载点                | 为什么前端没有对应物                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `spring/web` Filter   | 后端异常被框架吞、被 catch 成 4xx，全局钩子抓不到；且 **5xx 才上报**，业务异常只打 tag（否则订单校验一抖就刷爆 issue 列表） |
| `spring/web` trace 头 | 前端只产生 `sentry-trace`，后端**既接收 continue 又写回响应头**                                                             |
| `spring/jdbc`         | 前端最值钱的上下文是 console/fetch；后端是 SQL 耗时、慢查询、出站调用——这些同时是 span 来源                                 |
| `spring/async`        | `@Async` / 线程池 / `CompletableFuture` 会丢 scope 和 span 父节点，是后端 trace 断链的头号原因                              |
| `spring/mdc`          | `trace_id` / `event_id` 进 MDC。**这是将来接日志平台的唯一锚点**，现在不打，以后日志和 trace 永远对不上                     |

`spring/schedule`、`spring/rx`（RestClient/WebClient）同属这一族，按需加。

### 事务（transaction）在 SDK 侧是怎么产生的

三条不变量，每条都对应一次踩过的坑：

| 不变量                                      | 违反的后果                                                        |
| ------------------------------------------- | ----------------------------------------------------------------- |
| 事务的 span_id **就是**回写头里那个 span_id | 下游挂到一棵不存在的树上，一条链路裂成两棵                        |
| 采样决策只有一个来源（filter），SDK 不参与  | 上游 `sentry-sampled=0` 被本层重掷成"采"，链路多出半边            |
| 未采样时**根本不建**事务                    | 白建一个 sampled=true 的 NoOp 事务，上报被 SDK 判成"该发"就漏发了 |

实现上因此有两个反直觉的配置：

- `SentryOptions.tracesSampleRate = 1.0`。这不是"全采"，而是**把决策权从 SDK 手里拿走**：
  我们显式传 `TracesSamplingDecision`，真实的采样率写在 decision 里（事件里的 `sample_rate` 是真值），
  SDK 的 rate 只负责让"tracing 已启用"这个开关为真
- 事务名在 `finally` 里才设。路由模板要等 handler 跑完才有
  （`BEST_MATCHING_PATTERN_ATTRIBUTE`），而拿原始路径会让每个订单号变成一条独立事务

子 span 用 `TelemetryTrace.inSpan(op, description, body)`：**没有事务时是直通**，
所以业务代码和 JDBC 挂载点不需要写 `if (tracingEnabled)`——那种判断散落一次，就会多一段孤儿 span。
当前 span 存 ThreadLocal，这是 `spring/async` 挂载点必须存在的原因（跨线程要显式传）。

### JDBC：包 DataSource，不包 JdbcTemplate

shop 用的是 **MyBatis + JdbcClient**，两者都不走 `JdbcTemplate` 的拦截器链；而 `DataSource` 是它们
唯一的共同入口。包这一层，等于一次覆盖 MyBatis / JdbcClient / JPA / 手写 JDBC。

- 用**动态代理**而不是手写委托：JDBC 接口上百个方法，手写一定漏几个，漏掉的那个（通常是
  `unwrap`）会在某个库升级后变成 ClassCastException
- **SQL 参数不采**，只采带占位符的原句——真值里有手机号、地址、金额
- **批处理只记一个 span**（`executeBatch` 才开）：100 条 batch 变成一个节点，而不是 100 个没法看的节点
- op 按动词分（`db.select` / `db.insert` / `db.update` / `db.delete`）：全叫 `db.query` 的话，
  "这条 trace 里谁在写库"在树上根本看不出来
- 接法是 `BeanPostProcessor` 包现有 bean，**不是**再定义一个 DataSource——后者会和 Boot 的连接池
  抢装配顺序。没配 dsn 时**完全不包**，SQL 路径上与不装 SDK 一致

两个坑写在这里，省下一个人半小时：

- **压空白别用 `\s+`**：Java 15+ 里 `\s` 是"空格"转义，不是正则的空白类，换行压不掉。
  用 `lines()` 拼接更直白
- `getConnection()` 每次返回**新的**代理对象：用 `==` 比较两次拿到的连接的代码会不相等。
  排查时先想到这一条

### 异步：一个 `TaskDecorator` bean 就够

`ThreadPoolTaskExecutor` **没有 `getTaskDecorator()`**（只有 setter），所以"给线程池设置装饰器"
这条路没法判断是否已经有人设过。改用 Boot 自己的接法：容器里放一个 `TaskDecorator` bean，
`ThreadPoolTaskExecutorBuilder` 会主动取它并应用到 `applicationTaskExecutor`（`@Async` 用的就是它）。

- 只管 Boot 那个默认执行器。自定义 `ExecutorService` 要自己 `setTaskDecorator(new TelemetryTaskDecorator())`
- 你如果定义了自己的 `TaskDecorator` bean，我们的会让位（`@ConditionalOnMissingBean`），
  这时必须在你的装饰器里组合一下 `TelemetryTaskDecorator`，否则异步 span 断链
- 装饰器**不建新 span**：异步跳转没有耗时可言，加一个节点只是噪声。它只做"传进去、跑完还原"，
  任务里自己开的 span 会挂在**提交那一刻**的父节点下（服务端按 span_id 拼树，父节点是否已结束不影响）

## shop 侧怎么接：两个薄适配器，**都不进本目录**

```
apps/web ──→ @shop/monitoring ──→ @sentry/react ──→ relay
apps/server(infra 模块) ──→ @Import(TelemetryWebConfiguration) ──→ relay
```

`@shop/monitoring` **留在 `packages/monitoring`，不搬进来**。判据是“包该住在谁的需求变化时说”：

| 谁变                                    | 改哪个包                      | 住哪                                  |
| --------------------------------------- | ----------------------------- | ------------------------------------- |
| shop 要加一个 tag、加脱敏字段、开关上报 | `@shop/monitoring`            | shop 侧（它知道 tenant/店铺/角色）    |
| Spring 大版本升级、挂载点要跟着改       | `telemetry-sdk-spring`        | 本目录（纯框架 glue，不含 shop 领域） |
| SDK 升级、协议变化                      | `@sentry/react` / `io.sentry` | 上游                                  |

一句话：**glue 跟框架走（这里），context 跟领域走（shop 侧）**。这也是本目录没有 TS SDK 包的原因——前端那层薄适配 `@sentry/react` 已经做完了，shop 只需要填字段、选 transport。

```
telemetry.sdk.dsn           = http://<publicKey>@<relay host>/<projectId>   # 留空 = 只打日志，不发
telemetry.sdk.service-name  = api
telemetry.sdk.release       = api@0.1.0
telemetry.sdk.environment   = dev
```

一个 `@Import(TelemetryWebConfiguration.class)` 会带上全部挂载点（web / jdbc / async）；
只想接其中之一时单独 import 对应的配置类。

`tenant.id` / 用户这类**领域标签**由 shop 的 infra 模块提供一个 `TelemetryTagContributor` bean
（`request -> Map.of("tenant.id", …)`），采集端只负责贴上去；默认实现返回空 Map。
`TELEMETRY_SDK_DEBUG=1` 打开时能看到 SDK 实际发到哪个 URL、服务端回了什么——采集端不出数先看这里。

接入时 shop 侧只改两处：`packages/monitoring` 的 transport 目标（`VITE_TELEMETRY_DSN`）+ 一个 `beforeSend` 脱敏。`SHOP_RUM_ENABLED` 与 `perf/` 那套**完全不动**——它们是 measurement，和错误上报是两条线。

一个要提前量的代价：`@sentry/react` 带 browser tracing 估算 ~30–40KB gzip。三条路——接受、只在出错后 `import()`（丢早期错误）、或按路由分块。M0 接的时候按 `perf:bundle` 的真实数字定，现在不预设。

## 强制字段（两端同名同义，顺手对齐 OTel）

```
service.name / service.version(=release) / deployment.environment
tenant.id / projectId / trace_id
```

`proto/fixtures/` 里必须同时有浏览器 envelope 和 Java envelope 的真实样本——两者结构不同（Java 带 `threads`、`debug_meta`，frame 带 `module`/`class_name`）。只拿前端夹具测 relay，后端一接就炸。

## 采样：两端是不同的旋钮

|          | 前端                         | 后端                                                                                                                 |
| -------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 量级     | 用户数 × 页面数              | QPS × 请求数，大一到两个量级                                                                                         |
| 采样率   | 0.2 ~ 1.0 合理               | 0.01 ~ 0.1                                                                                                           |
| 关键约束 | 自己决定                     | **必须跟采**：`baggage` 里 `sentry-sampled=1` 就强制采，否则前端 trace 到后端断头；后端独立采出的孤立 trace 是纯噪音 |
| 错误事件 | 不受 `tracesSampleRate` 影响 | 同上，但走独立配额                                                                                                   |

所以 `ProjectConfig` 里 `tracesSampleRate` 必须按 project 区分，采样决策必须支持"继承上游"模式。**M0 就把 `ProjectConfig` 定成 cache-shaped**（控制面算、数据面本地执行），否则以后加采样/限流/脱敏都会变成每个 envelope 回查主库。

## 一条 trace 是怎么拼起来的（M1）

跨端连接不靠时间戳、不靠 URL，只靠**三个客户端填的 id**：

```
浏览器根 span          9a1b…5061   op=pageload       GET /checkout/:step
├─ ui.render           1f2e…7988   ← 错误事件挂在这里（a1b2…0718）
└─ http.client         3c4d…92a3   POST /api/orders   ← 这个 span_id 进了 sentry-trace 头
   └─ 后端根 span      2b3c…8192   op=http.server    parent_span_id = 3c4d…92a3
      ├─ db.query      4d5e…a3b4
      └─ serialize…    5e6f…b4c5
```

`TraceTreeBuilder` 只做四件事，每条都是为了不丢数据：

| 情况                      | 处理                                         | 为什么                                               |
| ------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| 父节点不存在（丢了/过期） | 提到顶层当根，parent 原样保留                | 能看到"这里断了一截"本身就是信息                     |
| 父子互指（客户端伪造）    | 显式栈 DFS + visited，环退化成一条链         | 递归实现会被一个畸形 payload 打成 StackOverflowError |
| 顺序                      | 按 `start_timestamp` 升序，不按落库时间      | 落库时间受网络乱序影响，同一 trace 内相对时间才可信  |
| 规模                      | 单条 trace 最多 5000 节点、最多取 500 个事件 | 畸形 `spans` 数组是最省力的内存打爆方式              |

返回形状是**拍平 + depth**（不是嵌套 JSON）：前端渲染只是一个 `map`，缩进由 depth 决定；
嵌套形状在"子树太大"时既不可观测也不可截断。

`transaction` 不参与分组、不产生 issue——所以它在 `ingest` 里走的是另一条分支
（`TransactionNormalizer`，单条插入、无事务）。`dropped` 表里能看到
`transaction_without_trace_id`：**没有 trace_id 的事务直接丢**，但原因必须可查。

演示（三条事件拼一条 trace，每步都能重跑）：

```bash
node telemetry/scripts/envelope-wrap.mjs telemetry/proto/fixtures/browser-error.event.json event   | curl -s -X POST -H 'Content-Type: application/x-sentry-envelope'       -H 'X-Sentry-Auth: Sentry sentry_version=7, sentry_key=dev-public-key'       --data-binary @- http://localhost:8090/api/1/envelope/
# 换成 browser-transaction.event.json / java-transaction.event.json 各重复一次
curl -s http://localhost:8090/api/1/traces/7c9e6679b1a24a3f8e5d0c1b2a394857
```

终端里应看到：`services=[web,api]`、`durationMs=520`、`errorCount=1`，
且 `http.server` 的 depth 比 `http.client` 深一层。

**换成真 SDK 再验一遍**（上游用夹具模拟，本段由 SDK 产生）：

```bash
TELEMETRY_CANARY_DSN=http://dev-public-key@localhost:8090/1   mvn -f telemetry/pom.xml test -pl sdk-java/spring -am   -Dtest=CanaryTraceTest -Dsurefire.failIfNoSpecifiedTests=false
```

它会带着夹具里那个 `http.client` 的 span_id 进来，于是同一棵树上多出
`http.client → http.server(api) → db.query` 三段——**这就是"跨端"在真实 SDK 下的样子**。
注意夹具的时间戳是固定的（2026-10-05），和"现在"混在一起时间轴会退化成 25 天，
所以演示前把库清一遍重投夹具（`TRUNCATE telemetry.event, telemetry.issue, telemetry.dropped`）。

## M0 验收（四条，缺一条就不算做完）

1. 浏览器抛错 → issue 列表出现 → 详情页**堆栈可读**（sourcemap + Debug ID 反解，不是 `a.b.js:1:28371`）。
2. 后端 5xx → 同一个 issue 体系里可见，业务异常（4xx）**不产生 issue**。
3. 一次买家请求：浏览器 → SSR → 后端 API **同一个 trace_id**，详情页能跳 span 树。
4. 同 `fingerprint + release` 的重复事件只 bump 计数、不重复存全文，且丢弃原因可查。

## 目录与里程碑（不建空壳）

```
telemetry/
├── proto/                  schema 真相源 + 两端真实 envelope 夹具（无代码）
├── proto-java/             telemetry-proto：envelope 拆分与 DTO（零业务，无 boot 依赖）
├── relay/                  telemetry-relay：唯一公网入口
│   └── ingest/ auth/ scrub/ ratelimit/ projectconfig/ queue/
├── server/                 telemetry-server：Spring Modulith，业务全在这
│   └── store/ ingest/ grouping/ symbolication/ issues/ events/ traces/ alerts/
├── app/                    telemetry-app：Spring Boot 装配，profile = relay|api|worker|cron|all
├── sdk-java/
│   ├── core/               协议与传输（只依赖 io.sentry core，不依赖 Spring）
│   └── spring/             上面那 5 个挂载点，我们自己写
├── web/                    telemetry-web：平台前端（独立 SPA，自有 Tailwind token）
└── deploy/ scripts/        本地起全套 / 抓夹具 / 回填 issue
```

| 里程碑 | 真建                                                                                             | 刻意不建                                                                      |
| ------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| M0     | proto、proto-java、relay、server{shared,store,ingest,grouping,issues,events}、app、sdk-java、web | `traces`、`alerts`、`symbolication` 的 symbolication 双策略里只先做 sourcemap |
| M1     | server/traces、symbolication（source-bundle 策略推迟）                                           | alerts                                                                        |
| M2     | relay 的 scrub / ratelimit / projectconfig 从桩变实                                              | —                                                                             |
| M3     | server/alerts + app 的 cron profile                                                              | —                                                                             |

空模块会污染 Modulith 边界测试，**宁可不建**。

## 抄与不抄

**抄**：① 同一代码多入口 profile；② 一个 event 三种访问模式分接口；③ project config 下发 + 数据面本地执行；④ 共享 envelope 夹具三处复用（SDK 单测 / relay 校验 / 前端渲染）。

**不抄**：① 多 repo（我们没有语言和发布节奏的理由）；② Kafka（Redis Stream 够，且不共表）；③ 独立 nodestore / snuba 服务（PG 分区表吃掉）；④ 独立 symbolicator（Node / JVM 库吃掉）。

## 门禁归属

| 门禁                                   | 是否纳入                                                                        | 说明                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `vp check`（lint/fmt）                 | 自动纳入                                                                        | 按文件扫，在仓里就跑                                             |
| `pnpm typecheck`                       | 自动纳入                                                                        | `pnpm -r --if-present` 会带上 `telemetry-web`                    |
| 根 `vite.config.ts` 的 `test.projects` | **不纳入**                                                                      | `pnpm test` 的 ~50s 是硬指标；平台半成品期常红，不该拦 shop 提交 |
| `pnpm build` / `vp run verify`         | **不纳入**                                                                      | 同上                                                             |
| 平台自己的测试                         | `mvn -f telemetry/pom.xml test`（Java）+ `pnpm --filter telemetry-web typecheck | build`                                                           | 前端还没测试 project，随 M0 第一个页面落地时加 |
| pre-push                               | 只跑 shop 的                                                                    | 平台自己的边界测试等它稳定后再进                                 |

副作用要记住：`pnpm test --changed` 检测得到这里的改动，但不会跑这里的测试。它真正要覆盖的是反向——**改采集端会不会打坏 shop**，而那正是"暂时放同一个 workspace"白送的能力。

## 搬家清单（六条全绿才搬）

1. 零 shop 依赖（含 `packages/common`、`i18n`、`@shop/api` 生成物）
2. 独立 DB + 独立 migration 目录
3. 独立 lockfile 或独立 catalog 条目
4. 独立 CI + 独立 test 入口
5. 本文件自洽（不依赖仓库根的规范才能读懂）
6. 对外只有两个契约：**DSN + proto schema**

那天 `git mv telemetry ../telemetry` 就能独立开工。唯一要提前接受的卡点：搬走后 `@sentry/react` 的接入要变成发布私有 registry 或 `file:` 依赖——现在 `workspace:*` 是免费的，这是"暂时放一起"的真实好处。

## 本目录当前状态

M0 的**四条验收全部通过**（含后端 5xx 那条）。M1 通了后端整条：transaction 入库 → 建树 →
`trace_id` 可点开，而且**事务已经由真 SDK 产生**（filter 生命周期 + 子 span + 采样继承）。
差的只有浏览器侧：现在 `ui.render` / `http.client` 这些还是夹具。

| 已实现                                                              | 桩 / 待实现                                     |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| relay：envelope 拆分（含 gzip）、DSN 鉴权、三端点、按项目 CORS      | 脱敏 / 限流 / 采样；project config 真取数（M2） |
| worker：动态发现 stream → 归一化 → 分组 → 落库 → issue（一个事务）  | 告警（M3）、采样决策                            |
| `event`/`issue`/`dropped`/`release`/`sourcemap` 迁移 + JdbcClient   | 多项目、鉴权、`dropped` 的查询界面              |
| sourcemap 上传 + 读取时符号化（自写 VLQ 解析）；原生栈 `NOT_NEEDED` | source bundle（Java 混淆才需要）、index map     |
| issue / event 读 API；前端 issue 列表 + 可读栈 + 状态提示           | issue 状态机操作、搜索                          |
| trace 视图：transaction 入库 → 建树 → 时间条；`trace_id` 可点开     | 浏览器侧 transaction（`@sentry/react` 未接）    |
| `sdk-java`：错误上报、**transaction + 子 span**、采样继承、标签钩子 | jdbc/async/rx 挂载点；浏览器侧（M1 第三跳）     |

已验证（本地真跑过，`java -jar` + `--profiles=all`）：

- `mvn -f telemetry/pom.xml test` **58 例**（proto 5 / sdk-core 4 / sdk-spring 23 / server 26），
  其中 3 例 canary（错误、事务、真库 SQL）需要真 relay，默认跳过（无 `TELEMETRY_CANARY_DSN` 时）
- **前端链路**：上传 demo sourcemap → 投浏览器事件 → `stack.status=OK`，两帧还原成 `summary.tsx:74:12`
- **后端链路（真 SDK，不是 curl）**：canary 投出 `IllegalStateException: canary: 库存扣减失败` →
  issue `#2`，`transaction = POST /api/orders/:id`（`42` 被净化成 `:id`）、
  `tags = {service.name: api, tenant.id: t_1001, http.status_code: 500}`、
  `request.headers` 只有 `User-Agent`（Cookie / Authorization 没出去）、Java 栈 82 帧 `NOT_NEEDED`
- **计数语义**：两个 canary 事件（event_id 不同）→ 同一 issue `count=2`；同 event_id 重投不涨
- **消费组**：所有 `telemetry:ingest:*` 的 `lag = 0`、`XPENDING = 0`
- **丢弃可查**：非 JSON 的 event → `dropped(1, event, unparsable_event, 1)`
- **跨端 trace**：浏览器事务 + 后端事务 + 浏览器错误（三份夹具，同一个 trace_id）→
  `GET /traces/{id}` 返回 7 节点、`services=[web,api]`、`durationMs=520`、`errorCount=1`，
  `http.server` 挂在 `http.client` 之下（depth 2 vs 1）
- **事务幂等**：同 event_id 重投两次 → 行数不变（2 条 transaction）
- **JDBC / 异步**：假 Connection 上验 SQL→span（op 按动词分、SQL 原文、参数不采、
  SQLException 原样抛回）、Spring 容器里 DataSource 是否被包（无 dsn 时不包）、
  跨线程子 span 的父节点是否仍是提交线程那条
- **真库真驱动**（`CanaryJdbcTest`，真 PG + 真驱动 + 真 relay）：
  `GET /api/orders/42` → `0 http.server(api) 133ms` → `1 db.select 22ms`
  `SELECT count(*) FROM information_schema.tables WHERE table_schema = ?`，
  参数值没进 description
- **真 SDK 的跨端**：`CanaryTraceTest` 带浏览器夹具的 trace_id + parent span 进来 →
  同一棵树上多出 `http.client → http.server(api) → db.query`，服务识别成 `api`（不是 `java`）

### 运行时打出的 8 个真 bug（都已修，且没有一个能靠手写 curl 复现）

前四个是 M0 后端上报那次挤出来的，后四个是 M1 让真 SDK 产生事务那次挤出来的。

1. **relay 不认 gzip** → 官方 SDK 全部 400。curl 不发 gzip，所以本地手测永远绿。
2. **消费组"已存在"靠异常文本判断**（找 `BUSYGROUP` 字样）→ 重启后**静默不消费**：
   lag 一直涨、进程不报错。改成用 `XINFO GROUPS` 判断"组在不在"这个事实。
3. **message converter 改写请求体** → curl 不带 `Content-Type` 时 envelope 的换行全被吃掉，
   报"缺少 header 行"。`@RequestBody byte[]` 不再用于 envelope，改直接读输入流（详见「摄取端点」）。
4. **kind 写死清单** → 官方 SDK 还会发 `client_report` 之类，没人消费的 stream 会无限增长。
   改成每 5 秒 `SCAN` 一次 stream 前缀，不认识的先原样落库。
5. **未采样时仍然建事务**：`TransactionContext` 里的采样决策写死 `true`，于是上游明确说
   `sentry-sampled=0` 的请求也会被发出去（测试里一眼看到"不采还发了 envelope"）。改成
   `context.sampled()` 为假时**根本不建**事务。
6. **后端事务在树上显示成 `java`**：sentry-java 把服务名放在 `server_name`，不放
   `tags.service.name`，建树时缺了这条兜底，服务名就退化成了技术栈名。
7. **后端事务的 op 是 `default`**：SDK 的默认值；不显式设 `http.server` 的话，span 树第一层没有信息量。
8. **错误节点的 op 抄了 trace.op** → 树上出现两层一模一样的 `ui.render`。错误节点的 op 固定为
   `error`："它掉在哪个 span 里"由层级表达，不需要再写一遍。

复跑：`pnpm db:up`（已有数据卷时补一次 `CREATE DATABASE telemetry`）→ `pnpm telemetry:build` →
`java -jar telemetry/app/target/telemetry-app-0.0.1-SNAPSHOT.jar` → `pnpm --filter telemetry-web dev`（6000）。

M1 的收尾只剩两件事：

1. **浏览器侧**：`packages/monitoring` 接 `browserTracingIntegration`，让 `ui.render` / `http.client`
   这些 span 由真实前端产生（现在还是夹具）。**会动 shop 的包**——那是适配器的位置
2. **`spring/rx` 挂载点**：`RestClient` / `WebClient` 出站 span 与下游头传递。
   现在后端调下游不带 `sentry-trace`，跨服务链路在这里断

真库/真 MyBatis 的联调不单独排期：它必须发生在 shop 侧接入的那一刻（一次真实下单请求），
用假 Connection 验不出"事务管理器 + 连接池 + 我们的代理"三者叠加的问题。
