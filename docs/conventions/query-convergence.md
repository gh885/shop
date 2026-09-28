# 前端取数收敛口径：论证与教训

> [frontend.md「服务端状态：query 的收敛口径」](frontend.md) 条款的完整论证面——为什么是这个形态、踩过什么坑、依赖了库的哪些内部行为。
> 写新查询/写操作前不必读这里，条款本身够用；**想改条款或质疑某条时先读这篇**，免得把已经想明白的问题重新想一遍。

## 1. 「进不进 query」判据的展开

判据不是"几处读"（一个组件读也算，收益是免手写 loading 与去重），而是"它是不是副本"。用 `useState`/zustand 存服务端实体 = 手写缓存 + 手写失效。

**区分实体与实体之上的编辑会话**：`EditSkuDialog` 的行必须有本地 `useState`（要能改、要能提交前校验）——那是表单会话，本地草稿是唯一事实源；但**详情本身**必须来自 `productKeys.detail` 的 query。曾经这里自己拉一份详情存 state，于是弹窗改完 SKU、发布页看到的还是旧值。

**「缓存这份数据有没有收益」≠「它是不是服务端数据」**，四类即使"是服务端数据"也不进 query：

| 情形             | 例子                       |
| ---------------- | -------------------------- |
| 陈旧值比转圈更糟 | 结算预览、智能解析         |
| 副作用不可缓存   | 上传凭证、直传             |
| 一次性会话       | 登录、刷新 token、反馈提交 |
| 体积大不该进缓存 | SSR 期间的流式响应         |

**404 不是「不进 query」的理由**：若已有「无数据」的合法 UI 表达（物流未发货 → 「暂无物流信息」），query + `retry: false` 就够（见 `logistics/queries.ts`）；只有当调用方要把 404 折叠成"没有"（售后单 → `null`）时才在 `queryFn` 里归一（见 `after-sale-queries.ts`）。真正该警惕的是**契约本身在"没有"与"出错"之间含糊**，那是后端要补语义，不是前端绕开 query 的借口。

## 2. key 与失效的收敛

- key 散在组件或 `api.ts` 里 = 失效关系退化成"记在写代码的人脑子里"，新增读取方时没人会记得补失效点。
- **不造第二棵 key 树**：同一份服务端数据有两个 key = 两份缓存 + 两处失效，必然漂移。`useMe` 曾在三端各写一遍就是这形态，发现即合并成一个 `xxxKeys`。
- **不用 `refetch()` 当刷新**：它绕过 staleTime 强制打网络，且把"谁改了数据"绑在持有该 query 实例的组件上。刷新（数据变了）走 `invalidateQueries`（在 mutation 里）；错误态重试是另一回事（见 §4）——两套语义不要混。

### loader 预取为什么是 `query({ staleTime: "static" })`

官方 `ensureQueryData` 在 5.102 已废弃，替代口径就是 `queryClient.query({ ...options, staleTime: "static" })`。语义是「有缓存就返回、没有才取数」——`fetchQuery` 走 `isStaleByTime('static')`，而它先判 `data === undefined` 再判 static，所以无缓存照样会取数（`ensureQueryData` 也是「无缓存即 fetch」）。

这个 `staleTime` 只作用在这次 loader 读取上，不污染组件侧 observer 的新鲜度（`isStaleByTime` 用的是调用方自己那份 options，组件读的是 `xxxOptions`）。

## 3. 写操作为什么是「库 useMutation + meta 声明 + 全局执行」

