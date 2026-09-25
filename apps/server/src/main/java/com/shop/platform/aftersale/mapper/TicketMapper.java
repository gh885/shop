package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.aftersale.model.TicketStatus;
import com.shop.platform.common.PageParams;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface TicketMapper extends BaseMapper<Ticket> {

    /**
     * 卖家售后工作台分页：本店新建在前（创建时间倒序，最新的申请/处理在最上面）。
     *
     * <p>shopId 参与条件而不是「查出来再过滤」：越店的单不该出现在响应里（AFS-06 同一口径）。
     *
     * <p>filter 传 null = 全部档。刻意<b>不做「进行中优先」的排序</b>：待办与历史是同一张表的两种看法，让 status
     * 筛选去分流（前端默认停在「待处理」tab），比在 SQL 里编一个状态优先级更容易讲清楚。
     */
    default Page<Ticket> selectPageByShop(PageParams pageParams, UUID shopId, TicketStatus filter) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<Ticket>()
                        .eq(Ticket::getShopId, shopId)
                        .eq(filter != null, Ticket::getStatus, filter)
                        .orderByDesc(Ticket::getCreatedAt));
    }

    /** 某订单进行中的售后单（APPLYING / RETURNING）：唯一部分索引保证至多一张，无则 null */
    default Ticket selectOpenByOrder(UUID orderId) {
        return selectOne(new LambdaQueryWrapper<Ticket>()
                .eq(Ticket::getOrderId, orderId)
                .in(Ticket::getStatus, TicketStatus.APPLYING, TicketStatus.RETURNING));
    }

    /** 某订单最近一张售后单（含终态）：详情展示用，无则 null */
    default Ticket selectLatestByOrder(UUID orderId) {
        return selectOne(new LambdaQueryWrapper<Ticket>()
                .eq(Ticket::getOrderId, orderId)
                .orderByDesc(Ticket::getCreatedAt)
                .last("LIMIT 1"));
    }

    /**
     * 一批订单各自进行中的售后单（APPLYING / RETURNING）：卖家订单列表行内按钮的动作集来源。
     *
     * <p>shopId 参与条件而不是「查出来再过滤」：越店的单不该出现在响应里，哪怕调用方递来了别人的 orderId。
     */
    default List<Ticket> selectOpenByOrders(UUID shopId, List<UUID> orderIds) {
        return selectList(new LambdaQueryWrapper<Ticket>()
                .eq(Ticket::getShopId, shopId)
                .in(Ticket::getOrderId, orderIds)
                .in(Ticket::getStatus, TicketStatus.APPLYING, TicketStatus.RETURNING));
    }

    /**
     * 超时扫描①（C11）：APPLYING 且入态已久的单，创建时间升序（最老的先处理），批上限由调用方给。
     *
     * <p>入态时刻为什么敢用 created_at：售后单生下来就是 APPLYING（apply 唯一入口），且转移表里
     * 没有任何动作转回 APPLYING——状态还挂着的行，created_at 就是当前态的起点。
     */
    default List<Ticket> selectApplyingExpired(OffsetDateTime expiredBefore, int limit) {
        return selectList(new LambdaQueryWrapper<Ticket>()
                .eq(Ticket::getStatus, TicketStatus.APPLYING)
                .lt(Ticket::getCreatedAt, expiredBefore)
                .orderByAsc(Ticket::getCreatedAt)
                .last("LIMIT " + limit));
    }

    /**
     * 超时扫描②（C11）：RETURNING、买家<b>从未填过</b>回寄运单号、且同意已过期已久的单。
     *
     * <p>为什么用 EXISTS 时间线而不是票上的列：tickets 没有「进入 RETURNING 时刻」列（不加迁移），
     * updated_at 又不可信（转移走 update(null, wrapper)，MP 自动填充只作用在实体参数上，条件更新不碰它）；
     * 而一张单只进一次 RETURNING（出边只有 REFUNDED/CLOSED），同意动作落下的 AGREE_RETURN /
     * AUTO_AGREE_RETURN 事件时刻即入态时刻——时间线本来就是售后的真相账本，扫描认它不认副本。
     * 「买家未回寄」直接看投影列 return_tracking_no IS NULL：填过单号的单货已在途，轮到定时器关它。
     */
    @Select(
            """
            SELECT t.* FROM aftersale.tickets t
            WHERE t.status = 'RETURNING'
              AND t.return_tracking_no IS NULL
              AND EXISTS (
                    SELECT 1 FROM aftersale.ticket_events e
                    WHERE e.ticket_id = t.id
                      AND e.action IN ('AGREE_RETURN', 'AUTO_AGREE_RETURN')
                      AND e.created_at < #{expiredBefore})
            ORDER BY t.created_at
            LIMIT #{limit}
            """)
    List<Ticket> selectReturnShipExpired(
            @Param("expiredBefore") OffsetDateTime expiredBefore, @Param("limit") int limit);

    /**
     * 超时扫描③（AFS-23）：RETURNING、买家<b>已填过</b>回寄运单号、且最后一次回寄已过期已久的单
     * → 卖家确认收货超时，系统自动退款。与扫描② 靠 {@code return_tracking_no} 的是否为空严格互斥。
     *
     * <p>计时起点取 MAX(RETURN_GOODS 事件时刻) 而不是「存在一条过期事件」：运单号可重复提交覆盖
     * （AFS-41），买家改单号等于重新寄一次，钟该从他最后一次寄出起算，否则改个错单号的单会被老事件提前判死。
     * 子查询取不到行（从未回寄）时 NULL 比较为假，天然被排除；投影列条件因此是冗余的第二道保险，
     * 留着是因为它可读——扫的是「货在路上的单」。
     */
    @Select(
            """
            SELECT t.* FROM aftersale.tickets t
            WHERE t.status = 'RETURNING'
              AND t.return_tracking_no IS NOT NULL
              AND (SELECT MAX(e.created_at) FROM aftersale.ticket_events e
                   WHERE e.ticket_id = t.id AND e.action = 'RETURN_GOODS') < #{expiredBefore}
            ORDER BY t.created_at
            LIMIT #{limit}
            """)
    List<Ticket> selectReturnReceiveExpired(
            @Param("expiredBefore") OffsetDateTime expiredBefore, @Param("limit") int limit);

    /**
     * 状态转移的并发闸门：{@code WHERE id = ? AND status = from SET status = to}，回影响行数。
     *
     * <p>from / to 由 service 依 {@code TicketAction} 转移表推导后传入（哪条边合法是本模块的规则，不下 mapper）；
     * 本方法只保证「不是那一行就不改」。0 行 = 有人先把这张单处理了，让位——409 还是重试由调用方判。
     */
    default int transitionStatus(UUID ticketId, TicketStatus from, TicketStatus to) {
        return update(null, statusGate(ticketId, from, to));
    }

    /**
     * 转移并回填退款生效时刻（仅退款同意 / 退货收货 / 超时自动退款共用）。
     *
     * <p>状态与时刻在同一笔 UPDATE 里落：分开写必然出现「已 REFUNDED 但退款时间为空」的中间帧。
     */
    default int transitionRefunded(UUID ticketId, TicketStatus from, TicketStatus to, OffsetDateTime refundedAt) {
        return update(null, statusGate(ticketId, from, to).set(Ticket::getRefundedAt, refundedAt));
    }

    /**
     * 转移并落回寄投影两列（买家填运单号）：承运商与单号是一件事的两半，同语句写入不出现只有单号没有承运商的行。
     *
     * <p>两列无条件覆写——回寄单号允许重复提交覆盖（AFS-41），改哪个都算一次新提交，不做「给了才改」。
     */
    default int transitionReturnShipped(
            UUID ticketId, TicketStatus from, TicketStatus to, String returnLogisticsCompany, String returnTrackingNo) {
        return update(
                null,
                statusGate(ticketId, from, to)
                        .set(Ticket::getReturnLogisticsCompany, returnLogisticsCompany)
                        .set(Ticket::getReturnTrackingNo, returnTrackingNo));
    }

    /**
     * 超时自动关闭（买家迟迟未回寄）：闸门比通用转移多一道 {@code return_tracking_no IS NULL}。
     *
     * <p>这道守卫写死在语句里而不是由调用方传开关：扫描与落点之间买家刚提交了回寄，就让位给他——
     * 货已在途的单被关成 CLOSED 是笔对不上的账。
     */
    default int transitionClosingUnshipped(UUID ticketId, TicketStatus from, TicketStatus to) {
        return update(null, statusGate(ticketId, from, to).isNull(Ticket::getReturnTrackingNo));
    }

    /** 各条转移语句共用的闸门与 SET 主干：条件逐字一致，差异只在各自附带的那几列 */
    private static LambdaUpdateWrapper<Ticket> statusGate(UUID ticketId, TicketStatus from, TicketStatus to) {
        return new LambdaUpdateWrapper<Ticket>()
                .eq(Ticket::getId, ticketId)
                .eq(Ticket::getStatus, from)
                .set(Ticket::getStatus, to);
    }
}
