# 前端监控约定

- **状态**：实验室侧三条（`pnpm perf` Lighthouse、`pnpm perf:bundle` 产物体积、`node scripts/perf-cls.mjs` 位移归因）；RUM 发送端与接收端均已落地（单一出口 `captureError`/`track`、`sendBeacon` 传输、PV、接口事件、Web Vitals、白屏检测、hydration 失败，三端 router 均接 `defaultOnCatch`，接收端 `POST /api/rum/events`，接收与加工之间隔一层 Kafka，加工是消费端的一条 `RumProcessor[]` 链——PII 脱敏与路径归一已落，见 §首批功能）。采集侧是**插件式装配**（`createMonitor` + `Integration[]`，默认全开、可按端裁剪、可卸载，见 §装配与 [ADR 0007](../adr/0007-collector-assembly.md)）；发送侧是**一条管道**（出口 → 会话作用域 → 加工链 → 发送器，见 §装配）。装配期带信封守卫：`env` 是生产而 `version` 仍是缺省值时 `console.error` 一行（带错信封的历史日志事后改不回来）。SSR 服务端渲染错误、sourcemap 还原、指纹聚合仍待做

目标对标阿里的 1-5-10：**1 分钟发现、5 分钟定位、10 分钟恢复**。监控只管前两个数字，恢复靠灰度、回滚和预案（回滚前提见 [production-readiness.md](../release/production-readiness.md)「发布与回滚」）。后端对应的约定是 [business-event-logging.md](business-event-logging.md)。

## 原则：契约一次定对，组件跟着量长

两类代价不对称：

- **缺的数据补不回来**：没带版本号的报错，永远查不出是哪次发布引起的；漏存 sourcemap 的版本，线上堆栈基本还原不了
- **多搭的组件天天要养**：消息队列、流计算、时序库，每个都要部署、升级、再给它配监控；没有真实流量时猜不准瓶颈，提前搭的很可能搭错

判据：**晚半年再做，会不会丢掉补不回来的数据，或者要改所有调用方？** 会，归入「契约」，第一条上报之前定死；不会，再看现在需不需要——需要的进「首批功能」，不需要的进「延后项」，写下触发条件等着。

## 契约

1. **事件信封**：每条上报都带 `app`（web / seller / admin）、`version`、`env`、`session_id`、`user_id`（已登录时）、`route`、`ts`、设备维度、`schema`（信封版本）、`sample_rate`
    - `version` / `env` 与后端信封同名（GEN-48），前后端按同一套字段检索
    - `session_id` 在标签页首次加载时生成、存 `sessionStorage`：刷新不变，新标签页换新
    - `route` 取路由模板（保留 `$id` 这类占位），不取实际 URL
    - `sample_rate` 记上报当时的采样率：以后调了采样，历史数据仍能按比例还原成真实量
2. **请求关联**：沿用 GEN-35 / GEN-36 的 `x-request-id`——前端每个请求自带，后端落 MDC `trace_id`，错误信封里回填为 `requestId`。接口类事件带上它，前端报错能一跳到后端日志。它与 W3C trace-id 同为 32 位 hex，将来接 OpenTelemetry 直接复用，不另起 ID
3. **单一出口**：业务代码只调自己的出口函数（如 `captureError` / `track`，放 `@shop/monitoring`，三端共用），不直接依赖第三方 SDK；上报发往自己域名下的固定路径。换监控后端时，改动收在一个文件加一层转发。接入时这些锚点一并改走出口：
    - web 的 `reportError`（`apps/web/src/shared/lib/report-error.ts`）只做 web 特有的一步适配（区分 hydration 失败 vs 普通渲染错），实际出口是 `@shop/monitoring` 的 `captureError`；seller / admin 的 `defaultOnCatch` 同样直接指 `captureError`（两处 router.tsx）
    - 契约漂移的 `console.error` 锚点（`packages/client/src/sdk-client.ts`，GEN-28）已改走 `captureError`（控制台那行保留，给人看）
    - [i18n.md](i18n.md) 的翻译诊断由 `packages/i18n/src/message.ts` 统一上报：`i18n_missing_key` / `i18n_missing_param` / `i18n_invalid_message`，同实例内去重且不带插值参数
    - 错误文案兜底的计数（`packages/app-kit/src/data/notify.ts`）：`errorTextPlan` 走过「后端那句 detail」或「按状态码的通用句」两支时各报一条 `kind: "fallback"` 事件（结构化字段 `source` / `status` / `code` / `detail`），它是 [error-codes.md](../error-codes.md) 那套「按频次把句子升成 code」的唯一数据源；**接收端与读它的例行都已落地**，见那份文档的 §按频次升级：例行。两条形状上的硬要求：走 `track` 不走 `captureError`（后者按指纹限次 3 条、还会把状态码归一化掉，两者都会毁掉频次）；`source`/`status`/`code` 必须是结构化字段，不许拼进 `message` 让接收端正则捞
    - FUT-02 的曝光 / 点击上报落地时复用同一传输与信封，不另起一套
