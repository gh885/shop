package com.shop.platform.rum.processor;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 路径归一化的判据：**query / hash 必须没、数字段必须塌成一个模板**。
 *
 * <p>这两条本来写在前端契约里（第 1 条取模板、第 5 条不采 query 与 hash），但契约是发送端的自觉，
 * 而这个端点匿名可达——所以服务端要能自己兑现它，不能假设对方做到了。
 *
 * <p>反例同样是重点：非路径字段不动、非数字段不动。改错一个字段就是数据丢失，
 * 而丢的那一半没人会报错。
 */
class RouteTemplateProcessorTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final RouteTemplateProcessor processor = new RouteTemplateProcessor();

    /** query 可能带 token 或个人信息——契约第 5 条点名的那两个东西 */
    @Test
    void query被砍掉() {
        assertThat(template("/orders/12345?token=abc&from=sms")).isEqualTo("/orders/$id");
    }

    @Test
    void hash被砍掉() {
        assertThat(template("/settings#section-2")).isEqualTo("/settings");
    }

    @Test
    void 纯数字段塌成id占位() {
        assertThat(template("/orders/12345/items/678")).isEqualTo("/orders/$id/items/$id");
    }

    /** 按整段判而不是子串替换：`/orders/$id345` 那种「看着像模板、基数照涨」的错，本类就是防它 */
    @Test
    void 数字不该被当成子串替换() {
        assertThat(template("/orders/12345")).isNotEqualTo("/orders/$id345");
    }

    /** 猜错比不猜更糟：服务端没有 params 表，`/user/settings` 里的段是路径名不是 id */
    @Test
    void 非数字段与已有的占位原样保留() {
        assertThat(template("/user/settings")).isEqualTo("/user/settings");
        assertThat(template("/orders/$orderId")).isEqualTo("/orders/$orderId");
    }

    @Test
    void 三个路径字段都归一化() {
        JsonNode event = process("{\"route\":\"/p/1\",\"endpoint\":\"/api/products/9\",\"to\":\"/cart?x=1\"}");

        assertThat(event.path("route").asString()).isEqualTo("/p/$id");
        assertThat(event.path("endpoint").asString()).isEqualTo("/api/products/$id");
        assertThat(event.path("to").asString()).isEqualTo("/cart");
    }

    /** 只认这三个字段：路径之外的值（错误栈、消息正文）里出现斜杠是常事，动它就是毁现场 */
    @Test
    void 路径之外的字符串一个都不碰() {
        String message = "at /src/app/cart.ts:42 失败";
        JsonNode event = process("{\"message\":\"" + message + "\",\"stack\":\"Error: x\\n  at /a/1.ts\"}");

        assertThat(event.path("message").asString()).isEqualTo(message);
        assertThat(event.path("stack").asString()).isEqualTo("Error: x\n  at /a/1.ts");
    }

    @Test
    void 非字符串的路径字段不动() {
        JsonNode event = process("{\"route\":12345}");

        assertThat(event.path("route").asInt()).isEqualTo(12345);
    }

    private JsonNode process(String body) {
        JsonNode event = mapper.readTree(body);
        return processor.process(event).orElseThrow();
    }

    private static String template(String raw) {
        return RouteTemplateProcessor.template(raw);
    }
}
