package com.shop.platform.infra.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * 客户端 IP 提取单测。安全默认值：直连部署只信 TCP 对端地址，
 * 盲信 X-Forwarded-For 首段等于让攻击者每次请求换一个 IP，IP 维度限流整体失效。
 */
class ClientIpTest {

    @Test
    void 默认不信任XFF_取TCP对端地址() {
        ClientIp clientIp = new ClientIp(new WebProperties(false, List.of()));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("203.0.113.9");
        request.addHeader("X-Forwarded-For", "1.2.3.4, 10.0.0.1");

        // 攻击者自报的 XFF 头被无视
        assertThat(clientIp.of(request)).isEqualTo("203.0.113.9");
    }

    @Test
    void 可信反代模式_取XFF首段并trim() {
        ClientIp clientIp = new ClientIp(new WebProperties(true, List.of()));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.1"); // 反代地址
        request.addHeader("X-Forwarded-For", " 198.51.100.7 , 10.0.0.2");

        assertThat(clientIp.of(request)).isEqualTo("198.51.100.7");
    }

    @Test
    void 可信反代但XFF缺失或unknown_回退对端地址() {
        ClientIp clientIp = new ClientIp(new WebProperties(true, List.of()));

        MockHttpServletRequest noHeader = new MockHttpServletRequest();
        noHeader.setRemoteAddr("192.0.2.5");
        assertThat(clientIp.of(noHeader)).isEqualTo("192.0.2.5");

        MockHttpServletRequest unknown = new MockHttpServletRequest();
        unknown.setRemoteAddr("192.0.2.6");
        unknown.addHeader("X-Forwarded-For", "unknown");
        assertThat(clientIp.of(unknown)).isEqualTo("192.0.2.6");
    }
}
