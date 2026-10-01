# 内容 / 首页 / 推荐

> 代码入口：apps/server/src/main/java/com/shop/platform/cms、recommend；apps/admin（CMS 三页）、apps/web/home。规则以代码为准沉淀，改代码请同步本文件。

## 一、CMS 内容通用（导航 / Banner / 推荐条共用的口径）

- **[CMS-01]** 三类内容（导航条目、banner、推荐词条）都只有「启用 ENABLED / 停用 DISABLED」两态，不做物理删除；停用即前台不展示，可无损恢复。
- **[CMS-02]** 三类内容新建时（create）状态一律强制置为 ENABLED，不接受入参传 status；状态变更只能走独立的 PUT `/{id}/status/{ENABLED|DISABLED}` 通道。
- **[CMS-03]** 所有列表（前台启用集与后台全量）排序口径一致：`sortOrder` 升序，同值再按 `id` 升序；sortOrder 越小越靠前，入参缺省时落 0。
- **[CMS-04]** update 逐字段覆写展示字段但 **null 字段 = 保持原值**（MyBatis-Plus NOT_NULL 策略跳过 null 列，PATCH 语义而非全量覆写——传 null 清不掉任何字段），且「归属键」不可改：导航的 navKey、banner 的 slot 在更新时被后端忽略（Request 里仍要求传但只用于校验形状）；后台表单编辑态直接把该字段置 disabled。
- **[CMS-05]** 跳转 target 一律软关联（存字符串：商品/类目 ID、活动名、搜索词或 URL），CMS 不 join 任何业务模块、不校验目标是否存在；目标不存在时前台按「脏数据」降级而不是报错。targetType 枚举固定五种：`PRODUCT | CATEGORY | CAMPAIGN | SEARCH | URL`（词表是 `cms.dto.LinkTarget.PATTERN` 一处，三处 DTO 的 @Pattern 只引用它，GEN-52；前台「不跳转」提交为缺省）。
- **[CMS-06]** 管理端 CMS 全部路由挂在 `/admin/cms`，要求 `CMS_MANAGE` 权限（岗位 OPS）；前台读接口 `/api/cms/*` 与 `/api/feed` 匿名可访问（在 JwtProperties.skipPaths 中）。
- **[CMS-07]** 前台三个只读接口按「导航位 / 运营位」取数且都有默认位：`GET /api/cms/nav` 默认 `navKey=home`、`GET /api/cms/banners` 默认 `slot=home_promo`、`GET /api/cms/recommend-tabs` 无位置参数（全局一份）；当前前台实际消费的导航位只有 `home`、运营位只有 `home_promo`（新增位需扩前台常量表）。
- **[CMS-08]** 出参形状（NavEntryResponse / BannerResponse / RecommendTabResponse）管理端与公开端共用同一 record、逐字段严格校验「只减不增」；后台列表全量返回（小表不分页），带 status / createdAt / updatedAt 等治理字段。
- **[CMS-09]** 前台三块读走 Redis 读缓存（`cms:nav` / `cms:banner` / `cms:recommend-tab`，按导航位/运营位分键），九个后台写方法各挂一道 `@CacheEvict(allEntries)`——运营改完下一请求即生效，TTL 5 分钟只兜漏接的写路径。banner 的生效时间窗口**不在缓存里筛**（缓存的是该运营位的启用行，一起筛等于把定时上下线冻进缓存）。与前端那 5 分钟壳缓存（WEB-12）是两层、互不失效：后台改完最坏仍有一个前端 TTL 的窗口，浏览器拿着自己那份旧壳。

## 二、首页分类导航（Nav）

- **[NAV-01]** 前台只吐指定导航位下 status=ENABLED 的条目；subs（子分组 `[{name, items[]}]`）作为 JSONB 整段原样带出，不拆表、不逐项管理。
- **[NAV-02]** subs 上限：一个导航条目最多 30 个分组；组名必填且 ≤64 字，组内词条每条 ≤64 字；「这组没有词条」在契约里表达为 items **缺省**（不得发 null，null 会被前端 zod 判死导致整块导航读不到）。
- **[NAV-03]** 后台编辑时留空的词条在提交前自动剔除；整组无词条时发 `{name}`（不带 items）而不是 null。
- **[NAV-04]** 字段上限：navKey ≤32 必填、title ≤64 必填、iconKey ≤32（lucide 图标 key，前端映射，未知 key 兜底 ShoppingBag 图标）、target ≤255。
- **[NAV-05]** 前台行内标题按「 / 」分段做宽度预算截断（预算 210px：汉字 14px/字、分隔符约 11px），装不下的整段不显示——不切半字、不画省略号；完整名保留在 tooltip 与 hover 展开的 mega 面板里。
- **[NAV-06]** 前台区分两种「没内容」：接口返回空数组 = 运营真正的空配置，显示「商品分类即将上线，敬请期待」空态；请求失败（含契约漂移）= 块级错误态 + 重试，不折叠成空态。

