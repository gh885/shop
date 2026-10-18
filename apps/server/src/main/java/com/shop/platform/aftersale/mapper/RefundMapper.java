package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.aftersale.model.RefundStatus;
import com.shop.platform.common.PageParams;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 退款单持久化入口：状态迁移一律条件更新（WHERE status = 动作前置态），影响行数即并发闸门。
 *
 * <p>同一时刻「同一订单行至多一张未完结退款单」的硬闸门在 {@code refund_lines} 的部分唯一索引上
 * （{@code uk_refund_lines_open_item}），本接口只提供读它、标记它、以及把单子推进到终态的语句——
 * 先查后插在并发下必漏，故那里不靠 service 的判断。
 */
@Mapper
public interface RefundMapper extends BaseMapper<Refund> {

    /** 最近一张退款单（含终态）：买家/卖家详情都取它 */
    default Refund selectLatestByOrder(UUID orderId) {
        return selectOne(new LambdaQueryWrapper<Refund>()
                .eq(Refund::getOrderId, orderId)
                .orderByDesc(Refund::getCreatedAt)
                .last("LIMIT 1"));
    }

    /** 最近一张未完结退款单：没有就回 null（详情优先展示进行中的那笔） */
    default Refund selectLatestOpenByOrder(UUID orderId) {
        return selectOne(new LambdaQueryWrapper<Refund>()
                .eq(Refund::getOrderId, orderId)
                .in(Refund::getStatus, RefundStatus.openStatuses())
                .orderByDesc(Refund::getCreatedAt)
                .last("LIMIT 1"));
    }

