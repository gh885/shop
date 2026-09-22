package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.aftersale.model.TicketStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface TicketMapper extends BaseMapper<Ticket> {

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
}