- **官方对「mutation 该失效哪些 query」刻意不表态**。维护者 TkDodo 原话：_"Since there isn't a one-size-fits-all solution, React Query provides nothing out of the box"_（[Automatic Query Invalidation after Mutations](https://tkdodo.eu/blog/automatic-query-invalidation-after-mutations)）。但它把两个扩展点留了出来——**全局 `MutationCache` 回调**与**可用 `Register` 类型化的 `meta`**。两样都用：能全局的一律全局，逐点的只剩「这份回执改变了什么」。
- **反馈必须走全局，而不是逐点 `onError` 兜**：官方 `Mutation.execute` 里全局回调**先于**逐点回调（`mutation.ts` 的 onError 279 行 vs 291 行），所以「先拦住默认提示」只能靠全局读得到的声明。曾经逐点 `onError` 里再弹一条，结果是同一件事两条互相覆盖的提示（领券 409 就是这么坏的）。
- **没有 `useWriteMutation` 这类工厂**：它要自造 `messages` / `invalidateKeys` / `silentSuccess` 一套词汇，而库已经有 `meta`。「抽象的输入面贴着库自己的 API 走」是维护者 [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions) 的核心建议。乐观更新是唯一值得留包装的——它包的是一段顺序敏感的官方配方（`onMutate` 取消在途 → 快照 → patch；`onError` 回滚；`onSettled` 失效），顺序写反了只在并发下偶发出错，所以固定在一次实现里（`optimisticListMutationOptions`），只把「怎么 patch」交给领域；反馈不在它里面（全局负责）。

### 三条硬规矩的完整理由

1. **`invalidates` 传真实 query key，不要发明 tag**：tag 表等于在 query key 之外再造一棵命名树，新增读取方时没人会记得补 tag（与 §2「不造第二棵 key 树」同一条理由）；而且它表达不了「由变量算出的 key」——那种情况用库自己的 `onSuccess`（第 2 参即 variables，第 4 参带 client）。
2. **`silentError` 是显式声明，不是逃生舱**：只有「错误已经在别处被用户看见了」才用它（表单把 detail 渲染在字段下、登出后本地身份已清且人已在登录页）。
3. `meta.invalidates` 不传 = 显式声明"不改变任何已缓存查询"，不是漏写。失败要就地渲染在表单里（`silentError`）、或终态才处理（登出用 `onSettled`）的，`meta` 照写、回调照用。

## 4. 错误与重试的机制依据

`throwOnError: throwWhenNoData` 是 `createAppQueryClient()` 的全局默认（判据：只在「一条数据都没有可展示」时抛，逐字等于官方给 suspense 用的内部默认）。所以「失败抛给边界」是常态、不必逐条声明；**需要显式写的是退出**（`throwOnError: false`）。

- **为什么不是 `throwOnError: true`**：直接写 true 会在「有旧数据的后台刷新失败」时把一屏能看的内容换成整页错误页。
- **路由级 `pendingComponent` 兼作 Suspense fallback**：见 `@tanstack/react-router` 的 `Match.js`，同时覆盖 loader 与 suspense 查询。
- **`useSuspenseQuery` 收不到 `throwOnError`**：官方把它从 `UseSuspenseQueryOptions` 的类型里 `Omit` 掉了（`@tanstack/react-query` 的 `types.ts`），运行时也会用自己的内部判据覆盖。所以**内联**写 `useSuspenseQuery({ ...opts, throwOnError: false })` 是类型错误，而**传一个带 `throwOnError` 的 options 变量**是**静默失效**。推论：`orderDetailOptions` 这类「页面主体走 suspense、另有降级消费者」的共享 options，**降级那一处必须在调用点写** `useQuery({ ...options, throwOnError: false })`——「这份数据在这里只是降级」属于调用点，不属于 options。
- **`QueryErrorResetBoundary` 必须在树里**：suspense / 抛错查询失败后不重置它的标记，`retryOnMount` 会被官方强制为 false，重挂载不重取——重试按钮形同虚设（三端 Provider 树已挂，`QueryBoundary` 自带一层）。这条在全局默认开启后**对所有查询生效**，所以「退出默认只在没有边界时写」漏一个就是一个「卡在错误页、怎么点都不回来」的角落。
- **`enabled` / `placeholderData` / `skipToken` 与 suspense 互斥**：这类查询挂不了 `pending`，但仍然可以抛给一个不传 `pending` 的 `QueryBoundary`，或抛给路由 `errorComponent`（列表带 `placeholderData` 就是这么做的）。只有当它同时也没有边界时，才落回 `throwOnError: false` + `refetch()`。

## 5. lint 兜底的边界

官方 `@tanstack/eslint-plugin-query` / `-router` 经 oxlint 的 `jsPlugins` 加载（oxlint 由 Vite+ 内置，不单独装；配置与逐条理由见 `packages/config/oxlint.config.ts`，它被根 `vite.config.ts` 的 `lint` 块消费）。`exhaustive-deps`（漏 key）、`stable-query-client`、`no-unstable-deps`、两条 property-order（`--fix` 可重排）、`route-param-names` 为 error；`no-rest-destructuring`、`prefer-query-options` 为 warn。

官方 `no-void-query-fn` **未启用**：它靠 `parserServices.program` 取 TS 类型，oxlint 的 JS 插件 API 不提供（`--type-aware` 也无效，实测静默空转）。
