package com.shop.platform.logistics.infra.kdniao;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.logistics.service.CarrierPush;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

/**
 * 推送接收 = 验签 + 报文解析：这是真实快递鸟格式进入系统的唯一入口，此前只有"验签"被单独钉过
 * （{@code KdniaoSignTest}），解析路径没有单测、IT 里的接收端又是 mock。这里按快递鸟真实报文形状
 * （LogisticCode + State + Traces[{AcceptTime, AcceptStation, Location}]）逐条覆盖。
 */
class KdniaoPushReceiverTest {

    private static final String APP_KEY = "test-app-key";

    private final KdniaoProperties props = new KdniaoProperties();

    private final KdniaoPushReceiver receiver = new KdniaoPushReceiver(props, new ObjectMapper());

    @BeforeEach
    void setUp() {
        props.setAppKey(APP_KEY);
    }

    /** 一条真实形状的推送原文：外层 RequestData 是对方签名过的字符串，内层是 State + Traces */
    private static String requestData() {
        return """
               {"LogisticCode":"SF1234567890","ShipperCode":"SF","State":"3","Traces":[
                 {"AcceptTime":"2026-10-18 10:00:00","AcceptStation":"快件已签收，签收人：本人，派件员：王师傅 138****1234","Location":"上海"},
                 {"AcceptTime":"2026-10-18 08:30:00","AcceptStation":"快件正在派送中（派件员：王师傅 138****1234）","Location":"上海"}
               ]}
               """;
    }

    @Test
    void 合法推送_解析出运单号与全部节点_时间按东八区解析() {
        String data = requestData();
        CarrierPush push = receiver.receive("SF", data, KdniaoSign.sign(data, APP_KEY));

        assertThat(push.trackingNo()).isEqualTo("SF1234567890");
        assertThat(push.nodes()).hasSize(2);
        assertThat(push.nodes().getFirst().description()).contains("已签收");
        // "2026-10-18 10:00:00" 按 +08:00 解析：与 KdniaoTraces 的口径逐点对上
        assertThat(push.nodes().getFirst().occurredAt().toInstant())
                .isEqualTo(OffsetDateTime.parse("2026-10-18T10:00:00+08:00").toInstant());
    }

    @Test
    void 报文不是合法JSON_400说明责任在报文() {
        String data = "{oops";
        assertThatThrownBy(() -> receiver.receive("SF", data, KdniaoSign.sign(data, APP_KEY)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(400);
    }

    @Test
    void 报文缺运单号_400() {
        String data = "{\"State\":\"3\"}";
        assertThatThrownBy(() -> receiver.receive("SF", data, KdniaoSign.sign(data, APP_KEY)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(400);
    }

    @Test
    void 未配密钥_一律403_没验签就不解析() {
        props.setAppKey(null);
        assertThatThrownBy(() -> receiver.receive("SF", "{}", "sig"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(403);
    }

    @Test
    void 签名不合法_403_不解析报文() {
        assertThatThrownBy(() -> receiver.receive("SF", requestData(), "bad-sign"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(403);
    }
}
