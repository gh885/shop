# perf/ — 实验室测量：首屏得分与产物体积

两条命令：`pnpm perf`（Lighthouse 跑真浏览器，三端 7 个页面）与 `pnpm perf:bundle`（量构建产物字节）。
参数都在 `-- --help` 里。约定与「为什么这么分」在
[docs/conventions/frontend-monitoring.md](../docs/conventions/frontend-monitoring.md) 的「实验室指标」一节，这里只写怎么用。

## 文件

| 文件                   | 跟踪 | 作用                                                                                               |
| ---------------------- | ---- | -------------------------------------------------------------------------------------------------- |
| `pages.json`           | 是   | 被测页面清单，按 app 分组（端口、登录方式也在这里）。改它 = 换测量口径，改完必须重冻基线           |
| `baseline.json`        | 是   | 对比基准，按 preset 分段。每次跑都打印与它的差值                                                   |
| `history.jsonl`        | 否   | 本机趋势流水，一行一次运行。重跑可得，所以不入库                                                   |
| `runs/<时间戳>/`       | 否   | 每次的 `summary.json` + 逐页 Lighthouse 原始报表（`.json` / 可直接打开的 `.html`），只留最近 20 次 |
| `bundle-baseline.json` | 是   | 产物体积的对比基准。目标清单不在这里，硬编码在 `scripts/perf-bundle.mjs` 顶部的 `TARGETS`          |
| `bundle-history.jsonl` | 否   | 同上，体积那条的流水                                                                               |

## 常用几条

```bash
pnpm perf                                  # 三端逐个构建 + 起服务 + 7 个页面 × 3 轮，实测 4 分 22 秒
pnpm perf -- --no-build --pages home       # 只量首页、复用产物，改一处看一处的迭代节奏
pnpm perf -- --pages welcome               # 静态页单独量：这条不需要后端
pnpm perf -- --apps seller                 # 只量一端（端口要被腾出来，见下）
pnpm perf -- --baseline                    # 冻基线（要全量 + ≥2 轮，否则拒绝，见下）
```

前置：后端在 8080（`pnpm dev:server`）。不在场时脚本直接拒绝——SSR 页会出空壳，而**空壳页可能拿高分**，那是最坏的一种假数。

## 三端各自的端口，以及为什么不能换

| 端       | preview 端口 | 换得了吗 |
| -------- | ------------ | -------- |
| `web`    | 4173         | 能，随便 |
| `seller` | 5000         | **不能** |
| `admin`  | 4000         | **不能** |

后端 CORS 白名单（`apps/server/src/main/resources/application.yml` 的 `shop.web.cors-allowed-origins`）只认
`localhost:3000,5173,4000,5000`。preview 换个端口，浏览器里 SPA 自己发的那个 `POST /auth/refresh`
就吃 `403 Invalid CORS request`，页面停在校错误态——而它照样能拿个不错的分。买家端逃过这一条是因为它是
SSR：取数发生在服务端，没有浏览器跨域这一步。所以这两端的端口是**配置而不是偏好**。

由此得到一条操作前提：**跑之前把对应的 dev 服务关掉**（`pnpm dev:seller` 占 5000、`pnpm dev:admin` 占 4000）。
脚本用 `--strictPort` 起 preview，端口被占时它拒绝并点名是哪一端、该关什么，不会静默漂到别的端口上量一个 CORS 全红的页面。

## 工作台是登录后才有的页面，所以「进门」是测量的一部分

`seller` / `admin` 的 `/_app` 挂着 `beforeLoad: requireAuth`，没登录时它 302 到 `/login`——而登录页是一张干净的表单，
LCP 短、JS 少，能拿个很好看的分。**这是本项目最容易被忽略的一种假数**，所以脚本在每轮跑完都断言最终 URL 没落回
`loginPath`，落回去了直接失败而不是记录。

进去的链路比想象的绕，三条各自都是踩出来的：

1. **access token 只在内存里**（`packages/common/src/auth-kit.ts` 的模块级变量），刷新页面就没了，
   靠 `beforeLoad` 拿 httpOnly 的 refresh cookie 换回来。所以能给的入场券只有那枚 cookie。
2. **Lighthouse 的 `extraHeaders` 装饰的是它自己发的请求**，页面里那个 `POST /auth/refresh` 是浏览器的 fetch，
   不带它——实测加了 header 仍然停在登录页。唯一走得通的口子是往 Chrome 的 cookie jar 里塞：
   经 CDP `Network.setCookie`（手写约 20 行，不为此加一个依赖），并配 `disableStorageReset` 让它别被清掉。
   参数里必须用 `url:` 而不是 `domain:`+`path:`，localhost 上后者会被 jar 静默丢弃。
3. **每一轮都要重新登录、重新注入**：refresh token 是一次性轮换的，而轮换出来的新 cookie 带 `Secure`，
   浏览器在 `http://localhost` 上不肯存它。于是第二轮开始手里那枚已经是作废的旧值。

