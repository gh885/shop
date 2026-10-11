package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.Validate;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderStatus;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

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
     * 买家「我的订单」分页：本人名下 + 可选状态档，新单在前。
     *
     * <p>与 {@link #selectPageByShop} 是同一形状的两句（只有归属列不同）：归属列写死在各自的方法里，
     * 不由调用方传列引用——买卖两侧的「谁的单」是这道查询的适用域，传错列等于把别人的单列进你的列表。
     *
     * <p>{@code filter} 传 null = 全部档；非法状态值的 400 裁决在 service（mapper 只收已归一的枚举）。
     */
    default Page<Order> selectPageByBuyer(PageParams pageParams, UUID userId, OrderStatus filter) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<Order>()
                        .eq(Order::getUserId, userId)
                        .eq(filter != null, Order::getStatus, filter)
                        .orderByDesc(Order::getCreatedAt));
    }

    /** 卖家订单分页：本店新建在前，档位列与 {@link #selectPageByBuyer} 同一口径（shop_id 是归属闸门，不是先查再过滤） */
    default Page<Order> selectPageByShop(PageParams pageParams, UUID shopId, OrderStatus filter) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<Order>()
                        .eq(Order::getShopId, shopId)
                        .eq(filter != null, Order::getStatus, filter)
                        .orderByDesc(Order::getCreatedAt));
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
     * 支付成功的条件转移：{@code WHERE id = ? AND status IN (合法起点集) SET status='PAID'} 并回填
     * paid_at 与发货时限，回影响行数（0 行 = 已取消/已支付/不存在，409 裁决在调用方）。
     *
     * <p>起点集写死成 {@link OrderStatus#sourcesOf} 对 {@code PAID} 的反向投影，不作参数：那张转移表是本模块
     * 状态机的唯一真相，把起点交给调用方等于允许有人从 COMPLETED「支付」一次。目标态同理写死为 PAID。
     *
     * <p>两个时刻是参数而不是守卫：{@code paidAt} 与 {@code shipExpireAt} 必须由<b>同一个 now</b> 推出来
     * （发货时限是「付款时刻 + SHIP」），在语句内部各取一次时钟会出现两个不同的「现在」；与
     * {@link #markDelivered} / {@link #markReturned} 同一形状。
     */
    default int markPaid(UUID orderId, OffsetDateTime paidAt, OffsetDateTime shipExpireAt) {
        return update(
                null,
                new LambdaUpdateWrapper<Order>()
                        .eq(Order::getId, orderId)
                        .in(Order::getStatus, OrderStatus.sourcesOf(OrderStatus.PAID))
                        .set(Order::getStatus, OrderStatus.PAID)
                        .set(Order::getPaidAt, paidAt)
                        .set(Order::getShipExpireAt, shipExpireAt));
    }

    /**
     * 发货的条件转移：本店 + 可发货状态（PAID 首次发货 / SHIPPED 追加包裹，含已取消与已完成），
     * 成功时经 PG18 RETURNING OLD 带回<b>转移前</b>的状态——前态决定要不要落审计流水：
     * PAID → SHIPPED 是一次状态转移，SHIPPED → SHIPPED 只是同一订单的又一个包裹。
     * 无行返回 = 抢不到（非本店 / 已取消 / 已完成 / 不存在），调用方给 404 或 409。
     *
     * <p>shipped_at 与 receive_expire_at 用 COALESCE 只回填一次：订单的发货时刻与收货窗口属于<b>首次</b>发货，
     * 追加包裹不得把它们往后推。logistics_company / tracking_no 则每次刷新为最新包裹（订单详情的物流摘要口径）。
     */
    @Select(
            """
            UPDATE orders.orders
            SET status = 'SHIPPED',
                shipped_at = COALESCE(shipped_at, #{shippedAt}),
                receive_expire_at = COALESCE(receive_expire_at, #{receiveExpireAt}),
                logistics_company = #{carrierName},
                tracking_no = #{trackingNo}
            WHERE id = #{orderId}
              AND shop_id = #{shopId}
              AND status IN ('PAID', 'SHIPPED')
            RETURNING OLD.status AS "previousStatus"
            """)
    OrderStatus markShippedReturningPrevious(
            @Param("orderId") UUID orderId,
            @Param("shopId") UUID shopId,
            @Param("carrierName") String carrierName,
            @Param("trackingNo") String trackingNo,
            @Param("shippedAt") OffsetDateTime shippedAt,
            @Param("receiveExpireAt") OffsetDateTime receiveExpireAt);

    /**
     * 签收事实落库（物流模块推进到已签收时经 order :: api 调用）：只写投影列 + 把收货窗口从签收起重算。
     * 限定 SHIPPED 且 delivered_at 为空——重复签收幂等无副作用，已取消/已完成的单不会被物流回写改动。
     */
    default int markDelivered(UUID orderId, OffsetDateTime deliveredAt, OffsetDateTime receiveExpireAt) {
        return update(
                null,
                new LambdaUpdateWrapper<Order>()
                        .eq(Order::getId, orderId)
                        .eq(Order::getStatus, OrderStatus.SHIPPED)
                        .isNull(Order::getDeliveredAt)
                        .set(Order::getDeliveredAt, deliveredAt)
                        .set(Order::getReceiveExpireAt, receiveExpireAt));
    }

    /**
     * 包裹退回事实落库（物流模块推进到退回时经 order :: api 调用）：只把收货窗口从退回时刻重算，不写签收投影。
     * 限定 SHIPPED 且 delivered_at 为空——只要有任何一件签收过，签收就是「买家拿到货」的更权威事实，不再被退回改动；
     * 已完成/已取消的单同样不命中（幂等无副作用）。
     */
    default int markReturned(UUID orderId, OffsetDateTime receiveExpireAt) {
        return update(
                null,
                new LambdaUpdateWrapper<Order>()
                        .eq(Order::getId, orderId)
                        .eq(Order::getStatus, OrderStatus.SHIPPED)
                        .isNull(Order::getDeliveredAt)
                        .set(Order::getReceiveExpireAt, receiveExpireAt));
    }

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
                        .notIn(Order::getAfterSaleStatus, AfterSaleStatus.APPLYING, AfterSaleStatus.RETURNING));
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
     * 售后投影写回（aftersale 每次转移后经 order :: api 调用）：只写本模块持有的两列投影，不动状态机。
     *
     * <p>退款额可空：只有退款完成那一次带值，其余转移传 null 即<b>原样不动</b>那列（不是清空）。
     *
     * <p>带退款额时币种同时进 WHERE：orders 的币种列是本单既定的（一单一个币种），换币种的退款落不进这一行，
     * 于是连 WHERE 一起挡掉（币种不符即视为未命中）。退款额收 Money 而不是拆成「分 + 币种」两个标量：
     * 那两个半边必须来自同一笔钱，拆开传就有一次传错的机会，而传错的后果是账对不上而不是报错。
     */
    default int syncAfterSale(UUID orderId, AfterSaleStatus afterSaleStatus, Money refundAmount) {
        LambdaUpdateWrapper<Order> update = new LambdaUpdateWrapper<Order>()
                .eq(Order::getId, orderId)
                .set(Order::getAfterSaleStatus, afterSaleStatus);
        if (refundAmount != null) {
            update.eq(Order::getCurrency, refundAmount.currency());
            update.set(Order::getRefundAmount, refundAmount.amount());
        }
        return update(null, update);
    }

    /** 同一次结算已落的全部订单（幂等重放回读）；按 shopId 升序，与 OrderService.create 的拆单顺序一致 */
    default List<Order> selectByCheckoutKey(UUID userId, UUID checkoutKey) {
        return selectList(new LambdaQueryWrapper<Order>()
                .eq(Order::getUserId, userId)
                .eq(Order::getCheckoutKey, checkoutKey)
                .orderByAsc(Order::getShopId));
    }

    /**
     * 恶拍闸门的用户级串行闸。两条计数闸是「先 count 再 insert」，并发的 N 次结算各自读到阈值以下就全部放行
     * （写偏斜：各插自己的单、互不碰对方的行，行级手段挡不住），而只有刷单脚本才会同时发 N 个请求——
     * 闸门恰好在该起作用的那一刻失效。按 userId 取事务级咨询锁，把<b>同一个买家</b>的结算串成一条线，
     * 别的买家零影响；事务结束自动释放，实例崩溃无残留。
     *
     * <p>用阻塞版而非 try：双开两个页签各点一次结算是正常人会做的事，第二个应等第一个提交后接着算
     * （计数到 10 再 429），不该一碰就 429。hashtext 取整型哈希，不同用户撞同一个数只多排一次队，不影响正确性。
     * 必须在事务里调用（{@code _xact_} 语义，否则语句结束即释放等于没锁）。返回 PG 的 void（恒为 null），
     * 声明成 String 只为让 MyBatis 认这条 SELECT。锁与两条计数必须成对出现在
     * {@code OrderService.assertNotMaliciousBidder} 这一个私有出口里，否则新增调用点会忘记取锁。
     */
    @Select("SELECT pg_advisory_xact_lock(hashtext(#{userId}::text))")
    String lockCheckoutGate(@Param("userId") UUID userId);

    /** 恶拍闸门①：买家当前在途的待付款单数（走 idx_orders_user_created 的 user_id 前缀） */
    default long countPendingPayment(UUID userId) {
        return selectCount(new LambdaQueryWrapper<Order>()
                .eq(Order::getUserId, userId)
                .eq(Order::getStatus, OrderStatus.PENDING_PAYMENT));
    }

    /**
     * 恶拍闸门②：窗口内「拍下不付即关闭」的单数。paid_at 为空是判据——已付款后取消（含 3 天未发货的
     * 系统关单）与「拍下不付」是两回事，不该算进恶意次数。
     */
    default long countUnpaidCancelledSince(UUID userId, OffsetDateTime since) {
        return selectCount(new LambdaQueryWrapper<Order>()
                .eq(Order::getUserId, userId)
                .eq(Order::getStatus, OrderStatus.CANCELLED)
                .isNull(Order::getPaidAt)
                .ge(Order::getCancelledAt, since));
    }

    /**
     * 取消订单的条件转移：限定调用方给出的合法源状态集（买家取消给 {@link OrderStatus#sourcesOf} 的全集，
     * 系统超时各只认自己那一态），成功时经 PG18 RETURNING OLD 带回<b>转移前</b>的状态——
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
