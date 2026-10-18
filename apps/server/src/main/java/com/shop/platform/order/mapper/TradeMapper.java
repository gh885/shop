package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.PageParams;
import com.shop.platform.order.api.AfterSaleBadge;
import com.shop.platform.order.model.MainProgress;
import com.shop.platform.order.model.TradeClosedReason;
import com.shop.platform.order.model.TradeStatus;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 主订单持久化入口：一次支付的载体。
 *
 * <p>状态转移只走条件更新（WHERE status IN sourcesOf(...)），影响行数即并发闸门；
 * 关单与支付都不是「先读后写」。子订单归属由 {@code orders.orders.trade_id} 反查。
 */
@Mapper
public interface TradeMapper extends BaseMapper<Trade> {

    /** 同一买家同一次结算只落一张主订单：幂等重放回读的入口 */
    default Trade selectByCheckoutKey(UUID userId, UUID checkoutKey) {
        return selectOne(
                new LambdaQueryWrapper<Trade>().eq(Trade::getUserId, userId).eq(Trade::getCheckoutKey, checkoutKey));
    }

    /** 取本人的主订单：越权与不存在同为 404 */
    default Trade requireOwned(UUID userId, UUID tradeId) {
        return com.shop.platform.common.Validate.requireOwned(selectById(tradeId), Trade::getUserId, userId, "订单不存在");
    }

    /**
     * 买家「我的订单」分页：以<b>主订单</b>为单位，新单在前，可按主进度页签筛选。
     *
     * <p>筛选谓词落在 {@code orders.trade_progress} 视图上（V84）：主进度是投影不是列，
     * 想在库里筛选就得让库也会算它。视图里那份 CASE 是唯一实现，本方法只做等值过滤，
     * 不复述 §5.3 的七条规则——两处各推必漂移。
     *
     * <p>{@code filter} 传 null = 全部页签；取值已由 service 归一，mapper 只收枚举。
     */
    default Page<Trade> selectPageByBuyer(PageParams pageParams, UUID userId, MainProgress filter) {
        QueryWrapper<Trade> wrapper =
                new QueryWrapper<Trade>().eq("user_id", userId).orderByDesc("created_at");
        if (filter != null) {
            wrapper.exists(
                    "SELECT 1 FROM orders.trade_progress p "
                            + "WHERE p.trade_id = orders.trades.id AND p.main_progress = {0}",
                    filter.name());
        }
        return selectPage(new Page<>(pageParams.page(), pageParams.size()), wrapper);
    }

    /**
     * 一批主订单的主进度：列表装配时一次取齐，免逐单再查。
     *
     * <p>视图对每张主订单恰好一行，所以返回行的 trade_id 与入参一一对应；调用方按 id 取用即可。
     */
    @Select(
            """
            <script>
            SELECT trade_id AS "tradeId", main_progress AS "mainProgress"
            FROM orders.trade_progress
            WHERE trade_id IN
            <foreach collection="tradeIds" item="id" open="(" separator=", " close=")">#{id}</foreach>
            </script>
            """)
    List<TradeProgressRow> mainProgressOf(@Param("tradeIds") Collection<UUID> tradeIds);

    /** 主进度投影的一行：只装「哪张主订单、算出来是什么」 */
    record TradeProgressRow(UUID tradeId, MainProgress mainProgress) {}

    /**
     * 主订单退款金额累计入账（子订单退款成功时，与行账本同事务）：{@code refunded_amount + 本次 ≤ paid_amount}。
     *
     * <p>上限读 {@code paid_amount} 而不是 {@code pay_amount}：未支付的关单不该有退款，已关闭单的退款上限
     * 也只能是实际收到的钱（INV-22 的等号随之成立）。
     */
    default int addRefundTotals(UUID tradeId, long refunded, long compensated, String currency) {
        return update(
                null,
                new LambdaUpdateWrapper<Trade>()
                        .eq(Trade::getId, tradeId)
                        .eq(Trade::getCurrency, currency)
                        .apply("refunded_amount + {0} <= paid_amount", refunded)
                        .setSql("refunded_amount = refunded_amount + " + refunded
                                + ", compensated_amount = compensated_amount + " + compensated));
    }

    /** 主订单售后角标写回（aftersale 按整单退款状态算好后整值覆盖，§5.4） */
    default int syncAfterSaleBadge(UUID tradeId, AfterSaleBadge badge) {
        return update(
                null, new LambdaUpdateWrapper<Trade>().eq(Trade::getId, tradeId).set(Trade::getAfterSaleBadge, badge));
    }