4. **版本与 sourcemap**：`version` 构建时注入（建议 git sha）。sourcemap 用 Vite `build.sourcemap: "hidden"` 生成（产物里不留 `sourceMappingURL`），按 `version` 归档，不随静态资源发布。**三端 vite.config.ts 已配 hidden**（`build: { sourcemap: "hidden" }`）；`version`/`env` 由 `VITE_APP_VERSION` / `VITE_APP_ENV` 注入（缺省 dev），注入点在 `.github/workflows/build-images.yml` 的构建步骤：`env: prod`（照抄 `application-prod.yml`，两边必须逐字相同才能按同一套字段检索）、`version` 取与 `SHOP_VERSION` 同一个 7 位短 sha。缺值即中断构建——**这两个值不能靠「记得配」**，因为它们漏了的症状是零。**装配期有守卫**（`monitor.ts` 的 `assertEnvelope`）：`env` 是生产而 `version` 仍缺省或为字面量 `dev` 时 `console.error` 一行——漏注入的症状是完全不报错，只在事后查不出「这批日志是哪次构建发的」，所以只能在那时候喊；只喊不抛，装配失败不能拦住应用启动
5. **隐私边界**：不采输入框内容、密码、token；URL 的 query 与 hash 不采（可能带 token 或个人信息）；手机号只以 `maskPhone` 形态出现（GEN-51）；会话回放如果引入，默认遮罩全部输入与文本

## 装配：一个入口 + 一份插件列表

采集侧（谁去挂监听、量指标）与上报侧（怎么发出去）分开。采集被拆成插件：

| 插件                      | 干什么                                     | 谁装                       |
| ------------------------- | ------------------------------------------ | -------------------------- |
| `globalErrorsIntegration` | 未捕获异常 / Promise 拒绝 / 资源加载失败   | 三端                       |
| `webVitalsIntegration`    | LCP / INP / CLS                            | 三端                       |
| `blankScreenIntegration`  | SPA 白屏探测                               | seller / admin（web 摘掉） |
| `breadcrumbsIntegration`  | 点击现场（错误信封里的「出错前点了什么」） | 三端                       |

装配只有 `createMonitor(options)` 一个入口，**默认全开**；要裁就传函数，按**实例同一性**裁而不是名字字符串：

```ts
// seller / admin：默认三件全开
createMonitor({ app: "seller", version: VITE_APP_VERSION, env: VITE_APP_ENV })

// web：SSR 首屏有 HTML，白屏采样没有意义
createMonitor({
    app: "web",
    version: VITE_APP_VERSION,
    env: VITE_APP_ENV,
    integrations: (defaults) => defaults.filter((i) => i !== blankScreenIntegration),
})
```

五条口径：

