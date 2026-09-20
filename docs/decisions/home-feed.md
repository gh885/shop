# 首页 Feed 流设计笔记

> 目的：首页「猜你喜欢」现在只是新品列表的第一页，推荐条的 tab 与刷新都没接线。这篇把 feed 流的**管道**
> （翻页、排序、召回、前端加载）先定下来，再说个性化——推荐算法不是第一个要解决的问题，
> 没有稳定的翻页与召回，算法无处落。
> 叙述方式：先说现状（§0），拍三个板（§1），再逐个设计点展开，最后是分期、落地清单与故意不做的事。
>
> **状态：V1 已落地，V2 / V3 仍是设计稿**（2026-09；决策三修订为 V1 即建 `recommend` 模块，并已按本稿实现）。
> 代码位置以 `apps/` 为根；`web/` = 买家端 `src/`，`server/` = 后端 `src/main/java/com/shop/platform/`。

---

## 0. 现状：现在的「feed」是什么

| 位置                                | 现状                                                      | 后果                              |
| ----------------------------------- | --------------------------------------------------------- | --------------------------------- |
| `web/home/queries.ts` `feedOptions` | 拉商品列表第一页 12 条，`sort: newest`                    | 六列布局只有两行，没有第二页      |
| `web/home/RecommendBar.tsx`         | tab 是没有 onClick 的按钮；「刷新推荐」只把词条翻回第一组 | 推荐条是装饰                      |
| `cms.recommend_tabs`（V13 种子）    | 每个 tab 带 `target` = 类目 id，`targetType = CATEGORY`   | 数据已备好，只差消费              |
| `ProductQueryService.pagePublic`    | `categoryId` 精确匹配；商品挂在三级类目                   | tab 指向一级类目时查出空          |
| `common/PageParams` / `PageResult`  | 只有页码分页，且每页回 `total`                            | 无限滚动途中上新会重复 / 漏掉商品 |
| `PublicProductResponse`             | 没吐 `sold_count`（列在 V45 已有）                        | 商品卡的销量槽位一直是空的        |
| `infra/security/JwtProperties`      | `/api/products` 整段跳过 JwtAuthFilter                    | 带 token 也不解析，个性化无从谈起 |
| 行为数据                            | 无曝光 / 点击记录；无缓存层                               | 「看过不推」「CTR」都没有原料     |

---

## 1. 开工前拍死的三个板

### 决策一：先修管道，不做算法

真正的推荐要三样原料：候选集、用户信号、反馈数据。现在只有第一样，而且翻页与召回都不稳。
V1 只做**通用流**：游标翻页、种子随机序、类目子树召回、无限滚动、销量字段。
这些用现有 200 件演示数据就能做，且是后两期的地基（§5）。

### 决策二：独立 feed 接口，不复用商品列表

列表接口（`GET /api/products`）要 `total` 与确定的排序（类目页、店铺页、搜索都靠它）；
feed 要游标、要种子、不需要 `total`、将来还要混排运营卡（§5 V3）。
两者响应形状不同，硬塞进一个端点只会让 `PageResult` 长出可空的 `nextCursor`。

**定案：`GET /api/feed`，返回 `{ items, nextCursor }`，不回 `total`、不做 count。**

### 决策三：V1 就建 `recommend` 模块，feed 的编排一步到位

feed 的代码天然分两半，归属不同：

- **有序召回**（上架商品按 `(seed, id)` keyset 翻页、类目子树过滤）只能由 product 实现——种子序跑在
  `product.products` 上，跨 schema 不 JOIN、不直查。它进 `product :: api`。
- **批次编排**（生成种子、编解码游标、装配出参，将来读用户信号）没有一行自己的数据，说的是推荐域的语言。

把这半留在 product，省不下代码（第一半无论如何在 product），只是让 `product.service` 长出「种子 / 批次」
这类只有首页货架才用的概念，并把 `/api/feed` 挂在 products 的语义旁边。V2 / V3 已定要有 `recommend`
（用户信号、埋点表），这不是投机模块，是把已定的边界提前一期落下。

