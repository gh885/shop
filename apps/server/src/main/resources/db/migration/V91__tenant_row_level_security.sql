-- V91: 商家数据行级隔离（RLS）——数据库层第二道防线
--
-- 为什么需要它：应用层的隔离靠「请求上下文装载 shopId + mapper 里手写 shop_id 条件 + 归属闸门」。
-- 这条链上唯一没有强制力的一环是「每个查询都写了条件」——漏一次就是越权，而漏写不会报错。
-- MyBatis-Plus 的 TenantLineInnerInterceptor（V91 同批接入）补上了 MyBatis 这条路径，但
-- JdbcTemplate（各模块 api 包）与原生 @Select 里的 PG 特有语法（RETURNING OLD/NEW、ON CONFLICT）
-- 不在它的改写范围内。RLS 是唯一能覆盖「所有走这条连接的 SQL」的机制。
--
-- 上下文约定：`app.current_shop`（text，空串或未设置 = 平台/买家/后台任务视角，不过滤）。
-- 应用侧在借出连接时用 `set_config('app.current_shop', ?, false)` 写入，见 ShopTenantDataSource。
--
-- 为什么「空上下文放行」而不是「空上下文拒绝」：
--   1. Flyway 迁移与种子数据（V43/V44 等）在无请求上下文时执行，拒绝会让每次建库失败；
--   2. 买家侧与平台侧（/api、/admin）本就不该按店过滤，它们的上下文天然为空；
--   3. 定时任务（超时关单、物流轮询、退款重试）跨店扫描，同样无上下文。
--   代价是「忘了设置上下文」会退化成不过滤——所以空上下文只允许出现在上述三类入口，
--   由 ShopTenantDataSource 在卖家请求里保证必然写入非空值。
--
-- FORCE ROW LEVEL SECURITY：表 owner 默认绕过 RLS，而本库的表 owner 就是连接用户（shop）。
--   不加 FORCE 等于给自己开了后门。注意：**超级用户连 FORCE 也绕**——当前 shop 用户是
--   superuser（usesuper=t），所以这套策略只有在生产库改用非超级用户（或 SET ROLE 到非超级用户）
--   之后才真正生效。这条限制写在 docs/conventions/backend-cache.md 同级的租户隔离文档里，
--   别以为建了 policy 就完事了。
--
-- 只覆盖「有 shop_id 列」的表。子表（orders.items、logistics.shipment_lines、review.review_items
-- 等）没有 shop_id，靠父表的 RLS 间接保护（应用层写入时已由父表归属闸门圈定）。这是已知缺口，
-- 不在本批处理——给子表加冗余 shop_id 会引入第二写者，收益不抵成本。

DO $$
DECLARE
    t text;
    tenant_tables text[] := ARRAY[
        'account.shop_subaccounts',
        'aftersale.refunds',
        'coupon.coupon_templates',
        'coupon.coupon_usages',
        'coupon.user_coupons',
        'logistics.shipments',
        'orders.orders',
        'product.products',
        'product.skus',
        'review.reviews',
        'shop.addresses',
        'shop.shipping_templates',
        'shop.shop_members',
        'shop.shop_reviews'
    ];
BEGIN
    FOREACH t IN ARRAY tenant_tables LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
        EXECUTE format(
            $f$
            CREATE POLICY tenant_isolation ON %s
                USING (
                    coalesce(current_setting('app.current_shop', true), '') = ''
                    OR shop_id::text = current_setting('app.current_shop', true)
                )
                WITH CHECK (
                    coalesce(current_setting('app.current_shop', true), '') = ''
                    OR shop_id::text = current_setting('app.current_shop', true)
                )
            $f$,
            t);
    END LOOP;
END
$$;

COMMENT ON TABLE product.products IS '商品 SPU。行级安全策略 tenant_isolation 见 V91：按 app.current_shop 过滤，空上下文放行';
