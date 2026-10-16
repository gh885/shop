-- V77: 遥测明细的三条索引（表在 V76 建好）
--
-- 全走 CREATE INDEX CONCURRENTLY，且**本文件只放 CONCURRENTLY 语句**：它不能跑在事务里，
-- Flyway 的 PostgreSQL parser 认出语句前缀后会把整条迁移放到事务外执行
-- （ParserSqlScript#executeInTransaction）；同文件里混普通 DDL 会触发 mixed 检查直接报错。
-- 前提是 spring.flyway.postgresql.transactional-lock=false（application.yml），理由见 V65 头部。
--
-- 对一张刚落地的空表，CONCURRENTLY 的收益是零（没有并发写入可躲）。照样这么写，是因为
-- **口径统一比这一处的微小收益重要**：一旦允许「新表的索引可以普通建」，下一个人照抄的就是那个例外，
-- 而他要建索引的表大概率不是空的。代价只是多一趟扫描。
--
-- 三条各对应一类查询，不建更多——索引是每次写入都要还的债，而这张表是纯追加的：
--   1. 保留清理 + 「最近发生了什么」（created_at 是唯一的排序键）
--   2. 按错误指纹聚合：把「同一个问题」的影响会话数算出来。偏索引省掉没有指纹的那几类 kind
--   3. 按端与种类过滤：「seller 最近的白屏」「这一小时哪些接口在坏」
--
-- ⚠️ 每条索引前的两行 squawk 豁免**不是「这条规则不适用」，是「它和 Flyway 的要求互相矛盾」**：
-- require-lock-timeout / require-statement-timeout 要的是一句 `SET lock_timeout`，而 SET 是事务内语句——
-- 和 CONCURRENTLY 放进同一个文件，Flyway 直接报
-- 「Detected both transactional and non-transactional statements within the same migration」
-- （实测：加 SET 之后这条迁移连库都连不上，去掉才过）。V65 遇到同一个矛盾时选的是不写 SET。
--
-- 代价有限：CONCURRENTLY 拿的是 SHARE UPDATE EXCLUSIVE，不挡读写，只挡别的 DDL 与它自己，
-- 也就是「等锁」影响的是本次发布而不是线上流量，而发布本来就有 overall timeout。
-- **那两条规则是给普通 DDL 设的**（非并发 CREATE INDEX、ALTER TABLE 扫全表），
-- 那种才会把线上读写按住；本文件里没有那种语句。
--
-- 豁免逐条写，不用 squawk-ignore-file：文件级豁免会把将来加进来的**任何**语句一起放过，
-- 而这一条条都是 concurrent 的现状，逐条写才守得住。
-- 多条规则写在同一行、逗号分隔（squawk 的 squawk-ignore 只作用于紧随其后的那一条语句，
-- 连续写两行只有最后一行生效——踩过）。

-- squawk-ignore require-lock-timeout, require-statement-timeout
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rum_events_created_at
    ON rum.rum_events(created_at DESC);

-- squawk-ignore require-lock-timeout, require-statement-timeout
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rum_events_fingerprint
    ON rum.rum_events(fingerprint, created_at DESC) WHERE fingerprint IS NOT NULL;

-- squawk-ignore require-lock-timeout, require-statement-timeout
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rum_events_app_kind
    ON rum.rum_events(app, kind, created_at DESC);
