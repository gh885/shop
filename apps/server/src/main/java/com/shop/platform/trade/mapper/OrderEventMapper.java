package com.shop.platform.trade.mapper;

import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * {@code order_event} 的只追加写入。
 *
 * <p>每次状态变更一行。没有它，"这单为什么被关了"只能靠猜。
 *
 * <p>幂等键 {@code {order_kind}:{order_id}:{dimension}:{source}} 撞唯一索引就是重复消费，返回 false 让调用方跳过。
 */
@Mapper
public interface OrderEventMapper {

    /** 返回 false = 这个幂等键已经记过，本次是重复消费。 */
    @Insert(
            """
            INSERT INTO trade.order_event
                (event_key, order_kind, order_id, dimension, from_value, to_value, operator_type, operator_id, reason)
            VALUES (#{eventKey}, #{orderKind}, #{orderId}, #{dimension}, #{fromValue}, #{toValue},
                    #{operatorType}, #{operatorId}, #{reason})
            ON CONFLICT (event_key) DO NOTHING
            """)
    boolean append(
            @Param("eventKey") String eventKey,
            @Param("orderKind") String orderKind,
            @Param("orderId") UUID orderId,
            @Param("dimension") String dimension,
            @Param("fromValue") String fromValue,
            @Param("toValue") String toValue,
            @Param("operatorType") String operatorType,
            @Param("operatorId") UUID operatorId,
            @Param("reason") String reason);
}
