# 读缓存（infra.cache）

> 后端细则。速查结论见 `apps/server/AGENTS.md`「硬规则」。

**判据三条同时成立才上：读得极频、改得极少、且改动必须下一请求生效。** 现有名单三块（首页三块配置 / 类目树与子树 / 店铺公开信息），名字汇总在 `infra.cache.CacheNames`：

- **名单在 infra，值类型由 owning 模块声明**：各模块 `<module>.infra` 交一个 `infra.cache.CacheSpec` bean（`CmsCacheConfig`/`ProductCacheConfig`/`ShopCacheConfig`），`CacheConfig` 只定策略并核对登记是否齐——齐则启动通过，不齐直接启动失败，好过线上静默不缓存（运行期没登记的名字也**直接不缓存**：`disableCreateOnMissingCache`，绝不退回默认序列化往 Redis 里写读不出来的字节）。`infra` 一旦 import 得动 `cms.mapper.NavEntry`，模块边界就漏了（Modulith 校验会判违规）
- 值按缓存给定 `JavaType` 序列化，不开 Jackson 多态类型标记；序列化器用 Jackson 3 的 `JacksonJsonRedisSerializer` + 注入 `tools.jackson.databind.ObjectMapper`（本项目 mapper bean 是 Jackson 3，`com.fasterxml` 那个没 bean，注入它启动即 `NoSuchBeanDefinition`）；键前缀 `cache:<名字>:`，与会话/限流键分段，`redis-cli` 能按前缀扫到整组
- **读回用放过未知属性的 mapper 副本**（`CacheConfig.lenientReader`）：实体派生 getter（`Banner.isTimeRangeValid()`/`Shop.isActive()`）会被写成读不回去的属性，照 web 严格口径缓存自己就 500；无参读的 key 显式给一个（`'tree'`/`'all'`），否则 Redis 里落下 `SimpleKey []` 那种带空格的键
- **写侧必须接失效**（`@CacheEvict` 或显式 evict）：TTL 5 分钟只兜漏接的写路径，不是新鲜度口径。判权、库存、订单状态这类闸门/账本不进缓存（ACC-43）
- 缓存靠代理生效，**同类自调用不命中**：可缓存的读与每次现算的推导分成两个 bean（`CmsPublicReader` 是样板——banner 生效时间窗口若跟着缓存，定时上下线就被冻住）
- `setTransactionAware(true)`：失效推迟到事务提交之后，否则提交前 evict 会被并发读用旧值填回，一 stale 就是一整个 TTL
- 只入缓存的正常返回：404 是抛异常、异常不入缓存，所以「未过审 → 审核通过」这条路天然不需要失效
- 测试上下文 `shop.cache.enabled=false`（注解空转，用例不依赖 Redis、不跨用例串味）；缓存语义由 `infra/cache/ReadCacheTest` 用内存缓存器验「mapper 被打了几次」
