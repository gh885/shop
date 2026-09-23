-- V65: 热点路径补索引 —— 收藏数聚合 / 券核销计数 / 定时扫描 / 店铺价排序
--
-- 全部走 CREATE INDEX CONCURRENTLY：这些表都是线上会持续写的表，普通建索引要持 SHARE 锁
-- 阻塞读写，而补索引恰恰是在数据长起来之后才做的动作。CONCURRENTLY 不能跑在事务里，
-- Flyway 的 PostgreSQL parser 认出语句前缀后会把整条迁移放到事务外执行（见 ParserSqlScript#executeInTransaction），
-- 所以本文件只放 CONCURRENTLY 语句，不与普通 DDL 混写——混写会触发 mixed 检查直接报错。
-- 前提是 spring.flyway.postgresql.transactional-lock=false（application.yml）：默认 true 时 Flyway 另开
-- 一条连接跑迁移、把 schema history 事务留在主连接上不提交，CONCURRENTLY 会等它等到天荒地老。
--
-- 中途失败会留下 INVALID 的同名索引（CONCURRENTLY 建到一半不回滚），而 IF NOT EXISTS 会跳过它、
-- 让坏索引永久留在库里；重跑前先 DROP INDEX CONCURRENTLY <name>（带 schema 前缀）。
--
-- 口径：能被等值/前缀命中的才建。查询里是参数化的等值条件（MyBatis-Plus 的 eq 生成 status = ?）时，
-- 状态列一律进索引键而不是部分索引谓词——带 Param 的谓词 planner 证不出蕴含，部分索引会被无视。

-- 收藏数批量聚合（FavoriteItemMapper.collectCountByProductIds）：
-- WHERE product_id IN (...) GROUP BY product_id。uk_favorite_items_user_product 前缀是 user_id，用不上，
-- 商品列表/详情每次渲染都要全表扫一遍收藏表。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_favorite_items_product
    ON favorite.items(product_id);

-- 券模板「已核销数」批量聚合（UserCouponMapper.countUsedByTemplateIds）：
-- WHERE template_id IN (...) AND status = 'USED' GROUP BY template_id。
-- uk_user_coupons_template_user 是 WHERE source='CLAIM' 的部分索引，装不下 USED 这条口径。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_coupons_template_status
    ON coupon.user_coupons(template_id, status);

-- 售后三条超时扫描（TicketMapper.selectApplyingExpired / selectReturnShipExpired / selectReturnReceiveExpired）
-- 共同形态：WHERE status = ? AND created_at < ? ORDER BY created_at LIMIT n。
-- 现有 idx_tickets_shop_status / idx_tickets_shop_created 都以 shop_id 打头，定时器是全站扫描、没有店铺维度。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_status_created
    ON aftersale.tickets(status, created_at);

-- 扫描②③ 的相关子查询按 (ticket_id, action) 取事件时刻（EXISTS / MAX(created_at)）。
-- idx_ticket_events_ticket(ticket_id, created_at) 不含 action，只能取完再回表筛；
-- 老索引留着：售后详情时间线是「按票取全部事件按时间排」，那条前缀正好是它的形状。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_events_ticket_action
    ON aftersale.ticket_events(ticket_id, action, created_at);

-- 轨迹轮询（ShipmentMapper.selectStaleForPolling）：每轮都跑，形态是
-- WHERE status NOT IN ('DELIVERED','RETURNED') ORDER BY shipped_at LIMIT n。
-- 这里的 NOT IN 是 @Select 里的字面量（不走 Param），所以能做部分索引：终态包裹随时间占绝大多数，
-- 部分索引只装还在路上的行，且语句与查询谓词逐字相同，planner 证得出蕴含。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipments_unfinished_shipped
    ON logistics.shipments(shipped_at)
    WHERE status NOT IN ('DELIVERED', 'RETURNED');

-- 物流异常扫描（ShipmentMapper.selectStalled）：status 是动态 IN 列表，部分索引证不出来，
-- 改成 (direction, shipped_at)：direction 等值定位后天然按 shipped_at 有序，省掉排序又能早停。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipments_direction_shipped
    ON logistics.shipments(direction, shipped_at);

-- 待支付流水反查（PaymentMapper.selectPendingByOrder）：收银台每次轮询/重复下单都走
-- WHERE order_id = ? AND status = ? ORDER BY created_at LIMIT 1。
-- uk_payments_order_success 只装 SUCCESS，PENDING 这条路径此前无索引可用。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_order_status_created
    ON payment.payments(order_id, status, created_at);

-- 注销冷静期到期扫描（UserMapper.selectDeletionDue）：@Select 字面量谓词，做成部分索引——
-- 提交过注销申请的账号是极少数，索引只装它们，比给 deleted_at/status/deletion_requested_at 各建一条都小。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_deletion_due
    ON account.users(deletion_requested_at)
    WHERE deleted_at IS NULL AND status = 'ACTIVE' AND deletion_requested_at IS NOT NULL;

-- 店铺前台按价排序（ProductQueryService.pagePublic）：WHERE status = ? [AND shop_id = ?]
-- ORDER BY min_price ASC, id DESC / max_price DESC, id DESC。idx_products_published_created 只服务「最新」，
-- 价排序此前是全表 top-N 排序；status 打头是因为 MP 把它参数化了（见开头口径）。
-- 类目维度的价排序不建：那里 category_id 是 descendantIds 展开的 IN 列表，跨列表元素 planner 不做归并，
-- 索引给不出有序输出，建了也只是把排序换成回表。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_shop_price_asc
    ON product.products(status, shop_id, min_price, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_shop_price_desc
    ON product.products(status, shop_id, max_price DESC, id DESC);
