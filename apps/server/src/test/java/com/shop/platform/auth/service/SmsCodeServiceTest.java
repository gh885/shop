package com.shop.platform.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.auth.infra.DevSmsChannel;
import com.shop.platform.auth.infra.SmsChannel;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.SecretHasher;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

/**
 * 短信验证码生命周期单测（安全关键路径）：
 * 多维限流（IP / 单 IP 去重号码 / 60s 冷却 / 日限）、HMAC 摘要存储、错满 5 次焚码、一次性消费。
 * Redis 全 mock；RateLimiter 是静态 Lua 调用，走 redis.execute 桩。
 */
@ExtendWith(MockitoExtension.class)
class SmsCodeServiceTest {

    private final String phone = "13800138000";

    private final String ip = "127.0.0.1";

    @Mock
    private StringRedisTemplate redis;

    @Mock
    private ValueOperations<String, String> valueOps;

    @Mock
    private SetOperations<String, String> setOps;

    @Mock
    private SmsChannel smsChannel;

    @Mock
    private ObjectProvider<DevSmsChannel> devProvider;

    private final SecretHasher secretHasher = new SecretHasher("a".repeat(32));

    private SmsCodeService service;

    @BeforeEach
    void setUp() {
        service = new SmsCodeService(redis, smsChannel, secretHasher, devProvider);
        lenient().when(redis.opsForValue()).thenReturn(valueOps);
        lenient().when(redis.opsForSet()).thenReturn(setOps);
        // RateLimiter 静态调用：默认窗口内计数为 1（不限流）
        lenient()
                .when(redis.execute(ArgumentMatchers.<RedisScript<Long>>any(), anyList(), anyString()))
                .thenReturn(1L);
        // 单 IP 去重号码集合：默认新增成功且规模 1
        lenient().when(setOps.add(anyString(), anyString())).thenReturn(1L);
        lenient().when(setOps.size(anyString())).thenReturn(1L);
        // 无 dev 固定码渠道
        lenient().when(devProvider.getIfAvailable()).thenReturn(null);
    }

    // ---- 发送 ----

    @Test
    void 发送验证码_存HMAC摘要_下发短信_给全新尝试机会() {
        service.sendCode(phone, ip);

        ArgumentCaptor<Duration> ttl = ArgumentCaptor.forClass(Duration.class);
        verify(valueOps).set(contains("sms:code:" + phone), anyString(), ttl.capture());
        assertThat(ttl.getValue()).isEqualTo(Duration.ofMinutes(5)); // 验证码 5 分钟有效

        // 存的是摘要不是明文：值必须是 64 位 hex
        ArgumentCaptor<String> stored = ArgumentCaptor.forClass(String.class);
        verify(valueOps).set(contains("sms:code:" + phone), stored.capture(), any(Duration.class));
        assertThat(stored.getValue()).hasSize(64).matches("[0-9a-f]+");

        // 重发即清旧尝试计数（UX-03）
        verify(redis).delete("sms:attempt:" + phone);

        ArgumentCaptor<String> sentCode = ArgumentCaptor.forClass(String.class);
        verify(smsChannel).sendCode(eq(phone), sentCode.capture());
        assertThat(sentCode.getValue()).matches("\\d{6}");
    }

    @Test
    void 发送验证码_60秒冷却中_429() {
        when(redis.hasKey("sms:rate:" + phone)).thenReturn(true);

        assertThatThrownBy(() -> service.sendCode(phone, ip)).isInstanceOfSatisfying(BusinessException.class, ex -> {
            assertThat(ex.getHttpStatus()).isEqualTo(429);
            assertThat(ex.getCode()).isEqualTo("SMS_RATE_LIMIT");
        });
        verify(smsChannel, never()).sendCode(anyString(), anyString());
    }

    @Test
    void IP每分钟超限_429() {
        when(redis.execute(ArgumentMatchers.<RedisScript<Long>>any(), anyList(), anyString()))
                .thenReturn(11L); // 上限 10

        assertThatThrownBy(() -> service.sendCode(phone, ip))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("发送过于频繁");
    }

    @Test
    void 单IP横扫大量新号码_429拦截() {
        when(setOps.add(anyString(), eq(phone))).thenReturn(1L); // 新号码
        when(setOps.size(anyString())).thenReturn(6L); // 上限 5

        assertThatThrownBy(() -> service.sendCode(phone, ip))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("发送过于频繁");
    }