**定案：V1 建 `recommend` 模块（`allowedDependencies = {"product :: api"}`），`GET /api/feed` 归它，
`product :: api` 新增参数化召回查询。** 依赖方向：`recommend → product :: api`；cart / favorite / order
已依赖 `product :: api`，同向不成环（Modulith 的环检测不按命名接口拆，所以方向必须是这个）；
V2 再加 `favorite / cart / order :: api` 仍是一条直线。

三条随之而来的改动——不是副作用，是要一起拍的口径：

1. **`product :: api` 的边界要改写。** `ProductReadQuery` 头部写着「刻意不提供按非键条件过滤」，
   `apps/server/AGENTS.md` 规则 2 写的是「跨 schema 只读按 ID 查询」。有序扫描两种都不是。落地方式：
   新增 `ProductRecallQuery`（`recallPage(seed, afterId, categoryId, limit)` → `List<ProductCardView>`），
   例外写在 `AGENTS.md` 规则 2（「按 ID 点查」与「有序扫描」两类）与 `product/api/package-info.java`，
   **`ProductReadQuery` 的自述保持不变**——召回在隔壁类里，它「不提供按非键条件过滤」依然是真的。
2. **出参不能跨模块复用。** Modulith 不让 recommend 引用 `product.controller.response`，ArchUnit 又要求
   `*Response` 只能在 controller 包、handler 出参必须是 `*Response` 或 `.service.` 形状类。所以 feed
   自建 `FeedItemResponse`，由 `product :: api` 的投影装配。这与决策二自洽：feed 的 item 契约本来就该能
   独立长出 V3 的运营卡联合类型，不该和 `/api/products` 绑在一个 record 上。
3. **`recommend` 在 V1 没有自己的表。** 规范说「模块 = 顶层包 = schema」，而它的第一张表（曝光 / 点击）
   到 V3 才来。别为凑形状建空 schema：在规范里写明「模块可以先没有 schema，有 schema 的模块必须独占」，
   比建一张空表诚实。

**给 V2 留的接缝**：`product :: api` 只认参数不认用户，面向用户的编排（信号 → 召回参数）归 recommend。
§2.5 的 Redis 预热落地后，`ProductRecallQuery` 退役——recommend 自己持有「tab × seed 的有序 id 列表」，
再用已有的 `productsByIds` 批量取卡，外部契约不动。

---

## 2. 召回与排序

### 2.1 游标翻页（keyset），不用 offset

无限滚动途中有商品上架 / 下架，offset 会让第 N+1 页重复或漏掉第 N 页的边界项。
游标记「排序键 + id」，谓词 `(key, id) > (lastKey, lastId)`，集合中途变化只影响还没翻到的部分。

### 2.2 种子随机序

需求是「同一次浏览内顺序稳定、不重不漏；换一批就是另一种顺序」。排序键取 **id 与种子的哈希**：

```sql
SELECT id, shop_id, category_id, name, subtitle, main_image, min_price, max_price, currency, sold_count
FROM product.products
WHERE status = 'PUBLISHED'
  AND category_id IN (:leafIds)                                              -- tab 指定类目时才有（§2.3）
  AND (md5(id::text || :seed), id) > (md5(:lastId::text || :seed), :lastId)  -- 首页无游标时省略
ORDER BY md5(id::text || :seed), id
LIMIT :size + 1                                                              -- 多取一条判断有没有下一页
```

- 种子由服务端在**无游标的首请求**生成（16 位 hex），塞进 `nextCursor` 带回；后续页原样带回来，服务端无会话状态。
- 排序键是 (id, seed) 的确定函数，所以 keyset 谓词成立；id 作第二排序键只是形式上的严格保证。
- 不用 `setseed() + random()`：会话级状态在连接池下不可靠，且 `random()` 无法做 keyset。
- 只有 200 件商品也能有「每次进来不一样」的活感，这是随机序的主要收益。

### 2.3 类目 tab 按子树召回

