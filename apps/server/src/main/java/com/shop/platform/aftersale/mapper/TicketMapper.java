package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.aftersale.model.TicketStatus;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

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
}
