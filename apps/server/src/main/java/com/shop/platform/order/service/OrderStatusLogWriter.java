package com.shop.platform.order.service;

import com.shop.platform.order.mapper.OrderStatusLog;
import com.shop.platform.order.mapper.OrderStatusLogMapper;
import com.shop.platform.order.model.OrderAction;
import com.shop.platform.order.model.OrderActor;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 订单状态审计写入 —— 所有状态变更（主状态机 / 售后状态机 / 自动处理）成功后的固定收尾。
 *
 * <p>收成一个组件让各转移点共用，是为了约束「每个转移都留痕」：漏记一次历史回放就断链。
 * 调用点须在同事务内调用，且只在条件更新真的改到行之后调用——从未生效的转移不该出现在账本里。
 */
@Component
@RequiredArgsConstructor
public class OrderStatusLogWriter {

    private final OrderStatusLogMapper mapper;

    /**
     * 记一条状态转移。
     *
     * @param from 转移前状态，首动作（下单落库）传 null
     * @param to 转移后状态；泛型钉住 from/to 同属一条状态机，杜绝把主状态与售后状态混写一行
     * @param reason 取消原因 / 售后理由等，无则 null
     */
    public <S extends Enum<S>> void record(
            UUID orderId, S from, S to, OrderAction action, OrderActor actor, String reason) {
        mapper.insert(OrderStatusLog.builder()
                .orderId(orderId)
                .fromStatus(from == null ? null : from.name())
                .toStatus(to.name())
                .action(action.name())
                .actorType(actor.name())
                .reason(reason)
                .build());
    }
}