    /** 本店有未完结退款单的订单（卖家订单列表行内按钮批查用） */
    default List<Refund> selectOpenByOrders(UUID shopId, Collection<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return List.of();
        }
        return selectList(new LambdaQueryWrapper<Refund>()
                .eq(Refund::getShopId, shopId)
                .in(Refund::getOrderId, orderIds)
                .in(Refund::getStatus, RefundStatus.openStatuses()));
    }

    /** 卖家退款工作台分页：本店、created_at 倒序，status 可筛 */
    default Page<Refund> selectPageByShop(PageParams pageParams, UUID shopId, RefundStatus filter) {
        QueryWrapper<Refund> wrapper =
                new QueryWrapper<Refund>().eq("shop_id", shopId).orderByDesc("created_at");
        if (filter != null) {
            wrapper.eq("status", filter.name());
        }
        return selectPage(new Page<>(pageParams.page(), pageParams.size()), wrapper);
    }

    /**
     * 加行锁读退款单：执行渠道退款的入口必须先锁住这一行。
     *
     * <p>没有它，两路人马（卖家同意与重试任务）会同时读到「退款中」，各自调一次渠道、各自累加一次已退额——
     * 渠道侧靠退款单号幂等不会真退两次，但本地账本会记两笔。行锁把执行串行化，后到者醒来时状态已不是退款中。
     */
    @Select("SELECT * FROM aftersale.refunds WHERE id = #{id} FOR UPDATE")
    Refund selectByIdForUpdate(@Param("id") UUID id);

    /** 通用条件迁移：从 from 到 to，0 行 = 抢先者已改走别的边 */
    @Update("UPDATE aftersale.refunds SET status = #{to}, updated_at = NOW() "
            + "WHERE id = #{id} AND status = #{from}")
    int transition(@Param("id") UUID id, @Param("from") RefundStatus from, @Param("to") RefundStatus to);

    /** 卖家同意：待处理 → 已同意，同时定格同意时刻（回寄窗口的计时起点） */
    @Update("UPDATE aftersale.refunds SET status = 'AGREED', agreed_at = #{agreedAt}, updated_at = #{agreedAt} "
            + "WHERE id = #{id} AND status = 'PENDING'")
    int markAgreed(@Param("id") UUID id, @Param("agreedAt") OffsetDateTime agreedAt);

    /**
     * 买家回寄登记（可重复提交）：待寄回 → 已寄回；已经到「已寄回」再改单号则只更新物流三列与登记时刻，
     * 不改状态（AFS-41 的覆盖更新）。0 行 = 单已离开这两个态，调用方 409。
     */
    @Update("UPDATE aftersale.refunds SET "
            + "status = CASE WHEN status = 'RETURN_PENDING' THEN 'RETURNED' ELSE status END, "
            + "return_carrier_code = #{carrierCode}, return_carrier_name = #{carrierName}, "
            + "return_tracking_no = #{trackingNo}, return_registered_at = #{registeredAt}, "
            + "updated_at = #{registeredAt} "
            + "WHERE id = #{id} AND status IN ('RETURN_PENDING', 'RETURNED')")
    int markReturned(
            @Param("id") UUID id,
            @Param("carrierCode") String carrierCode,
            @Param("carrierName") String carrierName,
            @Param("trackingNo") String trackingNo,
            @Param("registeredAt") OffsetDateTime registeredAt);

    /** 卖家已收货：已寄回 → 卖家已收货 */
    @Update("UPDATE aftersale.refunds SET status = 'RECEIVED', updated_at = NOW() "
            + "WHERE id = #{id} AND status = 'RETURNED'")
    int markReceived(@Param("id") UUID id);

    /** 退款成功：退款中 → 已退款，回填成功时刻（渠道确认成功后唯一的状态落点） */
    @Update(
            "UPDATE aftersale.refunds SET status = 'REFUNDED', succeeded_at = #{succeededAt}, updated_at = #{succeededAt} "
                    + "WHERE id = #{id} AND status = 'REFUNDING'")
    int markRefunded(@Param("id") UUID id, @Param("succeededAt") OffsetDateTime succeededAt);

    /** 自动重试耗尽：退款中 → 失败，等人工处置 */
    @Update("UPDATE aftersale.refunds SET status = 'FAILED', updated_at = NOW() "
            + "WHERE id = #{id} AND status = 'REFUNDING'")
    int markFailed(@Param("id") UUID id);

    /** 人工重试：失败 → 退款中（随后由执行入口再次提交渠道） */
    @Update("UPDATE aftersale.refunds SET status = 'REFUNDING', updated_at = NOW() "
            + "WHERE id = #{id} AND status = 'FAILED'")
    int markRetrying(@Param("id") UUID id);

    /** 撤销：从指定前态到已撤销（买家在待处理/待寄回，卖家在已寄回确认拦截） */
    @Update("UPDATE aftersale.refunds SET status = 'CANCELLED', updated_at = NOW() "
            + "WHERE id = #{id} AND status = #{from}")
    int markCancelled(@Param("id") UUID id, @Param("from") RefundStatus from);

    /** 买家超时未回寄自动关闭：守卫「还没登记过回寄」在同一条语句里重跑，货已在途的单绝不关 */
    @Update("UPDATE aftersale.refunds SET status = 'CANCELLED', updated_at = NOW() "
            + "WHERE id = #{id} AND status = 'RETURN_PENDING' AND return_registered_at IS NULL")
    int markCancelledUnshipped(@Param("id") UUID id);

    /** 卖家拒绝：待处理 → 已拒绝，理由一列写一次 */
    @Update("UPDATE aftersale.refunds SET status = 'REJECTED', reject_reason = #{rejectReason}, updated_at = NOW() "
            + "WHERE id = #{id} AND status = 'PENDING'")
    int markRejected(@Param("id") UUID id, @Param("rejectReason") String rejectReason);

    /**
     * 角标事实①：本单是否存在未完结退款单。
     *
     * <p>未完结集合由 {@link RefundStatus#openStatuses()} 给（含重试期的退款中，不含已耗尽的失败）——
     * 与 §8 的定义同一份，不在 SQL 里再抄一遍状态名。
     */
    @Select(
            """
            <script>
            SELECT EXISTS(
                SELECT 1 FROM aftersale.refunds r
                WHERE r.order_id = #{orderId} AND r.status IN
                <foreach collection="statuses" item="s" open="(" separator=", " close=")">#{s}</foreach>
            )
            </script>
            """)
    boolean existsOpenByOrder(@Param("orderId") UUID orderId, @Param("statuses") Set<RefundStatus> statuses);

    /** 角标事实①（主订单口径）：任一子订单有未完结退款 */
    @Select(
            """
            <script>
            SELECT EXISTS(
                SELECT 1 FROM aftersale.refunds r
                WHERE r.trade_id = #{tradeId} AND r.status IN
                <foreach collection="statuses" item="s" open="(" separator=", " close=")">#{s}</foreach>
            )
            </script>
            """)
    boolean existsOpenByTrade(@Param("tradeId") UUID tradeId, @Param("statuses") Set<RefundStatus> statuses);

    /** 角标事实②：本单是否成功退过商品/运费款（已退款优先于已补偿） */
    @Select(
            """
            SELECT EXISTS(
                SELECT 1 FROM aftersale.refunds r
                JOIN aftersale.refund_lines l ON l.refund_id = r.id
                WHERE r.order_id = #{orderId} AND r.status = 'REFUNDED' AND l.line_type IN ('ITEM', 'SHIPPING'))
            """)
    boolean existsSucceededGoodsByOrder(@Param("orderId") UUID orderId);

    /** 角标事实②（主订单口径） */
    @Select(
            """
            SELECT EXISTS(
                SELECT 1 FROM aftersale.refunds r
                JOIN aftersale.refund_lines l ON l.refund_id = r.id
                WHERE r.trade_id = #{tradeId} AND r.status = 'REFUNDED' AND l.line_type IN ('ITEM', 'SHIPPING'))
            """)
    boolean existsSucceededGoodsByTrade(@Param("tradeId") UUID tradeId);

    /** 角标事实③：本单是否成功给过补偿（不含商品/运费退款） */
    @Select(
            """
            SELECT EXISTS(
                SELECT 1 FROM aftersale.refunds r
                JOIN aftersale.refund_lines l ON l.refund_id = r.id
                WHERE r.order_id = #{orderId} AND r.status = 'REFUNDED' AND l.line_type = 'COMPENSATION')
            """)
    boolean existsSucceededCompensationByOrder(@Param("orderId") UUID orderId);

    /** 角标事实③（主订单口径） */
    @Select(
            """
            SELECT EXISTS(
                SELECT 1 FROM aftersale.refunds r
                JOIN aftersale.refund_lines l ON l.refund_id = r.id
                WHERE r.trade_id = #{tradeId} AND r.status = 'REFUNDED' AND l.line_type = 'COMPENSATION')
            """)
    boolean existsSucceededCompensationByTrade(@Param("tradeId") UUID tradeId);

    // 定时线：三条超时 + 一条重试。取数口径写死在 SQL 里，计时起点不用 updated_at（条件更新不触发填充）

    /** 待处理超 48h：卖家未处置 → 自动同意 */
    @Select("SELECT * FROM aftersale.refunds WHERE status = 'PENDING' AND created_at < #{before} "
            + "ORDER BY created_at LIMIT #{limit}")
    List<Refund> selectExpiredPending(@Param("before") OffsetDateTime before, @Param("limit") int limit);

    /** 待寄回超 7 天且从未登记回寄：买家放弃 → 自动关闭 */
    @Select("SELECT * FROM aftersale.refunds WHERE status = 'RETURN_PENDING' AND agreed_at < #{before} "
            + "AND return_registered_at IS NULL ORDER BY agreed_at LIMIT #{limit}")
    List<Refund> selectExpiredReturnPending(@Param("before") OffsetDateTime before, @Param("limit") int limit);

    /** 已寄回超 10 天：卖家未确认收货 → 自动退款 */
    @Select("SELECT * FROM aftersale.refunds WHERE status = 'RETURNED' AND return_registered_at < #{before} "
            + "ORDER BY return_registered_at LIMIT #{limit}")
    List<Refund> selectExpiredReturned(@Param("before") OffsetDateTime before, @Param("limit") int limit);

    /**
     * 退款中且上一次渠道调用已过退避窗口：重试候选。
     *
     * <p>「上一次」取执行记录的最大时刻；一笔刚进退款中、还没来得及执行就崩了的单没有记录，退回单子的
     * {@code updated_at}——两条都老得够久才重试，否则会与正在进行的执行抢同一行。
     */
    @Select(
            """
            SELECT r.* FROM aftersale.refunds r
            WHERE r.status = 'REFUNDING'
              AND COALESCE(
                    (SELECT MAX(e.created_at) FROM aftersale.refund_executions e WHERE e.refund_id = r.id),
                    r.updated_at) < #{before}
            ORDER BY r.updated_at
            LIMIT #{limit}
            """)
    List<Refund> selectRetryable(@Param("before") OffsetDateTime before, @Param("limit") int limit);
}