- **传输器不是插件。** 它只有一个实现、只干一件事（把队列送出去），由 `monitor.ts` 直接管。宿主认的是 `Sender` 接口（`enqueue` / `flush` / `pending`），不是 `Transport` 那个类——测试与 SSR 注入的桩因此不会被顺带挂上心跳定时器与 `window` 监听。
- **加工链也不是插件。** 「这条发不发」的规则（采样、限次，将来还会有脱敏与裁剪）住在 `processors.ts` 的 `EventProcessor[]` 里，默认两条、按 `processors` 选项增删，**数组顺序即执行顺序**。与插件的分工：插件管**采集**（挂监听、量指标），加工器管**放行**（改写或丢弃），两者都在 `createMonitor` 里装配。
- **会话作用域单独一份。** 设备画像与 session_id 在 `scope.ts` 算一次就缓存住（此前每条事件都要重读 `navigator` / `screen` / `sessionStorage`）；已登录用户、当前路由、面包屑也归它，且**跨装配保留**——重装监控不该把「出错前的现场」扔掉。
- **PV / 路由事件不是插件。** 订阅 router 是 router 持有者的事（`packages/app-kit`），包内只导出 `trackRoute`。
- **`dispose()` 只卸载，不 flush、也不重置单例状态。** 所以卸载而未重装时，游离的 `captureError` / `track` 仍按最后那份配置上报。装配是单例的：再次 `createMonitor` 会先卸掉上一套（这也是 web 那个 `useEffect` 在 StrictMode 下不残留监听的原因）。

选型过程与代价见 [ADR 0007](../adr/0007-collector-assembly.md)。

## 首批功能

「按需」的「需」按业务判断，电商里以下几项第一天就算需。**发送侧五条已全部落地**：

- **PV** ✅ 每次路由切换报一条（`onResolved` 订阅，模板化在出口做）。它是错误率、白屏率的分母，也是将来漏斗监控的底数
- **JS 异常** ✅ 捕获阶段监听 `error`（连带资源加载失败）、`unhandledrejection`、路由错误边界（三端 `defaultOnCatch`）。跨域脚本要加 `<script crossorigin>`，CDN 还得回 `Access-Control-Allow-Origin`，否则只拿到 `Script error.`
- **页面级失效** ✅ seller / admin 是 SPA，做白屏检测——加载后在水平、垂直中线上各取 9 个点调 `elementFromPoint`，全落在 html / body / 根容器上就判白屏。web 是 SSR，首屏有 HTML，要盯的是 hydration 失败（看着正常、点不动）——已在 `report-error.ts` 按消息特征单列事件名。⏸ **SSR 服务端的渲染错误不经过浏览器**，要单独捕获：需要服务端侧的传输（当前出口是浏览器 `sendBeacon`）且全局 request middleware 会改变 SSR 错误响应的状态码语义（TanStack issue #6796），两者都留到接收端落地时一并做；现阶段这类错误仍只进服务端日志（后端结构化日志已覆盖）
- **接口** ✅ 已接：`sdk-client` 的响应拦截器报成功（仅 `response.ok`）、错误拦截器报失败（5xx / 4xx / 网络层 `status:0` / 2xx 但契约漂移）。两条对称规则钉在 `api-events.test.ts`：**成功与失败各只报一次**（两个拦截器都经过，不对称就会一条请求报两条、错误率翻倍）；401 刷新后重放成功的不计。`endpoint` 走 `toRouteTemplate` 模板化（真实路径带 id，无界）。`setMonitoringUser` 也已接：`createMeQuery` 新增可选 `userIdOf`，me 变化时自动填/清信封里的 `userId`（登出即清，不靠各端记得调）
- **Web Vitals**（三端）✅ 用 `web-vitals` 采 LCP / INP / CLS；首次后台快照经 `RumVitals` 入直方图，看板展示 p75 和有效样本量。

接收端选型**已决定（2026-10）：走「后端加接收接口」**。当时的两个候选与理由留在这里，方便将来反悔时知道放弃了什么：

- **Sentry / GlitchTip**：错误聚合、sourcemap 还原、版本追踪、告警都是现成的；GlitchTip 比 Sentry 自建轻得多。**没选它**的原因是本仓最急着要的不是错误聚合，而是「`error_fallback` 的频次」这条**业务判据**——它需要与后端事件进同一套检索、复用同一套告警，而不是多养一个组件
- **后端加接收接口** ← **选它**：`POST /api/rum/events`（`rum` 模块的 `RumEventsController` + `RumIngestService`）。前端事件与后端事件进同一个检索、按 `trace_id` 直接关联，计数进 Prometheus 与后端告警共用 Alertmanager

落地边界：错误与兜底按有界标签计数、进日志；Web Vitals 已有去重与分布聚合。尚未做 sourcemap 还原、错误聚合、API 延迟细分与业务操作耗时；API / route 仍只计事件总量。