## 三、运营位 Banner

- **[BAN-01]** 前台 banner 生效条件 = status=ENABLED **且** 命中时间窗口：`startAt` 为 null 视为立即生效、`endAt` 为 null 视为长期有效；窗口判定按请求时刻服务端（Java 侧）现算——定时上下线不需要任何任务，到点自动生效/失效。
- **[BAN-02]** 后台表单口径：定时上线留空 = 立即生效、定时下线留空 = 长期有效；「下线时间需晚于上线时间」前后端同口径——后端 create/update 校验：起止两端齐全时 `endAt` 必须晚于 `startAt`，否则 400 + code `BANNER_TIME_RANGE_INVALID`（任一端为 null 不受约束）。update 时 null = 该端不改，与库中原窗口**合并后**再判定，防止分两次 PATCH 拼出自相矛盾的窗口。
- **[BAN-03]** 字段上限：slot ≤32 必填、title ≤64 必填、subtitle ≤128、imageUrl ≤512 必填、link ≤512（仅 targetType=URL 使用）、target ≤255。
- **[BAN-04]** 首页首屏 banner 条最多展示 3 个（按排序取前 3）；返回空数组 = 运营当天没配置，前台回退到内置的 3 张静态默认 banner（无图渐变文案卡）——首屏运营位不留白、不塌版式；请求失败则显示块级错误 + 重试，**不**静默回退默认 banner。

## 四、推荐条词条（RecommendTab）

- **[REC-01]** 推荐条是扁平词条数组（「猜你喜欢」只是其中一个 is_default=true 的普通项，不是特殊结构）；前台默认选中项按「用户点过的 → isDefault 项 → 首项」三级兜底推导。
- **[REC-02]** 「猜你喜欢」（默认词条）全局唯一由 DB 部分唯一索引 `uk_recommend_tabs_default`（WHERE is_default = TRUE）钉死：create/update 把第二个词条设为默认时撞键转 409「已存在默认推荐词条，请先取消原默认再设置」，不做静默顶替；admin 编辑页保存时协作取消其余默认（逐条 PUT）只是 UX，闸门在库。
- **[REC-03]** 词条名 ≤32 必填；isDefault 缺省为 false（create 时）；启停即时影响前台推荐条。
- **[REC-04]** CATEGORY 型词条的 name 必须与目标类目同名、target 必须命中真实且启用的类目——这是**数据规范**（V59 定下，由 seed-demo 断言钉住），服务端写入时不校验（admin 表单可填任意 target，接口也不拦）；运行时真出现脏 target（类目后来被禁用/删除）就按 CMS-05 的软关联降级口径走：前台推不出可用类目 → 回落全站流（FED-10）。「+更多」这类动作型伪词条已从种子数据删除。
- **[REC-05]** 词条读不到（失败）时整个推荐条不画，feed 照常走全站流——首页是门面，词条挂了这个可降级 UI 退出全局错误边界（throwOnError:false 是唯一显式就地降级的壳查询）。

## 五、首页 feed 分页与召回