清单里的账号是 `seed:demo` 灌进去的公开演示号，只对本地后端有意义。脚本对此有一道硬闸：
要量的端里有工作台而后端不是 localhost 时，直接拒绝并让你改用 `--apps web`。

## 读输出

- **得分**就是 DevTools / PageSpeed 那四个圈。**指标**是逐轮中位数，`↑/↓` 读作「变好/变差」。
- `⚠` 标在越过官方「良好」上限的指标上（FCP 1.8s / LCP 2.5s / CLS 0.1 / TBT 200ms / SI 3.4s）。
  它和 `↑/↓` 是两回事：后者跟**上一次**比，前者跟**及格线**比——基线没冻过的页面、或冻的时候就已经烂的页面，
  差值那一栏什么都不印，页面照样能拿个不难看的分。当前在场上的两条：买家端首页 mobile `CLS 0.226`、
  管理端审核台 `CLS 0.630`（mobile 0.163，desktop 两轮都是 0.630，稳定复现，不是抖动）。
- 每页下面那行 `波动` 是本轮 LCP 的逐轮值和极差。**差值小于本轮极差时别当真**——同一份产物连跑三次，首页 LCP 实测 5862 / 5863 / 6603ms。脚本已经吞掉 50ms 以下的差值，但 50ms 只是下限，不是噪声上限。想量「代码变了没有」而不是「机器今天忙不忙」，用下面那节 `pnpm perf:bundle`。
- `待办` 是 Lighthouse 预估收益最高的几项，将来做优化时这就是清单。当前买家端三页共同的第一名是
  `unused-javascript`（~1.3–1.7s），商详还有一条 `redirects ~600ms`（`/products/$id` 会 307 到 `?spec={}`）。
  工作台那一组通常整行不出现（预估收益全是 0 就不印），偶尔冒出来一条也是 ~160ms 量级——别把它读成「没报出来」。
- `报表` 指向可以直接用浏览器打开的那轮 HTML。它指向的是 **LCP 最接近中位数的那一轮**，不是最好也不是最差的一次。

## 什么时候要重冻基线

- 改了 `perf/pages.json`（换了页面、换了钉住的商品 ID、换了端口或账号）
- 换了机器、或换了浏览器版本
- 一轮有意的优化落地之后（否则基线会一直把已修掉的差距算成待办）

`--baseline` 在两种情况下会拒绝并说明原因：轮数 < 2（单轮的波动就是噪声本身），或 `--pages` 只覆盖了清单的一部分（覆盖写会把基线里其它页面静默清掉）。

## 已知噪声源

- **第一轮普遍偏慢**：Chrome 冷启动。3 轮取中位数就是为了压它，`--samples 1` 只用于快速迭代，别拿来比。
- **工作台的第一轮不只是冷启动**：还叠了登录和首次进页取数，偏得多——实测卖家商品管理三轮 LCP
  5856 / 1960 / 1959ms，管理端审核台 3769 / 1510 / 1507ms。中位数正是为此而取；`--samples 1` 量工作台
  会拿到一个比真值慢三倍的数。
- **图片走 picsum.photos 外链**：Lighthouse 会真去公网取图，网络抖一下 LCP 就抖。这也是它该被优化掉的理由之一，但属于优化不属于测量。
- 本地测量会把机器负载算进结果：**跨机器、跨时段不可比**，只和同机器的上一次与基线比。

## 产物体积：pnpm perf:bundle

Lighthouse 那套量的是「这台机器今天跑出来多少毫秒」，这套量的是「这次改动往用户手机上多塞了多少字节」。
后者**精确、零噪声**：同一份 dist 连跑两次，history 里两行一模一样。所以它是目前唯一一个每次改动都能立刻相信的数字，也是将来真要设门禁时该先设的那一条。

```bash
pnpm perf:bundle                    # 构建 web / seller / admin 再量，约 1 分钟
pnpm perf:bundle -- --no-build      # 复用已有 dist，秒级
pnpm perf:bundle -- --baseline      # 冻基线
```

读法：

- 按 **target** 分块，`web` 拆成 `client` / `server` 两行——client 决定 LCP，server 决定 TTFB，混在一起量时一次只改服务端代码的提交会显示成「包涨了」。
- `↑/↓` 是相对基线的 gzip 差。这里**不设噪声下限**（体积本来就没有噪声），只有 512B 以下的舍入抖动不印。
- 每块下面的 top 5 是剥掉 content hash 后最大的几个 chunk。剥 hash 是为了让同一个 chunk 前后两轮认得出来。

它看不见什么：**最大的几个 chunk 叫 `src.js` / `link.js`**（Rolldown `autoCodeSplitting` 按目录和首个符号命名，名字不携带内容信息）。所以这份测量能回答「变大了没有、涨了哪一类」，回答不了「该拆谁」。要做到模块级归属得先出 sourcemap——那同时是 [frontend-monitoring.md](../docs/conventions/frontend-monitoring.md) 契约 4 为错误上报要的东西，一起做划算。

当前基线（06d302c7）：`web/client` 680KB · `web/server` 773KB · `seller` 598KB · `admin` 477KB，全平台 gzip 合计约 2.4MB。
