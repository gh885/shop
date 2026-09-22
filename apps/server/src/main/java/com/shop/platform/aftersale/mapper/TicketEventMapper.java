package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.aftersale.model.TicketAction;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TicketEventMapper extends BaseMapper<TicketEvent> {

    /**
     * 最近一次拒绝的理由（买家售后详情回显用）：拒绝理由的<b>唯一</b>真相就是时间线上那行 note（AFS-22），
     * 不往 tickets 再复制一列——同一件事存两处必然漂移，也不值一场 migration。
     *
     * <p>REJECTED 是终态、一张单至多拒一次，这里的 ORDER BY + LIMIT 1 只是把「取最新」写进 SQL，
     * 不是在读一份可能有几条的账。
     */
    default String selectLatestRejectNote(UUID ticketId) {
        TicketEvent event = selectOne(new LambdaQueryWrapper<TicketEvent>()
                .select(TicketEvent::getNote)
                .eq(TicketEvent::getTicketId, ticketId)
                .in(TicketEvent::getAction, TicketAction.REJECT.name(), TicketAction.REJECT_RETURN.name())
                .orderByDesc(TicketEvent::getCreatedAt)
                .last("LIMIT 1"));
        return event == null ? null : event.getNote();
    }
}
