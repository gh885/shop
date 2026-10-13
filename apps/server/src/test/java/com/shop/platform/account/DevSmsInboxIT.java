package com.shop.platform.account;

import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.shop.platform.account.service.SmsCodeService;
import com.shop.platform.infra.security.JwtAuthFilter;
import com.shop.platform.infra.security.StaffAuthFilter;
import com.shop.platform.infra.security.SubaccountAuthFilter;
import com.shop.platform.infra.web.RequestBodySizeFilter;
import com.shop.platform.infra.web.RequestIdFilter;
import com.shop.platform.shop.infra.ShopMembershipFilter;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * 开发态虚拟短信收件箱集成验证（真 Redis + 真实过滤器链）：发码 → 匿名 GET 收件箱 → 拿到的就是能用的真码。
 * 钉死两件事：收件箱在真实 {@link JwtAuthFilter} 下匿名可达（skipPaths 接线没断）、
 * 文案与真实通道逐字一致且新在前。
 */
@SpringBootTest
class DevSmsInboxIT extends IntegrationTestSupport {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private SmsCodeService smsCodeService;

    @Autowired
    private StringRedisTemplate redis;

    private MockMvc mockMvc;

    /** 随机手机号与客户端 IP：不碰别的用例的键，收尾按键清单自清 */
    private final String phone =
            "139" + String.format("%08d", Math.floorMod(UUID.randomUUID().hashCode(), 100_000_000));

    private final String clientIp = "10.99." + Math.floorMod(UUID.randomUUID().hashCode(), 250) + ".7";

    @BeforeEach
    void setUpMvc() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(
                        context.getBean(RequestIdFilter.class),
                        context.getBean(RequestBodySizeFilter.class),
                        context.getBean(SubaccountAuthFilter.class),
                        context.getBean(StaffAuthFilter.class),
                        context.getBean(JwtAuthFilter.class),
                        context.getBean(ShopMembershipFilter.class))
                .build();
    }

    @AfterEach
    void cleanUpRedisKeys() {
        redis.delete(List.of(
                "sms:dev:inbox:" + phone,
                "sms:code:" + phone,
                "sms:rate:" + phone,
                "sms:attempt:" + phone,
                "sms:daily:" + phone,
                "sms:ip:" + clientIp,
                "sms:ip:phones:" + clientIp,
                "reset:code:" + phone,
                "reset:rate:" + phone,
                "reset:attempt:" + phone));
    }

    @Test
    void 发码后_匿名GET收件箱_拿到的码可直接通过校验() throws Exception {
        smsCodeService.sendCode(phone, clientIp);

        String body = mockMvc.perform(get("/dev/sms-inbox/{phone}", phone))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].text").isString())
                .andExpect(jsonPath("$[1]").doesNotExist())
                .andReturn()
                .getResponse()
                .getContentAsString();

        // 登录码文案 = 裸码：收件箱里的就是真码，回填后必须能通过真校验
        smsCodeService.verifyCode(phone, JsonPath.read(body, "$[0].text"));
    }

    @Test
    void 两条不同用途_新在前_且带用途前缀() throws Exception {
        smsCodeService.sendCode(phone, clientIp);
        smsCodeService.sendResetCode(phone, clientIp);

        mockMvc.perform(get("/dev/sms-inbox/{phone}", phone))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].text").value(startsWith("重置密码验证码: ")))
                .andExpect(jsonPath("$[1].text").value(matchesPattern("\\d{6}")));
    }

    @Test
    void 没发过码_空列表200() throws Exception {
        mockMvc.perform(get("/dev/sms-inbox/{phone}", phone))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }
}
