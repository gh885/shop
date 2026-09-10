package com.shop.platform.infra.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.testsupport.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * refresh token 存储的真 Redis 验证：签发走 MULTI/EXEC 五键原子落库、设备可枚举、消费一次性、吊销后零残留。
 * 单测里 Redis 全是 mock，SessionCallback 事务块与 hash putAll 只有真连接才验得到。主体 ID 随机，用例内自清。
 */
@SpringBootTest
class RefreshTokenStoreIT extends IntegrationTestSupport {

    @Autowired
    private RefreshTokenStore store;

    @Autowired
    private StringRedisTemplate redis;

    private final String subject = "it-" + UUID.randomUUID();

    private final String device = UUID.randomUUID().toString();

    private final String token = UUID.randomUUID().toString();

    @Test
    void 签发_设备可枚举_消费一次性_吊销后零残留() {
        store.issue(subject, device, token, new DeviceInfo("Chrome on Windows", "127.0.0.1", OffsetDateTime.now()));

        var devices = store.listDevices(subject, device);
        assertEquals(1, devices.size());
        assertEquals("Chrome on Windows", devices.getFirst().info().deviceName());
        assertEquals("127.0.0.1", devices.getFirst().info().ip());

        assertEquals(subject, store.consume(token));
        assertNull(store.consume(token)); // getAndDelete 一次性

        store.revokeDevice(subject, device);
        assertTrue(store.listDevices(subject, null).isEmpty());
        assertFalse(redis.hasKey("refresh:user:" + subject + ":" + device));
        assertFalse(redis.hasKey("refresh:meta:" + subject + ":" + device));
        assertEquals(0, redis.opsForSet().size("refresh:devices:" + subject));
    }

    /** 管理端简版签发不带 IP：hash 不收 null 值，ip 字段跳过而非整笔签发失败 */
    @Test
    void 管理端签发_无IP_照常可消费() {
        store.issue(subject, device, token);

        assertNull(store.listDevices(subject, null).getFirst().info().ip());
        assertEquals(subject, store.consume(token));

        store.revokeAll(subject);
        assertFalse(redis.hasKey("refresh:devices:" + subject));
    }
}
