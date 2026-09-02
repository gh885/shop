package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.Money;
import com.shop.platform.order.controller.OrderItemResponse;
import com.shop.platform.product.controller.CategoryAttrResponse;
import com.shop.platform.product.model.AttrKind;
import com.shop.platform.product.model.CategoryAttrStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 响应体序列化契约（HTTP 出参形状的后端侧护栏）。
 *
 * <p>controller 层不再逐条断言 Money/枚举的形状（归这里统一钉死）：
 * 防止有人给枚举加 {@code @JsonValue}/{@code @JsonFormat}、或给 Money 加自定义 serializer，
 * 把前端 SDK 依赖的线上契约悄悄改掉。默认行为 = record 组件字段展开 + 枚举序列化为 name。
 */
class ResponseSerializationTest {

    private final ObjectMapper mapper = JsonMapper.builder().build();

    @Test
    void money_序列化为分与币种两个字段() throws Exception {
        JsonNode node = mapper.readTree(mapper.writeValueAsString(Money.cny(1000)));

        assertThat(node.get("amount").asLong()).isEqualTo(1000);
        assertThat(node.get("currency").asString()).isEqualTo("CNY");
    }

    @Test
    void 出参中的money字段_序列化为扁平对象() throws Exception {
        OrderItemResponse resp = new OrderItemResponse(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "测试手机",
                "p.png",
                Money.cny(1000),
                Money.cny(1200),
                2,
                Money.cny(2000));

        JsonNode node = mapper.readTree(mapper.writeValueAsString(resp));

        assertThat(node.path("price").path("amount").asLong()).isEqualTo(1000);
        assertThat(node.path("price").path("currency").asString()).isEqualTo("CNY");
        assertThat(node.path("amount").path("amount").asLong()).isEqualTo(2000);
    }

    @Test
    void 枚举_序列化为name而非数字或对象() throws Exception {
        CategoryAttrResponse resp = new CategoryAttrResponse(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "颜色",
                AttrKind.SPEC,
                false,
                true,
                0,
                CategoryAttrStatus.ENABLED,
                OffsetDateTime.now(),
                OffsetDateTime.now());

        JsonNode node = mapper.readTree(mapper.writeValueAsString(resp));

        assertThat(node.path("kind").asString()).isEqualTo("SPEC");
        assertThat(node.path("status").asString()).isEqualTo("ENABLED");
        assertThat(node.path("kind").isInt()).isFalse();
    }
}
