package com.shop.platform.rum.processor;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.rum.RumCounters;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 脱敏的判据：**该抹的抹掉，不该动的别动**。
 *
 * <p>两边都会出事，且都不会报错：漏抹 = 用户数据进了日志（这条链路里唯一的真事故）；
 * 多抹 = 排查时看到的现场是残的，而且残得看不出来（`/orders/12345` 变成 `/orders/$id` 那种）
 * ——后者不会被当成 bug，只会让某次排查花掉半天。
 *
 * <p>所以每个规则都有一个「像但不是」的反例：长数字串、非路径字段、正文里的普通中文。
 */
class PiiRedactionProcessorTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final PiiRedactionProcessor processor = new PiiRedactionProcessor(new RumCounters(registry));

    @Test
    void 手机号_抹成前3后4_与日志脱敏同一出口() {
        assertThat(redacted("{\"message\":\"订单 13800138000 不存在\"}")
                        .path("message")
                        .asString())
                .isEqualTo("订单 138****8000 不存在");
    }

    /** 用户粘贴进来的号常带分隔符，而它会原样被带回错误信息——那种形态也得认 */
    @Test
    void 手机号_带分隔符也认得() {
        assertThat(redacted("{\"message\":\"138 0013 8000 这个号停用了\"}")
                        .path("message")
                        .asString())
                .isEqualTo("138****8000 这个号停用了");
    }

    /** 16 位订单号中间那 11 位不该被当成手机号：`(?<!\d)` / `(?!\d)` 就是为它加的 */
    @Test
    void 长数字串_不误伤() {
        String message = "运单号 1380013800012345 查不到";

        assertThat(redacted("{\"message\":\"" + message + "\"}").path("message").asString())
                .isEqualTo(message);
        assertThat(count("phone")).isZero();
    }

    @Test
    void 邮箱_只掩local留域名() {
        assertThat(redacted("{\"message\":\"无法投递到 zhang.san@shop.example.com\"}")
                        .path("message")
                        .asString())
                .isEqualTo("无法投递到 z***@shop.example.com");
    }

    @Test
    void 身份证_掩中间8位() {
        assertThat(redacted("{\"detail\":\"证件 11010119900307123X 校验失败\"}")
                        .path("detail")
                        .asString())
                .isEqualTo("证件 110101********123X 校验失败");
    }

    /**
     * **本类最重要的一条**：`Bearer` 必须先于 `password/token` 那组被吃掉。
     *
     * <p>顺序反了的话，`Authorization: Bearer eyJhbGci…` 会被键值对规则匹配成
     * 「authorization = Bearer」，把真正的 token **原样留在后面**——一个看起来脱敏成功、
     * 其实一个字都没遮住的假象。这是「漏抹」里最难自查的一种。
     */
    @Test
    void Bearer排在键值对前面_不留半个token在正文里() {
        String masked = redacted("{\"message\":\"请求失败 Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def\"}")
                .path("message")
                .asString();

        assertThat(masked).doesNotContain("eyJhbGciOiJIUzI1NiJ9");
        assertThat(masked).isEqualTo("请求失败 Authorization=***");
    }

    @Test
    void 键值对形态的口令与密钥() {
        assertThat(redacted("{\"message\":\"password=hunter2 重试\"}")
                        .path("message")
                        .asString())
                .isEqualTo("password=*** 重试");
        assertThat(redacted("{\"message\":\"api_key: \\\"sk-live-0123456789\\\"\"}")
                        .path("message")
                        .asString())
                .isEqualTo("api_key=***");
    }

    /** 面包屑是随错误一起上报的现场，它里面那句同样是自由文本 */
    @Test
    void 数组里的字符串也扫_面包屑不止一层() {
        JsonNode event =
                redacted("{\"kind\":\"error\",\"breadcrumbs\":[{\"category\":\"api\",\"message\":\"13800138000\"}]}");

        assertThat(event.path("breadcrumbs").get(0).path("message").asString()).isEqualTo("138****8000");
    }

    /**
     * 数字型字段不动。手机号写成 JSON 数字能溜过这里，但溜不进日志——
     * {@code RumVocabulary.text} 对非字符串一律当不存在。抹裸数字的代价是行号、耗时、状态码全毁。
     */
    @Test
    void 非字符串字段原样不动() {
        JsonNode event = redacted("{\"status\":13800138000,\"value\":1200}");

        assertThat(event.path("status").asLong()).isEqualTo(13800138000L);
        assertThat(count("phone")).isZero();
    }

    /** 干净的正文一个字都不该改，也不该计任何数——这条在涨只说明调用方在漏数据，不是接收端有事 */
    @Test
    void 没有敏感内容时不做任何事也不计数() {
        String body = "{\"kind\":\"error\",\"message\":\"Cannot read properties of undefined\",\"route\":\"/cart\"}";

        assertThat(redacted(body).toString()).isEqualTo(mapper.readTree(body).toString());
        assertThat(registry.find("shop.rum.redacted").counters()).isEmpty();
    }

    /** 标签按规则名而不是字段名：字段名由客户端给（键名随便起），进标签就是无界基数 */
    @Test
    void 命中按规则名计数() {
        redacted("{\"message\":\"13800138000\",\"detail\":\"13800138001\"}");

        assertThat(count("phone")).isEqualTo(2.0);
        assertThat(registry.find("shop.rum.redacted").tags("rule", "email").counter())
                .isNull();
    }

    private JsonNode redacted(String body) {
        JsonNode event = mapper.readTree(body);
        return processor.process(event).orElseThrow();
    }

    private double count(String rule) {
        Counter counter = registry.find("shop.rum.redacted").tags("rule", rule).counter();
        return counter == null ? 0 : counter.count();
    }
}
