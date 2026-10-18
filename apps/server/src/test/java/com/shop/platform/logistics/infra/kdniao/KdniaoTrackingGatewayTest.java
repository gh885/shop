package com.shop.platform.logistics.infra.kdniao;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.shop.platform.infra.observability.BizEvent;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 快递鸟适配器失败路径：返回空列表不能静默，统一失败事件要带原因与承运商。 */
class KdniaoTrackingGatewayTest {

    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

    private final KdniaoProperties props = new KdniaoProperties();

    private MockRestServiceServer server;

    private KdniaoTrackingGateway gateway;

    private Logger logger;

    @BeforeEach
    void setUp() {
        props.setEnabled(true);
        props.setEbusinessId("eb-1");
        props.setAppKey("app-key");
        props.setEndpoint("http://kdniao.test/query");

        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        gateway = new KdniaoTrackingGateway(props, builder.build(), new ObjectMapper());

        logs.start();
        logger = (Logger) LoggerFactory.getLogger(BizEvent.class);
        logger.addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(logs);
    }

    @Test
    void 渠道返回失败时返回空列表并打失败事件() {
        server.expect(requestTo(props.getEndpoint()))
                .andRespond(withSuccess("{\"Success\":false,\"Reason\":\"参数错误\"}", MediaType.APPLICATION_JSON));

        assertThat(gateway.fetchTracker("SF", "SF123")).isEmpty();
        server.verify();

        ILoggingEvent event = onlyEvent();
        assertThat(event.getMDCPropertyMap())
                .containsEntry("event", "logistics.tracking_query.failed")
                .containsEntry("reason", "carrier_rejected")
                .containsEntry("carrier_code", "SF");
        assertThat(event.getFormattedMessage()).contains("error.message=参数错误");
    }

    @Test
    void 网络异常时打失败事件并继续抛出给轮询重试() {
        server.expect(requestTo(props.getEndpoint())).andRespond(withServerError());

        assertThatThrownBy(() -> gateway.fetchTracker("ZTO", "ZTO123")).isInstanceOf(RuntimeException.class);
        server.verify();

        ILoggingEvent event = onlyEvent();
        assertThat(event.getMDCPropertyMap())
                .containsEntry("event", "logistics.tracking_query.failed")
                .containsEntry("reason", "gateway_error")
                .containsEntry("carrier_code", "ZTO");
        assertThat(event.getThrowableProxy()).isNotNull();
    }

    @Test
    void 运单号含引号_请求报文仍是合法JSON_运单号原样往返() {
        server.expect(requestTo(props.getEndpoint()))
                .andExpect(request -> {
                    // form 编码整体解码后取出 RequestData 的值：拼歪的报文在这里解析不出来
                    // （RequestMatcher 的形参是 ClientHttpRequest，落到 Mock 实现上才有 body 可看）
                    MockClientHttpRequest mock = (MockClientHttpRequest) request;
                    String body = URLDecoder.decode(mock.getBodyAsString(), StandardCharsets.UTF_8);
                    Matcher m = Pattern.compile("RequestData=([^&]*)").matcher(body);
                    assertThat(m.find()).isTrue();
                    JsonNode root = new ObjectMapper().readTree(m.group(1));
                    assertThat(root.path("LogisticCode").asString("")).isEqualTo("SF\"QUOTE\"123");
                })
                .andRespond(withSuccess("{\"Success\":false}", MediaType.APPLICATION_JSON));

        assertThat(gateway.fetchTracker("SF", "SF\"QUOTE\"123")).isEmpty();
        server.verify();
    }

    private ILoggingEvent onlyEvent() {
        assertThat(logs.list).hasSize(1);
        return logs.list.getFirst();
    }
}
