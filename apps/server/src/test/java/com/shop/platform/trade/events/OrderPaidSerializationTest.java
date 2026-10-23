package com.shop.platform.trade.events;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * 事件必须过得了 JSON 这一关。
 *
 * <p>不是形式主义：{@code spring-modulith-events-jackson} 会把事件序列化进 {@code event_publication}，
 * 消费失败重投时再反序列化回来。这里过不去，事故现场是"重投时反序列化失败、事件永远卡在库里"，
 * 而不是编译错误——所以拿一个真实形状的事件钉住它。
 *
 * <p>{@link Money} 是 record，靠规范构造器反序列化，顺带验证了它的校验不会把正常金额挡掉。
 */
class OrderPaidSerializationTest {

    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void 带金额的事件能原样往返() {
        OrderPaid event = new OrderPaid(
                Ids.newId(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                Money.cny(12345),
                List.of(new OrderPaid.SellerOrderRef(
                        UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), Money.cny(10000), Money.cny(12345))),
                Instant.parse("2026-10-23T12:00:00Z"));

        String payload = json.writeValueAsString(event);
        OrderPaid restored = json.readValue(payload, OrderPaid.class);

        assertThat(restored).isEqualTo(event);
        assertThat(restored.paidAmount().currency()).isEqualTo("CNY");
    }
}
