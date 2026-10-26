SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 审计动作登记对齐 catalog：offer → listing 改名漏了这一步，商品编辑补上新的三个。
--
-- 这不是「新增功能」，是修一个**已经坏了但没人发现**的地方：
-- `V20261025234000__catalog_offer_to_listing.sql` 把 schema/表/列全改成了 listing，
-- 但 `V20261021104000__audit_catalog_actions.sql` 里登记的三个动作名还是 `catalog.offer.*`。
-- 而 `AuditRecorder` 会校验「动作必须在 audit_action 表里」，校验不过就抛
-- `IllegalArgumentException: 未登记的审计动作`——也就是说
-- **平台审核通过 / 驳回 / 下架三条链路在当前代码下必然 500**，因为 `CatalogPublishService`
-- 发的是 `catalog.listing.*`，库里登记的是 `catalog.offer.*`。
--
-- 为什么没被发现：这三条路径没有测试覆盖（`AdminListingController` 没有任何测试），
-- 而 `ArchitectureTest` 是静态的，看不到运行期才查的表。
--
-- 修法：登记新的名字，删掉旧的。不保留旧名——`catalog.offer.*` 从此不会有人发，
-- 留着只会让「这个动作是谁发的」变成一个查不到答案的问题。
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO audit.audit_action (action, subject, description) VALUES
    ('catalog.listing.approved', 'catalog', '商品挂售审核通过（通过即上架）'),
    ('catalog.listing.rejected', 'catalog', '商品挂售审核驳回'),
    ('catalog.listing.offline',  'catalog', '商品挂售下架'),
    -- 商品编辑：这三条是新的，对应 SellerProductEditService
    ('catalog.product.updated',       'catalog', '商家编辑商品基本信息'),
    ('catalog.product.skus_updated',  'catalog', '商家编辑商品 SKU（改价 / 停售）'),
    ('catalog.product.deleted',       'catalog', '商家删除商品草稿')
ON CONFLICT (action) DO NOTHING;

-- 旧名已经没有生产者了。`catalog.sku.delisted` 同样没有生产者，一并清掉——
-- 审计动作表是「允许发什么」的白名单，留一条没人发的记录只会让下一个读它的人以为那里有代码。
DELETE FROM audit.audit_action
 WHERE action IN ('catalog.offer.approved', 'catalog.offer.rejected', 'catalog.offer.offline', 'catalog.sku.delisted');