- **[FED-01]** 首页 feed 是独立端点 `GET /api/feed`，与 `GET /api/products` 分工：列表要 total 与确定排序，feed 要种子与游标——响应只有 `{ items, nextCursor }`，**不回 total、不做 count**；末页唯一表达是 `nextCursor = null`。
- **[FED-02]** 页大小 size：默认 24（六列四行），合法区间 1~48（@Min/@Max，越界 422）；前端固定请求 24，48 的上限只在后端表达。
- **[FED-03]** 游标 = 不透明串 `<seed>.<lastId>`：seed 为服务端 SecureRandom 生成的 16 位 hex；服务端按 `^[0-9a-f]{16}\.[0-9a-f-]{36}$` 校验形态，不合法一律 400「游标不合法」，UUID 段结构由 fromString 兜底。
- **[FED-04]** 带 cursor = 续翻同一批（种子与位置都从游标解出，服务端零会话状态）；不带 cursor 再请求 = 「换一批」：服务端发新种子从第一个开始。
- **[FED-05]** 排序键 = `md5(id::text || seed), id`：同种子同顺序（确定函数），翻页途中商品上下架只影响还没翻到的部分，已翻过的页不重不漏；seed 与 limit 都走绑定参数。
- **[FED-06]** 末页判定用「多取一条」（LIMIT size+1 探测）：返回条数 > size 即有下一页，nextCursor 指向本页最后一条；裁掉的多余条不进 items。
- **[FED-07]** 召回只发 `status='PUBLISHED'` 的商品；categoryId 缺省 = 全站。
- **[FED-08]** 类目按**子树**召回：categoryId 展开为「自身 + 全部启用后代」，禁用节点整支剪掉（父链上有一个不可见，后代就不可达）——与前台类目树 publicTree 同一裁剪口径；展开在 product 内部做，recommend 不认识「子树」。
- **[FED-09]** 脏 tab 不报错：未知 / 隐藏 / 禁用类目 → 召回空集 → feed 返回**空流而非 404**；未知游标才 400。
- **[FED-10]** tab → 召回范围的映射在前端做：词条 `targetType === "CATEGORY"` 才把 target 作为 categoryId 传（含子树召回），其余类型（SEARCH / 无目标 / 脏数据）一律全站流。
- **[FED-11]** feed 卡片字段固定为：id、shopId、categoryId、name、subtitle(可空)、mainImage(可空)、minPrice、maxPrice（Money；召回只发上架商品，上架门槛保证已设价，故契约层非空）、soldCount(long)。**不回店铺名**（跨模块且货架卡不显示）；item 契约不复用 `/api/products` 的 PublicProductResponse，为 V3 混排运营卡独立演进。
- **[FED-12]** 销量文案不是 feed 自己的一份规则：feed 卡片与详情页推荐流共用 `formatSoldText`（口径见 PRD-68），feed 只是它的消费方。

## 六、首页展示与交互（web）

- **[WEB-01]** tab 选中状态是 feed 区块组件本地 state，**不进 URL**：商品卡新标签页打开、首页从不被离开、无深链入口，刷新回默认 tab 是淘宝/京东既定行为；将来出现需要深链到 tab 的入口（站外投放、运营位）才改。
- **[WEB-02]** query key 含 tab（`["home-feed", categoryId ?? "all"]`），各 tab 独立缓存，切回不重拉。
- **[WEB-03]** feed 缓存只在两种情况下更换：「换一批」与整页重载——staleTime Infinity、关窗口聚焦/重连重取；「换一批」= `resetQueries` 丢已加载页、只重拉第一页（无游标→新种子→整屏重排），不用 invalidateQueries（那会把 N 页串行重拉）。
- **[WEB-04]** 首屏 SSR 流式：loader 不预热 feed 查询，组件在 Suspense 边界挂起、SSR 吐骨架、第一页 resolve 后流式补发；SSR 只取第一页。首页三个壳查询（nav/banners/tabs）由 loader 以 allSettled 并发预热，单个失败不拖垮整页。
- **[WEB-05]** 切词条走 `startTransition`：新词条数据到位前保留旧卡片（网格 opacity-60、尾部「加载中…」），此窗口内不自动翻页；不把网格换成骨架（会钳回滚动顶部）。
- **[WEB-06]** 无限滚动：网格末尾 IntersectionObserver 哨兵，rootMargin 提前一屏（600px）触发追加；自动加载封顶 8 页（≈192 卡），封顶后哨兵不再触发、尾部换成「继续加载」按钮由用户显式继续。
- **[WEB-07]** 失败态分两种：第一页失败（无数据）→ QueryBoundary 整块错误态 + 重试；追加页失败（已加载页保留）→ 尾部就地「加载失败 + 重试」，不整块替换；全部查询 `retry: false`（SSR 流式不等退避，追加页有就地重试）。
- **[WEB-08]** 尾部四态：加载中（含切词条占位）/ 追加失败可重试 / 封顶后「继续加载」/「没有更多了」（无下一页）；空结果改挂空态「这个分类暂时没有商品 / 换个词条逛逛」，不再显示「没有更多了」。
- **[WEB-09]** 列表拍平后按商品 id 去重（防 React key 冲突，也是将来热销加权——商品跨游标移动——的兜底）。
- **[WEB-10]** 推荐条吸顶、词条分页展示：一页放几个由容器宽度实测决定（累计宽度含 16px gap），首/末页分别隐藏对应翻页按钮；「换一批」按钮换的是下方商品流，不换词条本身。
- **[WEB-11]** 首页壳区块的导航与 banner 走统一「块级三态」（骨架 / 错误+重试 / 内容），失败不静默留白；词条是例外（[REC-05]）。
- **[WEB-12]** 首页壳数据（nav/banners/tabs）客户端缓存 5 分钟（运营配置不常变），feed 除外（[WEB-03]）。
- **[WEB-13]** banner 与导航词条的跳转目前都落回首页（活动页/分类页路由未接），图标导航 hover 展开 mega 面板、无子组的词条渲染为普通按钮不挂假面板。

## 七、管理端编辑规则（admin CMS 三页）