商品挂在三级类目，tab 的 `target` 可能是一级（V13 里「运动户外」指向一级类目）。
`CategoryService` 加 `descendantIds(categoryId)`：自身 + 全部后代，召回查询用 `category_id IN (...)`。
类目表不到百行，每次请求内存展开即可，不缓存。
**展开留在 product 内部**：`ProductRecallQuery` 只收 root `categoryId`，recommend 不认识「子树」这个概念，
也不为它多开一个 api 方法。

tab → 类目的映射在**前端**做：`tab.targetType === "CATEGORY"` 才传 `categoryId`，
其余（「猜你喜欢」的 `SEARCH` / null）一律全站。未知类目 id → 空流，不 404。

### 2.4 热销加权与打散：候选，不进 V1

- **热销加权**：用 Efraimidis–Spirakis 加权抽样，排序键改成 `-ln(u) / w`
  （`u` 取哈希前 8 位归一到 (0,1]，`w = ln(sold_count + 2)`）。键仍是 (id, seed, sold_count) 的确定函数，
  keyset 照旧；代价是 `sold_count` 在浏览途中变化会让该商品跨过游标——重复或漏掉一件，前端按 id 去重兜底（§4.5）。
- **打散**（同店不连续）：随机序天然不聚堆，V1 不做。等有了加权或个性化再上；
  打散会破坏 keyset 的严格性，到时用「多取一页、打散、截断」的窗口方式。

### 2.5 代价与量级上去后的路

排序表达式走不了索引：每页要在上架集合上做 top-N 堆排。`idx_products_published_created` 的部分索引条件
（`status = 'PUBLISHED'`）能圈出行集，但排序仍是全量。万级以内毫秒级；十万级以上把
「每个 tab × seed 的有序 id 列表」预热进 Redis（已在栈里），由 recommend 侧按范围翻页、再经
`product :: api` 的 `productsByIds` 批量取商品卡——HTTP 契约不变，退役的是 `ProductRecallQuery`（决策三）。
这与 README「无缓存层」的口径一致：现在不做，路先写下。

---

## 3. 接口契约

```
GET /api/feed?categoryId=<uuid>&cursor=<opaque>&size=24
→ { items: FeedItemResponse[], nextCursor: string | null }
```

| 项            | 定案                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 鉴权          | 匿名可达：`JwtProperties.skipPaths` 加 `/api/feed`（不写 `/api`）；Vite proxy 的 `/api` 已覆盖                                                                                 |
| `size`        | 默认 24（六列四行），上限 48                                                                                                                                                   |
| `cursor` 形态 | `<seed>.<lastId>`；服务端按 `^[0-9a-f]{16}\.[0-9a-f-]{36}$` 校验，不合法 400。哈希可由 lastId + seed 重算，游标里不用存。客户端视为不透明字符串                                |
| 换一批        | 不带 `cursor` 再请求一次 = 新种子                                                                                                                                              |
| `nextCursor`  | 末页为 `null`，标 `@Schema(nullable = true)`（真会发 null 的字段才标，见 architecture.md §4.2）                                                                                |
| `items`       | `FeedItemResponse[]`（recommend 自建，见决策三第 2 条），由 `product :: api` 的 `ProductCardView` 装配；卡片字段与 `PublicProductResponse` 同构，但**不共享 record**           |
| `soldCount`   | 两条链路各补一份：`ProductCardView`（api 投影，feed 用）与 `PublicProductResponse`（`/api/products` 用），都是 `long` 非空。详情页「本店推荐」「看了又看」走的是后者，靠它点亮 |
| 店铺名        | 不进 feed：跨模块，且货架卡不显示                                                                                                                                              |

命名按 `apps/server/AGENTS.md`（recommend 模块）：`recommend/controller/FeedController`（`@Tag(name = "feed")` → SDK `FeedApi`，方法 `listHomeFeed`）、
`recommend/dto/FeedQuery`、`recommend/controller/response/FeedResponse` + `FeedItemResponse`、`recommend/service/FeedService`、`recommend/service/FeedCursor`（编解码）；
product 侧新增 `product/api/ProductRecallQuery` + `ProductCardView`。