    @Test
    void 单IP已见过的号码_不触发去重拦截() {
        // SADD 返回 0 = 老号码复发：跳过 size 检查（不误伤），交由 60s/日限兜底
        when(setOps.add(anyString(), eq(phone))).thenReturn(0L);

        service.sendCode(phone, ip);
        verify(smsChannel).sendCode(eq(phone), anyString());
    }

    @Test
    void 日限超20条_429专码() {
        when(redis.execute(ArgumentMatchers.<RedisScript<Long>>any(), anyList(), anyString()))
                .thenAnswer(inv -> {
                    List<?> keys = inv.getArgument(1);
                    String key = String.valueOf(keys.getFirst());
                    return key.startsWith("sms:daily:") ? 21L : 1L; // 日限键超限，其余正常
                });

        assertThatThrownBy(() -> service.sendCode(phone, ip))
                .isInstanceOfSatisfying(
                        BusinessException.class, ex -> assertThat(ex.getCode()).isEqualTo("SMS_DAILY_LIMIT"));
    }

    // ---- 校验 ----

    @Test
    void 校验通过_一次性消费() {
        String code = "123456";
        String codeKey = "sms:code:" + phone;
        when(valueOps.get(codeKey)).thenReturn(secretHasher.hash(phone + ":" + code));

        service.verifyCode(phone, code);

        verify(redis).delete(codeKey); // 码被消费
        verify(redis).delete("sms:attempt:" + phone);
    }

    @Test
    void 未发送或已过期_SMS_CODE_EXPIRED且不烧尝试计数() {
        when(valueOps.get("sms:code:" + phone)).thenReturn(null);

        assertThatThrownBy(() -> service.verifyCode(phone, "000000"))
                .isInstanceOfSatisfying(
                        BusinessException.class, ex -> assertThat(ex.getCode()).isEqualTo("SMS_CODE_EXPIRED"));

        verify(valueOps, never()).increment(anyString());
    }

    @Test
    void 错误一次_码保留供更正_计数加一() {
        String right = "123456";
        String wrong = "654321";
        when(valueOps.get("sms:code:" + phone)).thenReturn(secretHasher.hash(phone + ":" + right));
        when(valueOps.increment("sms:attempt:" + phone)).thenReturn(1L);

        assertThatThrownBy(() -> service.verifyCode(phone, wrong))
                .isInstanceOfSatisfying(
                        BusinessException.class, ex -> assertThat(ex.getCode()).isEqualTo("SMS_CODE_INVALID"));

        // 错误不焚码：正确码仍可用（手滑友好），但尝试计数带 TTL 落库
        verify(valueOps).get("sms:code:" + phone);
        verify(redis).expire("sms:attempt:" + phone, Duration.ofMinutes(5));
        verify(redis, never()).delete("sms:code:" + phone);
    }

    @Test
    void 错满五次_第5次即焚码() {
        when(valueOps.get("sms:code:" + phone)).thenReturn(secretHasher.hash(phone + ":123456"));
        when(valueOps.increment("sms:attempt:" + phone)).thenReturn(5L); // 第 5 次错误

        assertThatThrownBy(() -> service.verifyCode(phone, "000000")).isInstanceOf(BusinessException.class);

        verify(redis).delete("sms:code:" + phone);
    }

    @Test
    void 计数已达上限_直接作废不再比对() {
        when(valueOps.get("sms:code:" + phone)).thenReturn("some-hash");
        when(valueOps.get("sms:attempt:" + phone)).thenReturn("5");

        assertThatThrownBy(() -> service.verifyCode(phone, "999999"))
                .isInstanceOfSatisfying(
                        BusinessException.class, ex -> assertThat(ex.getCode()).isEqualTo("SMS_CODE_EXPIRED"));

        verify(redis).delete("sms:code:" + phone);
    }

    @Test
    void 开发环境固定码_绕过哈希比对但仍消费() {
        DevSmsChannel dev = mock(DevSmsChannel.class);
        when(devProvider.getIfAvailable()).thenReturn(dev);
        when(dev.getDevCode()).thenReturn("666666");
        when(valueOps.get("sms:code:" + phone)).thenReturn("whatever-hash");

        service.verifyCode(phone, "666666");

        // dev 码只清尝试计数，验证码本身保留至 TTL 自然过期
        verify(redis, never()).delete("sms:code:" + phone);
        verify(redis).delete("sms:attempt:" + phone);
        verify(valueOps, never()).increment(anyString());
    }
}