**接收与加工之间隔了一层队列（2026-10）**。接收端不再直接落数，而是把每条事件投进 Kafka 就返回 204——
它对浏览器的承诺（永远 204、不等下游）与下游是否可用就此解耦，代价是**队列不可用时遥测是丢的**
（只体现在 `shop.rum.publish.failed` 上，页面无感）。三件事定下了形状：**一条事件一条消息**（不是整批，
队列里的加工单位是事件，一条脏数据不该拖住整批）；**分区键是 `app`**（web / seller / admin 一端一个分区，
同端有序、三端并行）；**至少一次**（消费端位点加工成功才提交，所以重启窗口里计数可能多算一次——
要消掉它得给事件一个可去重的 id，那是信封契约的改动，见 §契约 1）。

分工是「**门外只做挡脏数据的事**」：不是数组、超批量、限流留在接收端；字段白名单、标签归一、去重、落数
归消费端（`RumEventSink`）。投递口的形状见 `rum/service/RumEventPublisher`：接收端不认识 Kafka，
只认识「投出去」这个动作。

**生产这条链路是关的（`shop.rum.enabled: false`）**。broker 要单独一台机器，而 2026-10 那台
2C/1.6G 主机实测可用内存 782M、swap 已用 490M，塞不下一个 JVM（判断与 [ADR 0005](../adr/0005-observability-hosting.md) 同源）。
不关的症状是这份文档里反复出现的那一类：**浏览器照发、接收端照回 204、投递指向不存在的
`localhost:9092`**——页面毫无感觉，只有 `shop.rum.publish.failed` 一路涨，而那条线没人配过告警。
关掉之后门口就拦下，一个假信号都不产生；上报照收照回 204，只是在 `RumIngestService` 第一步就返回。

一个开关（`SHOP_RUM_ENABLED`）同时管接收端与消费端，有了 broker 之后设成 true 重启即可，**前端一个字不用改**。
两个值分开翻都不好：只开接收端 = 投递必失败，只开消费端 = `@KafkaListener` 无 broker 时一直重连刷日志。

**消费端在落点之前有一条加工链（2026-10）**：`rum/processor` 下的 `RumProcessor[]`，由
`RumProcessingChain` 按 `@Order` 依次跑，**谁否决就在谁那儿停**。今天两环，顺序有意：

| 顺序 | 加工器                   | 干什么                                                      |
| ---- | ------------------------ | ----------------------------------------------------------- |
| 10   | `PiiRedactionProcessor`  | 扫全树所有字符串值，抹掉手机号 / 邮箱 / 身份证 / token 形态 |
| 20   | `RouteTemplateProcessor` | `route`/`endpoint`/`to` 砍 query 与 hash、纯数字段折 `$id`  |

脱敏是这条链上**唯一拦不住就要出事**的环节，补的正是契约第 5 条：那条要求发送端自觉，而这个端点
**匿名可达**——它不能是保障。三条口径写在类注释里，其中两条值得在这儿点一句：

- **扫全树，不维护字段白名单。** 白名单是「今天想得到的字段」，而夹带用户数据的字段是明天新加的那个。
- **命中按规则名计数**（`shop.rum.redacted{rule}`），不是按字段名——字段名由客户端给，进标签就是无界基数。
  这条在涨说明有调用方在漏数据，该改的是它，不是接收端。

`Bearer` 那条规则必须排在 `password/token` 键值对之前：顺序反了会把 `Authorization: Bearer eyJ…`
匹配成「authorization = Bearer」，把真正的 token **原样留在后面**——一个看起来脱敏成功、其实没遮住的假象。
`PiiRedactionProcessorTest` 专门钉了这条。

**脱敏在消费端，所以原始事件在 Kafka 里躺过一段**（topic 保留期内，本机开发默认 7 天）。
这是「重活不占请求线程」那条判据的代价，认它是因为 Kafka 是内网基础设施、而接收端是匿名可达的
公网口——把正则扫全树的成本（每条事件几 KB × 单批最多 100 条）放在公网入口上，等于给了一条
「用一个请求换我们一整轮 CPU」的路。真要收这个口子，是给 topic 设短保留，不是把脱敏挪回门口。