    /**
     * 全额退款关单（§8）：该主订单下全部子订单均处终态（已取消 / 已完成）且
     * {@code refunded_amount = paid_amount} ⇒ 转已关闭，原因 = 全额退款。
     *
     * <p>三条谓词都进 WHERE：终态集合、退款等号、未支付不给关（{@code paid_amount > 0} 隐含在等号里，
     * 但 0 = 0 会让一张从没付过钱的单被「全额退款」关掉，故显式要求已付）。
     *
     * <p>0 行不是错误：还有子订单在履约中，或这次退款没把总额退满——关单条件本就不成立。
     */
    default int closeIfFullyRefunded(UUID tradeId, OffsetDateTime closedAt) {
        return update(
                null,
                new LambdaUpdateWrapper<Trade>()
                        .eq(Trade::getId, tradeId)
                        .eq(Trade::getStatus, TradeStatus.PAID)
                        .set(Trade::getStatus, TradeStatus.CLOSED)
                        .set(Trade::getClosedReason, TradeClosedReason.FULL_REFUND)
                        .set(Trade::getClosedAt, closedAt)
                        .set(Trade::getUpdatedAt, closedAt)
                        .apply("paid_amount > 0 AND refunded_amount = paid_amount")
                        .notExists("SELECT 1 FROM orders.orders o WHERE o.trade_id = orders.trades.id"
                                + " AND o.status NOT IN ('CANCELLED', 'COMPLETED')"));
    }

    /**
     * 支付成功的条件转移：{@code WHERE status = PENDING_PAYMENT AND 全部子订单 paid_at 非空 SET PAID}。
     *
     * <p>只由 payment 在确认完最后一条子订单流水后调用；调用早了（还有子订单没付）影响 0 行，
     * 主订单留在待支付，等下一次确认补齐。返回是否真的推进。
     *
     * <p>语句不带 RETURNING，所以用 {@code @Update}：{@code @Select} 走 executeQuery，
     * 无结果集时 MyBatis 把 null 映射进 int 直接炸在拆箱上（这条语句曾因此一跑到真库就报
     * "attempted to return null from a method with a primitive return type"）。
     */
    @Update(
            """
            UPDATE orders.trades t
            SET status = 'PAID',
                paid_amount = t.pay_amount,
                paid_at = #{paidAt},
                updated_at = #{paidAt}
            WHERE t.id = #{tradeId}
              AND t.status = 'PENDING_PAYMENT'
              AND NOT EXISTS (
                    SELECT 1 FROM orders.orders o
                    WHERE o.trade_id = t.id
                      AND o.status <> 'CANCELLED'
                      AND o.paid_at IS NULL)
            """)
    int markPaidIfComplete(@Param("tradeId") UUID tradeId, @Param("paidAt") OffsetDateTime paidAt);

    /**
     * 关单的条件转移：{@code WHERE id = ? AND status IN (合法起点集)}，回影响行数。
     * 0 行 = 已被并发支付/关闭，让位给先到者。
     */
    default int close(UUID tradeId, TradeClosedReason reason, OffsetDateTime closedAt, List<TradeStatus> sources) {
        return update(
                null,
                new LambdaUpdateWrapper<Trade>()
                        .eq(Trade::getId, tradeId)
                        .in(Trade::getStatus, sources)
                        .set(Trade::getStatus, TradeStatus.CLOSED)
                        .set(Trade::getClosedReason, reason)
                        .set(Trade::getClosedAt, closedAt)
                        .set(Trade::getUpdatedAt, closedAt));
    }

    /** 待支付超时扫描：只装待支付且已过截止的主订单，按截止升序取头部 */
    default List<Trade> selectExpiredPay(OffsetDateTime now, int limit) {
        return selectList(new LambdaQueryWrapper<Trade>()
                .eq(Trade::getStatus, TradeStatus.PENDING_PAYMENT)
                .lt(Trade::getPayExpireAt, now)
                .orderByAsc(Trade::getPayExpireAt)
                .last("LIMIT " + limit));
    }

    /**
     * 恶拍闸门的用户级串行闸：两条计数是「先 count 再 insert」，并发 N 发各自读到阈值以下就全部放行。
     * 按 userId 取事务级咨询锁，只串同一买家；必须在事务里调用。
     */
    @Select("SELECT pg_advisory_xact_lock(hashtext(#{userId}::text))")
    String lockCheckoutGate(@Param("userId") UUID userId);

    /** 恶拍闸门①：买家当前在途的待支付主订单数（一次多店结算只算一张，阈值按「次」计） */
    default long countPendingPayment(UUID userId) {
        return selectCount(new LambdaQueryWrapper<Trade>()
                .eq(Trade::getUserId, userId)
                .eq(Trade::getStatus, TradeStatus.PENDING_PAYMENT));
    }

    /** 恶拍闸门②：窗口内「拍下不付即关闭」的主订单数（只数从未支付过的关闭单，超时与买家主动取消同计） */
    default long countUnpaidClosedSince(UUID userId, OffsetDateTime since) {
        return selectCount(new LambdaQueryWrapper<Trade>()
                .eq(Trade::getUserId, userId)
                .eq(Trade::getStatus, TradeStatus.CLOSED)
                .isNull(Trade::getPaidAt)
                .ge(Trade::getClosedAt, since));
    }
}