召回查询在 `product/api/ProductRecallQuery` 里用 `JdbcTemplate` + 显式 `RowMapper` 直接装配 `ProductCardView`：
游标谓词与 `ORDER BY md5(...)` 是原始片段，但 **seed 与 limit 都走绑定参数**（形态由 cursor 正则先挡一道，
再绑定而不是拼串——排序表达式里放参数是合法的）。（与 `ProductReadQuery` 同口径，api 包本就是允许裸 SQL 的地方）。
刻意不映射 `Product` 实体：`autoResultMap` 只在 MP 自己的 ResultMap 上生效（见 `SkuMapper.selectByValueId` 注释），
手写 SQL 会让 JSONB 列静默变 null，半空的实体是隐患——投影 record 只取卡片要用的列，没有 JSONB，这个坑也就绕过去了。

---

## 4. 前端

### 4.1 无限查询，首屏仍走 SSR 流式

`home/queries.ts` 的 `feedOptions(categoryId)` 改成 `infiniteQueryOptions`
（key `["home-feed", categoryId ?? "all"]`，`initialPageParam: undefined`，
`getNextPageParam: (last) => last.nextCursor ?? undefined`），组件用 `useSuspenseInfiniteQuery`。
首屏机制不变：loader 不预热，Suspense 边界挂起，SSR 吐骨架、第一页 resolve 后经 queryStream 流式补发。SSR 只取第一页。

第二页起靠 `IntersectionObserver` 哨兵：放在网格末尾，`rootMargin` 提前一屏触发，
`hasNextPage && !isFetchingNextPage` 时调 `fetchNextPage`。
`fetchFeed` 与它的 query key 同住 `home/queries.ts`（frontend.md：key 归属 = 域），**不进 `products/detail/queries.ts`**——
那里已经错放了「本店推荐」「看了又看」两个推荐取数，再塞 feed 就是第三个。feed 的取数留在 `home/` 内，
需要跨域时经 `home/index.ts` 桶文件导出（`fetchProducts` 的既有模式）。
feed 的 UI 也从 `routes/index.tsx` 抽成 `home/Feed.tsx`：骨架 / 哨兵 / 尾部四态 / 封顶按钮都归它，
路由文件只留布局与区块顺序——否则它从现在的 143 行涨到 300 行，且无限滚动没法单测（frontend.md：route 文件保持薄）。
这是仓库第一个无限查询，没有先例可抄。

### 4.2 新鲜度：这份缓存只在两种情况下换

`staleTime: Infinity`，`refetchOnWindowFocus: false`，`refetchOnReconnect: false`。理由很具体：

- 商品卡在**新标签页**打开，用户看完商品切回首页就是一次窗口聚焦。默认的聚焦重取会串行重拉全部已加载页，
  且第一页无游标 → 新种子 → **整页换序**，恰好发生在用户回来继续逛的那一刻。
- SSR 水合后若数据已过默认 10s 的 staleTime，客户端会立刻重取，首屏刚画好就换一批。

内容只经两条路更新：「换一批」（§4.4）与整页重载。

### 4.3 失败态分两种

- 第一页失败：无数据 → 全局 `throwWhenNoData` 抛给现有的 `QueryBoundary`，整块替换成错误态 + 官方 reset 重试（现状不变）。
- 追加页失败：`data` 仍有已加载页，suspense 查询不抛（同一判据），`isFetchNextPageError` 为真 →
  在列表尾部就地渲染「加载失败，重试」，重试 = 再调 `fetchNextPage`。保留已加载内容，不整块替换。

`retry: false` 保持：SSR 流式不该等指数退避；追加页失败有就地重试。

### 4.4 换一批 = `resetQueries`

「刷新推荐」改为 `queryClient.resetQueries({ queryKey })`：丢掉已加载页，只重拉第一页（无游标 → 新种子），
组件重新挂起、走 `QueryBoundary` 的骨架。不用 `invalidateQueries`——它会把已加载的 N 页**串行**全部重拉。
conventions 里「不用 refetch() 当刷新」说的是 mutation 后的刷新，这里是用户主动换批次，语义不同。

### 4.5 封顶与去重