路径归一化是同一件事的执行侧兑现（契约第 1、5 条）：服务端不假设发送端已经把 query 砍掉。
段模板化**只认纯数字段**，照抄前端 `toRouteTemplate` 的取舍——「宁可模板化得不完美，也不要猜错」
（服务端没有 params 表，把 `/user/settings` 改成 `/user/$id` 是数据丢失）。代价是 `/orders/abc123`
这种非数字 id 仍然原样留着，这条已知。

信封版本对不上（`schema` 不是 `shop.fe.v1`）时**计数但放行**（`shop.rum.rejected{reason=schema_unknown}`）：
丢它的收益只是「不处理看不懂的字段」，代价是「前端先发版、后端后发版」那个窗口里的遥测全没了——
而那个窗口恰恰是正在发布、最需要现场的时候。前后端版本逐字相同由 `RumVocabularyTest` 钉。

**采样不在这一期**，理由两条：前端已按 `sample_rate` 抽样并把当时的比率存进信封（历史数据能按比例还原）；
而兜底事件的全部价值就是**频次**，在接收侧再采一次等于把它唯一的信号砍掉。它属于存储量真正出现之后的
那一步（见 §延后项）。

**明细落库（2026-10）：`rum.rum_events`，一条事件一行**。补的是这条链路一直缺的第三个出口——
计数与日志都只回答「多少条、什么时候」，而排查要问的是「这个错误影响了多少个会话」
「把它的堆栈和面包屑给我看」。表结构、列怎么划、为什么不分区，全在迁移
[V76](../../apps/server/src/main/resources/db/migration/V76__rum_events.sql) 的头部注释里；这里只留三条口径：

- **契约字段进列，kind 专有字段进 `payload` jsonb。** 信封是定死的契约，按它过滤、进列；各 kind 自己的
  字段还会长，提前替它们铺一排可空列就是替将来的自己猜。`payload` 存的是**整条事件的副本**（已脱敏）——
  重复那几百字节，换的是「哪天要把某个字段提成列时历史数据还捞得回来」。
- **落库在消费端**（`RumEventArchive`），不在 HTTP 线程——和加工链同一个理由。顺序是**先落明细再记账**：
  写库失败要抛出去重投，先计数再写库的话那次重投会把计数多算一遍。
- **保留按 `created_at` 删，不按客户端的 `ts`**（`RumRetentionJob`，默认 14 天，与日志侧同一个窗口）。
  `ts` 是外部可控的，用它决定删不删，等于把存储上限交给对面。客户端时间离谱时（1970 年、未来 30 天、
  不是数字）那一列用接收时刻兜住，**不丢这条事件**——原始值本来就躺在 payload 里。

**没做的两件**（与 §延后项 同一套判据）：**不分区**（PG 不会自己建下个月的分区，那是又一个得有人盯着的
作业；触发器是行数过千万）、**不降采样**（还没有量需要降）。索引一律 `CREATE INDEX CONCURRENTLY`，
理由与一处 squawk 豁免见
[V77](../../apps/server/src/main/resources/db/migration/V77__rum_events_indexes.sql)。

## 线上 Web Vitals：采集、去重与分布

三端共用 `packages/monitoring/src/vitals.ts`；`web-vitals` 负责标准算法（CLS 会话窗口、INP 交互分组、LCP 生命周期），项目不再自行累加偏移或取最长事件。普通构建走标准版，不发送 DOM 选择器、interaction target 或 attribution 数据。

### 样本口径

- 每次导航第一次转后台时，发送库已给出的各指标最新值；之前收到的 LCP 终值也暂存到这时。返回前台后的同 id 更新忽略。**这是首次后台快照分布，不是整页生命周期的最终值，不能直接与 CrUX 数字混比。**
- bfcache 恢复由库产生新 id，作为新样本；恢复后暂时出现的 CLS=0 不提前入桶。没有交互时不伪造 INP=0；浏览器不支持的指标保持缺失。SPA 路由切换不自行重置导航指标，操作完成耗时另行定义。
- CLS=0 正常入桶。后台事件先后顺序由微任务收尾处理，避免 transport 先 flush、指标随后才入队，滞留到已不会发生的下一次心跳。
- `viewport` 只有 `small`（媒体查询 max-width:767px）、`large`、`unknown`，代表发送快照时的视口档位，不冒充物理设备类别。会话采样继续由 `track` 统一决定，默认全量。

