package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.Validate;
import com.shop.platform.order.api.AfterSaleBadge;
import com.shop.platform.order.model.OrderStatus;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface OrderMapper extends BaseMapper<Order> {

    /**
     * 取本人订单：买家侧一切动作与查询的同一道门。不存在与不属于本人给同一句话、同一个状态码（404），
     * 不泄露单据存在性。收在这里而非各 service 各写一份——「越权说什么」只该定义一处。
     *
     * <p>归属不符也走 404：400 会说「请求本身有问题」，而事实是「这个资源对你不存在」；
     * 与 AfterSale/ShipmentService 的同一个门的口径保持一致（曾因 isTrue 默认 400 而不一致）。
     */
    default Order requireOwned(UUID userId, UUID orderId) {
        return Validate.requireOwned(selectById(orderId), Order::getUserId, userId, "订单不存在");
    }

    /** 取本店订单：卖家侧同一道门，越店与不存在同样不区分（同为 404） */
    default Order requireShopOwned(UUID shopId, UUID orderId) {
        return Validate.requireOwned(selectById(orderId), Order::getShopId, shopId, "订单不存在");
    }

    /**
     * 卖家订单分页：本店新建在前，{@code filter} 传 null = 全部档；非法状态值的 400 裁决在 service
     * （mapper 只收已归一的枚举）。
     *
     * <p>买家列表<b>不走</b>这里：买家以主订单为单位分页，归属于主订单
     * （{@code TradeMapper.selectPageByBuyer}）。归属列写死在本方法里而不是由调用方传列引用——
     * 「谁的单」是这道查询的适用域，传错列等于把别人的单列进你的列表。
     */
    default Page<Order> selectPageByShop(PageParams pageParams, UUID shopId, OrderStatus filter) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<Order>()
                        .eq(Order::getShopId, shopId)
                        .eq(filter != null, Order::getStatus, filter)
                        .orderByDesc(Order::getCreatedAt));
    }

    /** 同一张主订单下的全部子订单（主订单关单级联、对账回读用） */
    default List<Order> selectByTradeId(UUID tradeId) {
        return selectList(
                new LambdaQueryWrapper<Order>().eq(Order::getTradeId, tradeId).orderByAsc(Order::getShopId));
    }

    /** 一批主订单下的全部子订单：列表页按主订单装配卡片时一次取齐（店铺段顺序同 {@link #selectByTradeId}） */
    default List<Order> selectByTradeIds(Collection<UUID> tradeIds) {
        return selectList(
                new LambdaQueryWrapper<Order>().in(Order::getTradeId, tradeIds).orderByAsc(Order::getShopId));
    }

    /**
     * 卖家看板：本店 {@code since} 起、按营业日汇总的已成交金额，回「营业日 → 当日 Σ 实付（Money）」。
     *
     * <p>形状与 {@code ReviewItemMapper.countRatingSplit} / {@code FavoriteItemMapper.collectCountByProductIds}
     * 同一族——select 的不是某列而是聚合表达式，故用字符串列的 {@code QueryWrapper} + {@code selectMaps}，
     * 并在 mapper（行形状）里就地拼成 {@link Money}：读的是 ResultSet 的列、没有实体可挂 {@code xxxAsMoney()}，
     * 这正是 {@code MoneyTypeRulesTest} 允许 {@code Money.ofFen} 落在这里的那一格（换算只此一处，service 不重拼）。
     *
     * <p>按<b>平台时区</b>切营业日（不是库/服务器时区）：卖家眼中的「今天卖了多少」是本地日历日，
     * {@code paid_at} 是 timestamptz，直接 {@code ::date} 会按 UTC 切出早 8 小时的错位日。空档日不补（补零归 service）。
     *
     * <p>「已成交」= 付过款且当前未被整单取消退款（ORD 状态机）：只认 PAID/PARTIALLY_SHIPPED/SHIPPED/COMPLETED——
     * 未付款的待发货单 {@code paid_at} 为空，不算成交；付款后取消（CANCELLED）已退款，也不算营收。取 {@code name()}
     * 字符串喂裸列 wrapper，是因为这条查询走 map 投影不经过实体的 EnumTypeHandler，参数就得是列里真存的那几个词。
     *
     * <p>{@code GROUP BY 1, 2} 按输出列序（day、currency）：币种进分组是多币种下的正确性护栏；一期 DB CHECK
     * 钉死单币种（{@code currency='CNY'}）恒一组，且一天落同币，故 {@code Map<日, Money>} 的键不会互相覆盖。
     */
    default Map<LocalDate, Money> sumPayAmountByDay(UUID shopId, OffsetDateTime since) {
        List<Map<String, Object>> rows = selectMaps(new QueryWrapper<Order>()
                .select(
                        "to_char(paid_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS day",
                        "currency",
                        "sum(pay_amount) AS total")
                .eq("shop_id", shopId)
                .ge("paid_at", since)
                .in(
                        "status",
                        List.of(
                                OrderStatus.PAID.name(),
                                OrderStatus.PARTIALLY_SHIPPED.name(),
                                OrderStatus.SHIPPED.name(),
                                OrderStatus.COMPLETED.name()))
                .groupBy("1", "2")
                .orderByAsc("1"));
        Map<LocalDate, Money> byDay = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            LocalDate day = LocalDate.parse((String) row.get("day"));
            Object total = row.get("total");
            long fen = total instanceof Number number ? number.longValue() : 0L;
            byDay.put(day, Money.ofFen(fen, (String) row.get("currency")));
        }
        return byDay;
    }

    /**
     * 一条超时线的一批到期单：状态限定 {@code from}，到期列早于 {@code now}，按<b>同一列</b>升序取头部
     * {@code limit} 行——最急的先处理。到期列为 NULL 的行天然不匹配（SQL 的 NULL 比较为 unknown），
     * 未回填截止时刻的行不需要额外判空就进不了这一批。
     *
     * <p>到期列由调用方给（{@code OrderTimeout} 持有「哪条线过哪个截止列」），因为那两条线是本模块状态机
     * 推导出来的起点，扫描器只保证「不是那一态、没到期就不进批」。批大小同样由调用方给：它是任务侧的批处理
     * 策略（各部分索引全集有限，分批跑防任务线程长事务），不是这条查询的口径。
     *
     * <p>{@code LIMIT} 走 wrapper 的 {@code last} 尾巴——裸 SQL 片段只住 mapper，不进 service。
     */
    default List<Order> selectSweepBatch(
            OrderStatus from, SFunction<Order, OffsetDateTime> expireColumn, OffsetDateTime now, int limit) {
        return selectList(new LambdaQueryWrapper<Order>()
                .eq(Order::getStatus, from)
                .lt(expireColumn, now)
                .orderByAsc(expireColumn)
                .last("LIMIT " + limit));
    }

    /**
     * 支付事实落库：{@code paid_at} 为空才写，回填发货时限；不改 status（子订单创建即待发货）。
     * 0 行 = 已支付/已取消/不存在，409 裁决在调用方。两个时刻由同一个 now 推出。
     */
    default int markPaid(UUID orderId, OffsetDateTime paidAt, OffsetDateTime shipExpireAt) {
        return update(
                null,
                new LambdaUpdateWrapper<Order>()
                        .eq(Order::getId, orderId)
                        .isNull(Order::getPaidAt)
                        .ne(Order::getStatus, OrderStatus.CANCELLED)
                        .set(Order::getPaidAt, paidAt)
                        .set(Order::getShipExpireAt, shipExpireAt));
    }

    /**
     * 交寄事实落库：只刷物流摘要投影与<b>首次</b>发货时刻 / 收货窗口，不动 status（履约态由重算决定）。
     *
     * <p>shipped_at 与 receive_expire_at 用 COALESCE 只回填一次：订单的发货时刻与收货窗口属于首次发货，
     * 后续包裹不得把它们往后推。logistics_company / tracking_no 则每次刷新为最新包裹（订单详情的物流摘要口径）。
     *
     * <p>WHERE 里的可发货集合与 {@code OrderShipmentView.shippable()} 同口径：未付款 / 已取消 / 已完成
     * 都推不动，0 行由调用方给 409 并回滚整张包裹。语句不带 RETURNING，所以用 {@code @Update}
     * （走 executeUpdate 拿影响行数；{@code @Select} 走 executeQuery，无结果集会被映射成 null 而炸在拆箱上）。
     */
    @Update(
            """
            UPDATE orders.orders
            SET shipped_at = COALESCE(shipped_at, #{shippedAt}),
                receive_expire_at = COALESCE(receive_expire_at, #{receiveExpireAt}),
                logistics_company = #{carrierName},
                tracking_no = #{trackingNo},
                updated_at = #{shippedAt}
            WHERE id = #{orderId}
              AND shop_id = #{shopId}
              AND paid_at IS NOT NULL
              AND status IN ('PAID', 'PARTIALLY_SHIPPED', 'SHIPPED')
            """)
    int refreshShipmentSummary(
            @Param("orderId") UUID orderId,
            @Param("shopId") UUID shopId,
            @Param("carrierName") String carrierName,
            @Param("trackingNo") String trackingNo,
            @Param("shippedAt") OffsetDateTime shippedAt,
            @Param("receiveExpireAt") OffsetDateTime receiveExpireAt);

    /**
     * 物流全部签收的投影：写 delivered_at 并把收货窗口从签收起算（ORD-28 的「签收后还有 7 天」）。
     * 只认 delivered_at 为空且未到终态——重复回写幂等，已完成/已取消的单不被物流改动。
     */
    default int markAllDelivered(UUID orderId, OffsetDateTime deliveredAt, OffsetDateTime receiveExpireAt) {
        return update(
                null,
                new LambdaUpdateWrapper<Order>()
                        .eq(Order::getId, orderId)
                        .isNull(Order::getDeliveredAt)
                        .notIn(Order::getStatus, OrderStatus.COMPLETED, OrderStatus.CANCELLED)
                        .set(Order::getDeliveredAt, deliveredAt)
                        .set(Order::getReceiveExpireAt, receiveExpireAt));
    }

    /**
     * 履约态重算的落点：把状态改成 facts 推导出的那一态，成功时经 PG18 RETURNING OLD 带回<b>转移前</b>的状态
     * ——审计流水要的正是「从哪来、到哪去」，陈旧读给不了这个答案。
     *
     * <p>终态护栏写进 WHERE：已完成/已取消不参与重算（§8 第一步），并发抢先改到终态的那一方胜出。
     * 起点集不在这里判——重算允许回退（取消已发出的包裹会让结清量下降），所以这里只挡终态。
     */
    @Select(
            """
            UPDATE orders.orders
            SET status = #{target}, updated_at = #{now}
            WHERE id = #{orderId}
              AND status NOT IN ('COMPLETED', 'CANCELLED')
              AND status <> #{target}
            RETURNING OLD.status AS "previousStatus"
            """)
    OrderStatus moveFulfillmentReturningPrevious(
            @Param("orderId") UUID orderId, @Param("target") OrderStatus target, @Param("now") OffsetDateTime now);

    /**
     * 买家延长确认收货窗口（ORD-63）：把 {@code receive_expire_at} 后推并把计数 +1。
     *
     * <p>四条闸门写在同一条 WHERE 里，与本 mapper 其它条件更新同构（不先读后写）：
     * ① SHIPPED——已取消/已完成的单不该被买家改动；② {@code delivered_at} 为空——已签收的单按签收起算，
     * 买家延长等于单方面延长「已经起算的窗口」，与 ORD-28 的签收口径冲突；③ 计数未达额度——并发双击只改到一行；
     * ④ 截止未过期——过了点的单注定要被超时任务转完成，延长它等于把一个已终结的窗口救回来
     * （{@code now} 由调用方给，本方法不自己算时钟）。
     *
     * <p>新截止时刻由调用方从**当前截止列**加 {@code OrderTimeouts.RECEIVE_EXTENSION} 得出，不由本方法算时钟：
     * 「从哪一刻起算」是业务规则，与本方法要守的闸门是两件事。
     *
     * <p>0 行 = 抢不到（已非 SHIPPED / 已签收 / 额度用尽 / 截止已过 / 别人先点了），调用方据此给 409。
     */
    default int extendReceiveWindow(
            UUID orderId, OffsetDateTime newReceiveExpireAt, OffsetDateTime now, int maxExtensions) {
        return update(
                null,
                new LambdaUpdateWrapper<Order>()
                        .eq(Order::getId, orderId)
                        .eq(Order::getStatus, OrderStatus.SHIPPED)
                        .isNull(Order::getDeliveredAt)
                        .gt(Order::getReceiveExpireAt, now)
                        .le(Order::getReceiveExtendedCount, maxExtensions - 1)
                        .set(Order::getReceiveExpireAt, newReceiveExpireAt)
                        .setSql("receive_extended_count = COALESCE(receive_extended_count, 0) + 1"));
    }

    /**
     * 完成的条件转移（买家确认收货 / 超时自动收货共用这一条边）：{@code WHERE id = ? AND status IN (合法起点集)}
     * 转 COMPLETED，同时回填完成时刻与售后申请窗口，回影响行数。
     *
     * <p>起点集写死成 {@link OrderStatus#sourcesOf} 对 {@code COMPLETED} 的反向投影（= SHIPPED），不作参数：
     * 「哪一态能进完成」是状态机的裁决，交给调用方就多出一条绕过闸门的路。
     *
     * <p>两个时刻同为参数：{@code applyExpireAt} 由 {@code completedAt + AFTER_SALE_APPLY} 推出，与
     * {@link #markPaid} 同一口径——同一个 now 分给两列，语句内部不各取一次时钟。抢不到行（0 行）后
     * 记不记流水、要不要开售后窗口，一律由 service 判。
     */
    default int markCompleted(UUID orderId, OffsetDateTime completedAt, OffsetDateTime applyExpireAt) {
        return update(null, completedWrapper(orderId, completedAt, applyExpireAt));
    }

    /**
     * 超时自动收货专用的完成转移：把「争议未决就让位」（ORD-28 / AFS-43）的谓词在同一语句的 WHERE 里重跑一遍。
     *
     * <p>扫描线读到的是批开始时的投影，service 再判一次等于拿陈旧读决定要不要替买家宣布「已收货」——批次窗口
     * 整整一轮那么长，期间买家完全可以新起一张售后单（SHIPPED 态开放申请，见 AFS-43）。谓词进 WHERE
     * 才是同一时刻的裁决；抢不到行不算失败，售后落到终态后下一轮扫描自愈。
     *
     * <p>买家手点确认收货不受此限（那是他自己的决定），仍走 {@link #markCompleted}。
     */
    default int markCompletedUnlessDisputed(UUID orderId, OffsetDateTime completedAt, OffsetDateTime applyExpireAt) {
        return update(
                null,
                completedWrapper(orderId, completedAt, applyExpireAt)
                        .notIn(Order::getAfterSaleBadge, AfterSaleBadge.REFUNDING));
    }

    private static LambdaUpdateWrapper<Order> completedWrapper(
            UUID orderId, OffsetDateTime completedAt, OffsetDateTime applyExpireAt) {
        return new LambdaUpdateWrapper<Order>()
                .eq(Order::getId, orderId)
                .in(Order::getStatus, OrderStatus.sourcesOf(OrderStatus.COMPLETED))
                .set(Order::getStatus, OrderStatus.COMPLETED)
                .set(Order::getCompletedAt, completedAt)
                .set(Order::getApplyExpireAt, applyExpireAt)
                .set(Order::getUpdatedAt, completedAt);
    }

    /**
     * 售后角标写回（aftersale 每次退款状态变化后经 order :: api 调用）：只写本模块持有的展示投影，不动状态机。
     *
     * <p>角标是「算出来的结论」不是状态（§5.4），由 aftersale 按退款单算好后整值覆盖——它没有中间态，
     * 不存在「从已退款改成退款中」这种需要条件转移保护的竞争：谁最后写，谁看到的就是当时的事实。
     */
    default int syncAfterSaleBadge(UUID orderId, AfterSaleBadge badge) {
        return update(
                null, new LambdaUpdateWrapper<Order>().eq(Order::getId, orderId).set(Order::getAfterSaleBadge, badge));
    }

    /**
     * 退款金额累计入账（退款成功时，与行账本同事务）：已退 = 按行 + 运费，已补偿单独累计。
     *
     * <p>闸门同一条语句：{@code refunded_amount + 本次 ≤ pay_amount}。上限既挡超退，也保证 INV-18 在并发下
     * 不会被两笔各看旧值的退款同时顶破。补偿不占退款上限（§6.3），只累计。
     *
     * <p>币种进 WHERE：一单恒单币种，换币种的退款落不进这一行，于是连 WHERE 一起挡掉。
     */
    default int addRefundTotals(UUID orderId, long refunded, long compensated, String currency) {
        return update(
                null,
                new LambdaUpdateWrapper<Order>()
                        .eq(Order::getId, orderId)
                        .eq(Order::getCurrency, currency)
                        .apply("refunded_amount + {0} <= pay_amount", refunded)
                        .setSql("refunded_amount = refunded_amount + " + refunded
                                + ", compensated_amount = compensated_amount + " + compensated));
    }

    /**
     * 取消订单的条件转移：限定调用方给出的合法源状态集（买家取消给 {@link OrderStatus#sourcesOf} 的全集，
     * 系统关单各只认自己那一态），成功时经 PG18 RETURNING OLD 带回<b>转移前</b>的状态——
     * 付款前后取消的库存回退分流据此判定，不再依赖 CAS 前的陈旧读。
     * 无行返回 = 抢不到转移（已发货/已完成/已关闭），调用方给 409 或让位。
     *
     * <p>声明为 @Select 是消费 RETURNING 结果集的既定姿势（走 executeQuery 而非 executeUpdate）；
     * 出入参都是枚举，与 status 列的 varchar 由默认 EnumTypeHandler 对译，避免字符串与枚举混比。
     */
    @Select(
            """
            <script>
            UPDATE orders.orders
            SET status = 'CANCELLED', cancelled_at = #{cancelledAt}, cancel_reason = #{reason}
            WHERE id = #{orderId}
              AND status IN
              <foreach collection="sources" item="source" open="(" separator=", " close=")">#{source}</foreach>
            RETURNING OLD.status AS "previousStatus"
            </script>
            """)
    OrderStatus cancelReturningPrevious(
            @Param("orderId") UUID orderId,
            @Param("sources") Collection<OrderStatus> sources,
            @Param("cancelledAt") OffsetDateTime cancelledAt,
            @Param("reason") String reason);
}