- 自动加载封顶约 8 页（≈200 卡），之后换成「继续加载」按钮；卡片高宽比固定，将来上虚拟列表不用改布局，V1 不上。
- `select` 里把 `pages` 拍平并按 id 去重：防 React key 冲突，也是 §2.4 加权变体的兜底。

### 4.6 tab 状态放哪：组件本地 state，不进 URL

设计讨论时曾建议「与订单页一致进 URL」，这里修正。

先分清一件事：URL 承载的是**意图**（哪个 tab），不是**内容**。内容随种子变是设计使然，搜索页也一样
（同一关键词不同时间结果不同，关键词照样进 URL）。所以「不同时间看到的数据不一样」本身不是否决理由。
真正决定的是**有没有人需要这个链接、页面会不会被离开**：

| 进 URL 的收益       | 在本页成立吗                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------- |
| 后退恢复到原 tab    | 不成立：商品卡新标签页打开，首页从不被离开                                               |
| 刷新保留 tab        | 弱：刷新回默认 tab 是淘宝 / 京东的既定行为，用户不会觉得丢了什么                         |
| 深链到某个 tab      | 无入口：导航词条的目标是类目页（另一个路由），运营 banner 指向活动页，都不是 feed 的 tab |
| SSR 按 tab 渲染首屏 | 只在直接访问带参链接时有用，而没人会发这种链接                                           |

代价倒是实打实：每次切 tab 要 `replace` 写 URL、`validateSearch`、CMS 词条下线后的脏值收敛，三处代码换零个用户可感知的收益。

**定案**：tab 由 feed 区块组件（`home/Feed.tsx`，§4.1）持有（`useState`），传给 `RecommendBar`（受控）与 feed 查询（转成 `categoryId`）。
两个消费点都在这一个区块内，路由文件不必知道 tab 的存在。
query key 仍含 tab，各 tab 各自缓存，切回不重拉。**改进 URL 的触发条件**只有一个：出现需要深链到 tab 的入口
（站外投放、运营位）。到时 `replace: true` 且脏值收敛为默认 tab。

订单页进 URL 是另一回事：页签 + 页码可复现，且从订单详情返回必须回到原页签——两条在这里都不成立。

### 4.7 切词条不换骨架（其余做法会让页面抖）

feed 是**已揭示的** Suspense 边界，换 query key 会重新挂起，按默认行为网格会被换成一屏骨架。代价不只是"闪一下"：
文档高度先变一次，浏览器会把滚动位置钳回顶部——实测滚到 900 再切词条，`scrollY` 直接变 0。

**定案：切词条走 `startTransition`。** transition 期间 React 保留旧内容，新词条数据到位后一次性替换；
这段窗口里网格 `opacity-60`、尾部「加载中…」，并且**不自动翻页**（此时 `hasNextPage` / 已加载页数都还是上一个词条的处境）。

为什么不用 `placeholderData: (prev) => prev`：`useSuspenseInfiniteQuery` 在实现里硬写了 `placeholderData: void 0`
（实测 @tanstack/react-query 5.102 源码：suspense 版刻意不吃占位数据）。仓库里「带 placeholderData 的列表不进 suspense」
说的正是同一件事的另一面——那条路只对非 suspense 变体成立。

**同批修掉的塌陷**：`.feed-section` 是 flex 列容器（`main`）的子项又带 `mx-auto`，auto 外边距取消 flex 子项的 stretch，
于是整节是 shrink-to-fit。真实 feed 被卡片内容的固有宽度撑着看不出来，而骨架全是空 div、没有固有宽度——
骨架态下整节只剩 ~108px（`.grid-feed` 60px、每格 0×0），文档高度塌到视口高，滚动被钳回顶部。
修法：`feed-section` 补 `w-full`（注释在 `apps/web/src/styles.css`）。这条只在骨架期暴露，所以第一次进入首页（SSR 吐骨架）也会中招。

#### 4.7.1 空词条 / 只有一两件时的那一下（第二轮）

`w-full` 与 transition 之后还剩一类抖动，实测都发生在**数据落地那一下**，而且只在词条两端为空时显形：