- **[ADM-01]** 三个页面（首页导航 / 运营位 Banner / 推荐条词条）都是「列表 + 新增/编辑弹窗 + 启停」结构；无删除操作（对应 [CMS-01] 不做物理删除）。这套结构是一份实现：`cms/list-shell.tsx`（标题说明 + 工具栏 + 骨架/表格 + 新增对话框）、`cms/row-actions.tsx`（编辑 + 启停）、`cms/list-columns.tsx`（状态 / 排序 / 跳转 / 机器标识；右对齐操作列不认业务字段，已上收到 `shared/ui/columns.tsx`，与店铺审核队列共用一份）。加第四张配置页是再组一次 props，不是再抄一遍。
- **[ADM-02]** 导航位 / 运营位筛选走 URL search 参数（navKey / slot，≤32 非空可选）；新增弹窗预填当前筛选的位；列表后端全量返回、分页筛选在客户端 DataTable。「不筛」在 URL 上是**缺省**、在下拉里用一个 `all` 哨兵占位（Select 不吃空值），折回 undefined 由骨架做——URL 上不该留着 `?slot=all`。
- **[ADM-03]** 表单校验与后端 @Size/@Pattern 同口径：词条名 ≤32、组名/词条 ≤64、≤30 组、排序值必须是**非负整数字符串**（regex `^\d*$`，空按 0 提交）；跳转类型下拉含「不跳转」，提交时投影成缺省。其中「跳转类型 + target + 排序」三字段在三张表里同形同校验，只写一次：`cms/constants.ts` 的 `CmsTargetSortSchema`（各表 merge 它）+ `targetSortDefaults`（响应行 → 初值，脏 targetType 落回 NONE）+ `toTargetSortFields`（初值 → 请求体）。放宽 target 长度、改排序口径都只改这一处——抄三份的代价从来不是行数，是将来只改了一张表。
- **[ADM-04]** subs 编辑器：分组有序（上移/下移/删除）、组内词条增删、达到 30 组禁增；提交前整段过 SubsSchema，错误回显。
- **[ADM-05]** 启停都要二次确认，确认文案直说前台效果——banner 场景为「停用后前台立即不再展示该运营位」「启用后按生效时间窗口在前台展示」；失败时对话框保持打开。文案（含标题里的记录名词，如「停用词条「猜你喜欢」」）由各页传入，因为三页停用的前台后果不同；确认面、按钮 pending 态与「失败保持打开」由 `CmsRowActions` 统一承担。

## 八、已定案未实现（设计稿内容，禁止当作生效规则）

以下在原首页 feed 设计稿（已归档 git 历史；状态：V1 已落地，V2/V3 仍是设计稿）与 `apps/server/src/main/java/com/shop/platform/recommend/service/FeedService.java` 注释中定案，但代码**未实现**：

- **[FUT-01]** V2 轻个性化：收藏/购物车/订单商品的类目权重作为召回参数（如每页四成来自偏好类目）、「排除已购」做成参数；前置是 JwtAuthFilter 加「有 token 就解析」软鉴权、接受 SSR 首屏永远匿名。
- **[FUT-02]** V3 行为埋点与运营位混排：曝光/点击批量上报（商品 id、tab、位置、seed；匿名 cookie id）append-only 落库滚动清理、「看过不推」、CTR 评估；CMS banners 加 feed slot，FeedItem 变商品/运营卡联合类型按固定位插入；recommend 的第一张表到 V3 才来（V1 无表）。
- **[FUT-03]** 候选未采纳项：热销加权（Efraimidis–Spirakis 抽样）与同店打散**都不进 V1**，代码中无此逻辑；量级上去后的 Redis 预热（tab×seed 有序 id 列表 + productsByIds，退役 ProductRecallQuery，HTTP 契约不变）也只是写下的路，未落地。
- **[FUT-04]** tab 深链进 URL 的触发条件（站外投放/运营位入口）尚未出现，现状是 [WEB-01] 的本地 state；将来落地时 `replace: true` 且脏值收敛为默认 tab。
- **[FUT-05]** ~~独立 `/search` 分类搜索页~~：原首页设计稿有此页，**已定案撤回（C15，2026-09）——feed tab 即现状，无独立搜索页规划**；商品列表的 keyword 筛选（[PRD-62]）承接搜索需求，搜索后端另议。**2026-09-30 后续提案**：[搜索与首页分类导航设计](../search-design.md) 重新提出搜索框与左侧分类词条共用的结果页，先复用现有商品查询，再评估增强检索；2026-10-01 阶段 A 已部分落地（统一搜索页、入口、关键词转义、可售价展示）；增强检索仍未实现，不改变推荐 Feed 原地切换的生效规则。