### 接收与查询

`POST /api/rum/events` 保持 text/plain JSON 数组与 204 契约；性能事件增加 `metricId` 与 `viewport`。前后端同批发布，旧格式不兼容，缺字段按非法样本拒收；错误/PV/接口事件不受影响。

| Prometheus 指标                           | 单位 / 标签                             | 用途                                                 |
| ----------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| `shop_rum_vital_seconds_bucket/count/sum` | 秒；app / viewport / name（LCP 或 INP） | 时间分布，接收的毫秒先转秒                           |
| `shop_rum_cls_bucket/count/sum`           | 无量纲；app / viewport                  | 布局偏移分布，零值也计样本                           |
| `shop_rum_vitals_discarded_total`         | reason                                  | invalid_vital / duplicate_vital / dedupe_unavailable |

业务标签全走白名单；原始 URL、用户 ID、客户端 version、metricId 不入指标标签。服务端全局 `application/env/version` 标签照旧，不能把匿名客户端字段覆盖到它们上面。`RumVocabularyTest` 核对前后端指标名与 viewport 词表。

- `metricId` 仅允许 1–128 位字母、数字、下划线和连字符；只收有限、非负数值。时间最大 300000ms，CLS 最大 100；越界拒收而非截断成正常值。
- Redis `SET NX` 对 `rum:vital:<app>:<name>:<metricId>` 去重一小时，跨实例同样有效。窗口内重放不入桶；超出窗口不保证去重。先占去重键、后记桶，两者非事务，进程在中间崩溃可能丢一条样本，不能承诺 exactly-once。
- Redis 去重不可用时丢弃性能样本并计 `dedupe_unavailable`，接口仍 204，不把可疑重复样本混进分布。原有限流器的 fail-open 策略不变。

看板：[Shop / Web Vitals](../../deploy/observability/grafana/dashboards/shop-web-vitals.json)，由既有 Grafana provisioning 自动发现。跨实例先按 `le/app/viewport` 合并桶再算 `histogram_quantile(0.75, …)`，不能平均各实例的 p75。分位数是桶插值近似值；无样本显示缺失，低样本量不适合告警。看板同时展示样本速率和拒收原因，尚未配置性能自动告警。

验证：`pnpm test:project @shop/monitoring packages/monitoring/src/vitals.test.ts`；先 `pnpm db:up`，再 `mvn -f apps/server/pom.xml test "-Dtest=RumVitalsTest,RumVocabularyTest,RumEventsControllerTest"`。后端测试覆盖真实 Prometheus 导出、单位、边界、去重失败和 HTTP 接线。回滚时前后端与看板一起回退，不单独撤销接收字段。

## 实验室指标：Lighthouse CI 与产物预算