| 方向              | 实测                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| 一页商品 → 空词条 | feed 区 1346px → 109px，docH 1987 → 988（≈视口高）；用户停在 y=900 时被浏览器钳回 **0** |
| 空词条 → 一页商品 | docH 988 → 1355，页脚从 771 掉到 1138（整块下移）                                       |

根因是**同一件事**：feed 区高度完全跟着词条内容走（109px ↔ 1350px），而它下面是页脚。

**定案三条：**

1. **`feed-section` 保底「吸顶条以下的整屏」**：`min-h-[calc(100vh-var(--home-header-height)-3.5rem)]`。
   先写的 `min-h-[50vh]` 不够——它在 941px 视口下让锚点差 130px 够不着（实测仍被钳到 158）；
   固定值在矮视口够、高视口就不够，`calc` 才能在任何视口高度下都让锚点可达。
2. **切词条后把列表锚回吸顶条下方**：`useLayoutEffect` + `scrollIntoView({ behavior: "instant" })`，配 `scroll-mt`，
   绘帧前完成、不留中间帧；**只在「列表顶部已滚出视口」时做**（用户在顶部时不打扰）。
   实测：深滚 900 切空词条后停在与吸顶条对齐的 289，`clamped: false`，空态正好在吸顶条下方。
3. **空结果给空态**（`FeedEmpty`：「这个分类暂时没有商品 / 换个词条逛逛」），不再挂「没有更多了」——
   后者读起来是「翻到底了」，与「这个类目下什么都没有」不是一回事。

保底高度看着像留白，但换来的是一屏到一屏的稳定：页脚落在折线以下，切词条时视口不动。

---

## 5. 分期

| 期                          | 内容                                                                                                                                                                                                  | 前提                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **V1 通用流**               | 游标、种子随机序、类目子树召回、无限滚动、销量字段；建 `recommend` 模块并把 `GET /api/feed` 归它（决策三）                                                                                            | 无，现有数据全能做                                                                                                                                                                                                                                                                                                                         |
| **V2 轻个性化**             | 收藏 / 购物车 / 订单里商品的类目算权重，作为召回参数（如每页四成来自偏好类目）；「排除已购」做成参数（耐用品有用、消耗品有害）                                                                        | ① `JwtAuthFilter` 加「有 token 就解析、没有就匿名」的软鉴权路径；② `recommend` 模块与 `product :: api` 的召回查询 V1 已就位（决策三），V2 只加信号与参数（偏好类目权重、排除已购）；③ 接受 SSR 首屏永远匿名（服务端拿不到内存里的 access token），个性化只在客户端接管后生效——**首屏匿名与登录后个性化之间的缝怎么接**是 V2 的第一个设计题 |
| **V3 行为埋点与运营位混排** | 曝光 / 点击批量上报（商品 id、tab、位置、seed；匿名用 cookie id），append-only 落 PG 滚动清理；「看过不推」、CTR 评估；CMS `banners` 加 feed slot，`FeedItem` 变成商品 / 运营卡的联合类型按固定位插入 | 埋点接口；联合类型的 OpenAPI → SDK 生成要先验证                                                                                                                                                                                                                                                                                            |

---

## 6. V1 落地清单与测试（已实现）

后端（recommend 模块，新建）：

- `recommend/package-info.java`：`@ApplicationModule(displayName = "Recommend", allowedDependencies = {"product :: api"})`
- `recommend/controller/FeedController`：`GET /api/feed`；`JwtProperties.skipPaths` 加 `/api/feed`
- `recommend/dto/FeedQuery(categoryId, cursor, size)`、`recommend/controller/response/FeedResponse(items, nextCursor)` + `FeedItemResponse`
- `recommend/service/FeedService`（种子生成、游标编排、装配出参）、`recommend/service/FeedCursor`（编解码）

后端（product 模块）：

