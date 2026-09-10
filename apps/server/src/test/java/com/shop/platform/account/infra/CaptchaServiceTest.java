package com.shop.platform.account.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

/**
 * 图形验证码生命周期单测（安全关键路径）：
 * gen 写摘要、verify 一次性消费（成功/失败都删）、大小写归一、缺参/过期/错值错误码。
 * Redis 全 mock；字节码只覆盖逻辑分支，图片渲染（render）不在此断言（纯视觉无逻辑）。
 */
@ExtendWith(MockitoExtension.class)
class CaptchaServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOps;

    private CaptchaService captchaService;

    @BeforeEach
    void setUp() {
        // opsForValue() 稳定返回同一 valueOps mock；缺参用例不触达 Redis，故用 lenient 免 strict 误报
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOps);
        captchaService = new CaptchaService(redisTemplate);
    }

    @Test
    void 生成_返回id与图_并落摘要() {
        CaptchaService.Captcha captcha = captchaService.generate();

        assertThat(captcha.captchaId()).isNotBlank();
        assertThat(captcha.image()).startsWith("data:image/png;base64,");

        // 落库用摘要（非明文），且带 5 分钟 TTL
        verify(valueOps).set(eq("captcha:" + captcha.captchaId()), anyString(), eq(Duration.ofMinutes(5)));
    }

    @Test
    void 校验_正确码_放行且删除token() {
        // 预置：服务端存的是 A1B2 的摘要
        when(valueOps.get("captcha:cid")).thenReturn(captchaService.hash("A1B2"));

        // 大小写不敏感：用户输入 a1b2 也应通过（verify 内部 toUpperCase）
        captchaService.verify("cid", "a1b2");

        verify(redisTemplate).delete("captcha:cid");
    }

    @Test
    void 校验_错误码_抛CAPTCHA_INVALID且删除token() {
        when(valueOps.get("captcha:cid")).thenReturn(captchaService.hash("A1B2"));

        assertThatThrownBy(() -> captchaService.verify("cid", "ZZZZ"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("图形验证码错误");

        // 输错也消费 token，防同一 token 反复猜
        verify(redisTemplate).delete("captcha:cid");
    }

    @Test
    void 校验_无token或已过期_抛CAPTCHA_EXPIRED() {
        when(valueOps.get("captcha:cid")).thenReturn(null);

        assertThatThrownBy(() -> captchaService.verify("cid", "A1B2"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("已过期");
    }

    @Test
    void 校验_缺参_抛CAPTCHA_REQUIRED() {
        assertThatThrownBy(() -> captchaService.verify("", "A1B2"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("请先完成");
        assertThatThrownBy(() -> captchaService.verify("cid", ""))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("请先完成");

        // 缺参直接拦截，不触达 Redis
        verify(valueOps, never()).get(anyString());
    }
}