`pnpm perf` 生产构建三端，Playwright 负责 preview 生命周期与 E2E 隔离造数，LHCI 对七个页面各跑三轮。配置与使用方法见 [perf/README.md](../../perf/README.md#lighthouse-ci)。

- **实验室与线上各答一个问题**：LHCI 测固定模拟环境里的 LCP / CLS / TBT 等，RUM 看真实用户的首次后台快照。没有交互的导航式 Lighthouse 不提供真实用户 INP 分布。
- **无效页面直接失败**：每一轮都必须留在预期路径、出现本轮业务内容、完成关键 API。检查使用 Lighthouse 自定义 gatherer/audit，断言用 LHCI 的 pessimistic 聚合；不能让两轮正常结果掩盖一轮登录页。
- **登录每轮重做**：refresh token 会轮换，不能把 LHCI 每 URL 调一次的登录 hook 当逐轮 hook。配置中没有账号口令；共用 E2E 测试数据与环境覆盖，只允许本机 HTTP 后端。
- **耗时阈值先告警**：LCP 2500ms、CLS 0.1、TBT 200ms 为 warn，中位数超线不会卡 PR。页面有效性与文档 HTTP 状态为 error。取得稳定 CI 波动数据后再调整/升级阈值。

CI 的独立 `lighthouse` job 起临时 PG/Redis 与真实后端，构建并测量三端，报告只进受限 artifact，保留七天。浏览器由 Playwright 锁定，Lighthouse 引擎使用 LHCI 自带版本；旧 13.x 手写脚本基准不能与当前 12.6.1 混比，旧基准文件已退役。

拨测核心链路（下单、支付）和导航性能测试仍是两回事；本配置仅测页面加载，不代替业务 E2E 或压测。

### 位移归因：CLS 的总分不是解释

`node scripts/perf-cls.mjs`（只用 `chrome-launcher` + 裸 CDP）。加它是因为 Lighthouse 给的是分数加「位移节点」，
**不给时刻、也不给因果**，于是 0.226 这种数只能靠猜着改。这条把 `layout-shift` 的 `sources[]`
（`previousRect` → `currentRect`）、发生时刻，和同一时间窗内能改到几何的三件事（DOM 变化、CSSOM 规则数、
位移节点自己的逐帧矩形）串成一条带时间戳的时间线，再配 `--block <URL>` 做因果 A/B。用法在 perf/README，这里是三条口径：

1. **观测阶段不限流才对得上 Lighthouse 的数。** 它导航测量用 `throttlingMethod: "simulate"`——CPU / 网络节流由
   Lantern 事后模拟，而 layout-shift 是**观测值**、模拟不出来。所以要复刻同一个数，就得同样不限流 + 同一套
   屏幕模拟（mobile 412×823 DPR1.75 / desktop 1350×940 DPR1，抄 Lighthouse 自己的常量）。显式加限流量出来的是
   另一件事（真机节奏），那个数不能再和基线比。
2. **Chrome 的实现叫 `currentRect`，草案里叫 `nextRect`。** 读错名字不抛异常、只静默给 `undefined`，症状是每条
   位移都显示「位移量未知」。合成测量里这类静默失败是默认怀疑对象——**先用一个人造位移页验探测器本身**
   （`perf/fixtures/`），再信它对真页面给出的结论。
3. **一条位移要分到三层里的一层，不能只盯 DOM。** MutationObserver 看不见样式生效，更看不见「图片固有尺寸到达」——
   后者会让版心在 DOM 和样式表都没动的情况下从 48px 跳到满宽。所以判据是：窗口里有 DOM 变化 → 插内容；
   CSSOM 规则数在位移 ±150ms 内变了 → 样式后到；**两者都没有 → 用 `--block` 掐可疑请求做 A/B**，
   位移消失就是它。跳过这一步就会把「插内容」的修法（占位、锁高）套到一条固有尺寸的位移上，白花力气。

两条 trace 的历史结论记在 [perf/cls-investigations.md](../../perf/cls-investigations.md)「两条位移：定性 → 修掉 → 复测」：
买家端首页 0.226 是**版心宽度跟着 banner 图的固有尺寸走**（`mx-auto` 的 flex item 缺 `w-full` ⇒ 宽度取 fit-content），
管理端审核台 0.630 是**权限到位后追加的二级侧栏把正文推走**（横移 176px = `aside.w-44` 的宽度）。
两条都由 A/B 或复现页钉死，不是推断；两条现在都已修掉（复测 CLS 0.000），修法的规则面落在
[frontend.md](frontend.md)「布局」那节，回归闸由 `page-shell-width.test.ts` 与侧栏那三条测试守着。
**这份约定只负责「没有 trace 就不许改」**——修哪一条、什么时候修，仍然是独立的决定。

### 产物体积：由成熟库承担预算与归因

`pnpm perf:bundle` 构建三端并执行 Size Limit 原生配置 [perf/size-limit.json](../../perf/size-limit.json)：三端浏览器 JS/CSS、web SSR JS 分开设 gzip 预算，超限或必需产物分组缺失即失败，CI 已接入。
`pnpm perf:bundle:check` 只检查已有 dist，不能证明产物来自当前代码；CI 使用前者，不跳构建。

体积是给定产物与压缩参数下的确定值，但 **全量 JS/CSS 不是页面实际加载量**。不再自行追静态 import 并把结果称作首屏；图片、字体、真实页面的动态路由加载仍由浏览器测量。SSR JS 的字节数也不能代替 TTFB。

`pnpm perf:attrib` 调用生产构建中的 `rollup-plugin-visualizer`，生成 treemap 与 network 报告。源码归因和依赖关系由库处理，项目只保留构建开关与报告落点。报告默认不打开浏览器，不进入 dist，普通构建不启用分析器。

预算调整、压缩口径与使用方法见 [perf/README.md](../../perf/README.md#产物体积size-limit)。Lighthouse 仍是另一套浏览器测量，不能用体积门禁的通过证明页面体验达标。

- **传输** ✅ `sendBeacon` / `fetch(keepalive)`，body 用 `text/plain` 避开 CORS 预检；`visibilitychange → hidden` 时 flush，**不依赖 `unload`**（移动端基本不触发）。队列**封顶 500 条**（溢出丢最旧的），发送连续失败按 1s → 2s → …… → 封顶 60s 退避，丢弃与跳过都计数，经 `createMonitor(...).stats()` 读出来——接收端长期不可用时不该把业务页的内存吃光，也不该把心跳变成重试风暴。**已知盲区**：`fetch` 那一支是「已发出」不是「送达」，同步的 flush 数不到异步失败——`transport.ts`
- **最早的错误** 🟡 全局监听在应用装配时挂（三端都早于首屏渲染），但**没有做 `<head>` 内联那一小段**：本仓脚本都是同源静态产物，没有跨域 CDN，`Script error.` 那个失败模式当前不成立；真接 CDN 时要补
- **不拖垮页面** ✅ 出口自身全部 try/catch、空闲时（`requestIdleCallback`）处理；🟡 采样率与总开关的**远程下发**未做（当前由 `createMonitor` 静态传入，接收端上线后补下发通道）
- **采样** ✅ 错误近乎全量，同一会话同一错误限次 3 条；性能按 session hash 抽样。两条都在 `processors.ts` 的默认加工链上，不在 `captureError` 里
- **现场** ✅ 内存常驻最近 30 条面包屑（环形保留，刷新即丢），随错误信封一起报——它不单独发，所以基本不花流量。三条来源：**路由**（`trackRoute` 记）、**接口**（`track` 在 `kind === "api"` 时记）、**点击**（`breadcrumbsIntegration` 在捕获阶段听）。前两条记在出口，不靠调用方记得；点击没有对应的出口函数，才需要一个监听。**点击只采 `aria-label` / `title` / `id`，不读渲染文本**——渲染出来的字可能是用户内容或订单号，而契约 5 把边界画在「不采输入框内容」上，最省事的守法就是根本不碰它
- **聚合** 🟡 发送侧已算好归一化指纹（`fingerprint`：归一化 message + 栈顶三帧，抹掉行号与数字/UUID）；**接收端按影响用户数排序、sourcemap 还原**要等接收端
- **告警** ⏸ 设最小样本量（凌晨 2 次请求挂 1 次，不该按 50% 错误率叫人）；新指纹单独告警，发布窗口内提级——与采集栈同批（observability.md 延后项第 1 行）

## 延后项（带触发条件）

终态参考（淘宝级。阿里内部是 Retcode，对外产品化为 ARMS 前端监控；另有 aplus 埋点与鹰眼链路）：

```
端 SDK → 独立日志域名 + 无状态接收层 → 消息队列
       → 流计算（清洗、sourcemap 还原、指纹、分钟级预聚合）
       → 分层存储（时序库存聚合 / 明细库存 7~30 天 / 数仓离线）
       → 大盘 · 告警 · 排查 · 发布卡口
```

下表是这条链路上的组件，按触发条件逐个长出来，没到条件不预搭：

| 组件 / 功能                               | 触发条件                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| 消息队列                                  | 接收层直写存储开始丢数据，或实时告警与离线分析要同时消费                     |
| 流式预聚合                                | 直接查明细算告警，1 分钟内算不完                                             |
| 动态基线告警（同比 / 环比）               | 固定阈值误报多到没人看                                                       |
| 漏斗转化监控（详情 → 加购 → 下单 → 支付） | 上线后日流量稳定、能做同比基线。它抓的是零报错的失效，比如按钮被透明浮层盖住 |
| 会话回放（rrweb，只传出错前几十秒）       | 反复出现「有报错、有面包屑，还是复现不了」                                   |
| 拨测（无头浏览器定时跑核心链路）          | 出现过「凌晨出故障、早上才发现」                                             |
| 灰度卡口与自动回滚                        | 发布频繁到人工盯不过来                                                       |