- `product/api/ProductRecallQuery` + `ProductCardView`：子树展开 + seed 序 keyset 扫描 + `LIMIT size + 1` 判末页
- `CategoryService.descendantIds`
- `ProductCardView` 与 `PublicProductResponse` 各带 `soldCount`（前者给 feed，后者给 `/api/products`）
- 口径同步（已随代码落地）：`apps/server/AGENTS.md` 规则 2 补了「有序扫描」这一类，`product/api/package-info.java` 写明 `ProductRecallQuery` 是唯一的非按 ID 查询

前端（web）：

- `home/queries.ts`：`feedOptions` 改 `infiniteQueryOptions`，`fetchFeed` 与它同住（**不落 `products/detail/queries.ts`**）；tab → 类目的纯函数 `feedCategoryId` 也放这里（组件里只剩一行调用）
- `home/Feed.tsx`：`useSuspenseInfiniteQuery`、tab state（切词条走 `startTransition`，见 §4.7）、哨兵、尾部四态（加载中 / 失败重试 / 到底 / 封顶后手动继续）；`routes/index.tsx` 只留布局
- `RecommendBar`：受控 tab + 「换一批」回调
- `products/product.ts` `toProductCardData`：销量文案（0 不显示；≥ 1 万显示「已售 1.2万」）；feed item 与商品列表分别映射到同一个 `Product` 域类型
- `pnpm gen:sdk`

测试钉在哪：

- `server` `FeedIT`（recommend，8 例）：固定种子_连续翻页_不重不漏；一级类目tab_命中三级商品（子树展开经 `product :: api`）；续翻游标_同种子同顺序；末页_nextCursor为空；卡片_带销量与价格区间；未知类目_空流不报错；父类目被禁用_子类目商品不再召回；非法游标_400
- `server` `CategoryIT`（product）：子树展开_含自身与全部后代；禁用中间节点_整支剪掉；未知类目_空集 —— 子树展开要读类目表，所以落在 IT 而不是 `CategoryServiceTest`（快环不碰库）
- `server` `FeedControllerTest`（HTTP 边界）：匿名可达_200；参数绑定_categoryId与cursor透传_size默认24；size超上限_422；非法游标_400
- `server` `ModularityTests`：新模块自动纳入校验——recommend 只许碰 `product :: api`
- `web` `product.test.ts`：销量文案边界（0 / 9999 / 10000 / 12000），以及列表与 feed 两个契约进同一个投影
- `web` `home/queries.test.ts`：`feedCategoryId` 的四种输入（类目型 / 搜索型 / 目标为空的脏数据 / 没有选中项）
- `web` `home/Feed.test.tsx`（MSW 两页 + 结束）：滚到底_追加第二页且保留第一页；追加页失败_保留第一页并可重试；换一批_丢页重拉且不带游标；点类目词条_按该类目召回

---

## 7. 已知边界与故意不做

- **不做虚拟列表**：封顶 + 固定比例卡片已留路。
- **不做滚动位置恢复**：首页不会被离开（详情新标签页）。
- **不做打散、不做热销加权**：见 §2.4，随机序够用。
- **不加缓存**：表小；量级上去的 Redis 路径见 §2.5。
- **SSR 首屏永远匿名**：V2 要面对，V1 无影响。
- **dev 库只有 24 件上架商品**（另有 1 草稿 + 1 仓库中）：首屏 `size=24` 正好吃满，`nextCursor` 为空、尾部「没有更多了」——
  本地"看不到无限滚动"是数据只有一页，不是分页没接（链路另有 `FeedIT` 8 例与真浏览器把 size 改小到 6 的实测：
  4 页逐页追加、末尾收口）。要肉眼看到翻页，得补演示商品，或临时把请求的 size 调小。
- **`recommend` V1 没有自己的表**：曝光 / 点击到 V3 才来，规范里记一句「模块可以先没有 schema，有 schema 的模块必须独占」，不建空 schema 凑形状。
- **CMS 种子数据要核对**：V13 里「运动户外」tab 指向「服饰鞋包」一级类目；「+更多」是动作不是 tab，
  接线后会变成一个全站流的重复入口——属 CMS 数据整理，不在本文范围。
- **热销加权会让 keyset 不严格**（`sold_count` 中途变化），靠前端按 id 去重兜底，接受偶发漏一件。
