package com.shop.platform.infra.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
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

    @Autowired
    private SecretHasher secretHasher;

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

    // rotate：一次性消费 + 重放裁决
    /** 有效旧码：返回属主，且旧设备索引被清（后续登出/列表不再看到它） */
    @Test
    void rotate_有效旧码_返回属主并清旧设备索引() {
        store.issue(subject, device, token, new DeviceInfo("Chrome", "127.0.0.1", OffsetDateTime.now()));

        assertEquals(subject, store.rotate(token, device, "[IT]").subjectId());
        assertFalse(redis.hasKey("refresh:user:" + subject + ":" + device));
        assertTrue(store.listDevices(subject, null).isEmpty());

        store.revokeAll(subject);
    }

    /**
     * web/seller 共享 refresh cookie 的场景：token 登记在设备 A，刷新时提交设备 B。
     * 设备身份以 token 绑定为准——轮换返回 A 并只清 A 的索引，B 不落新条目，
     * 按绑定设备吊销能真杀会话。
     */
    @Test
    void rotate_提交异设备ID_沿用绑定设备不迁移会话() {
        String boundDevice = device;
        String foreignDevice = UUID.randomUUID().toString();
        store.issue(subject, boundDevice, token, new DeviceInfo("Chrome", "127.0.0.1", OffsetDateTime.now()));

        var rotated = store.rotate(token, foreignDevice, "[IT]");
        assertEquals(subject, rotated.subjectId());
        assertEquals(boundDevice, rotated.deviceId());
        // 绑定设备索引已清，外来设备 ID 从未登记
        assertFalse(redis.hasKey("refresh:user:" + subject + ":" + boundDevice));
        assertFalse(redis.hasKey("refresh:user:" + subject + ":" + foreignDevice));

        // 调用方按返回的 deviceId 重签发 → 双端交替刷新后设备列表仍只有一条
        String newToken = UUID.randomUUID().toString();
        store.issue(subject, rotated.deviceId(), newToken, new DeviceInfo("Chrome", "127.0.0.1", OffsetDateTime.now()));
        var again = store.rotate(newToken, foreignDevice, "[IT]");
        assertEquals(boundDevice, again.deviceId());
        store.issue(subject, again.deviceId(), UUID.randomUUID().toString());
        assertEquals(1, store.listDevices(subject, null).size());
        assertEquals(boundDevice, store.listDevices(subject, null).getFirst().deviceId());

        // 按绑定设备吊销即杀掉全部会话（外来 deviceId 无从躲藏）
        store.revokeDevice(subject, boundDevice);
        assertTrue(store.listDevices(subject, null).isEmpty());
        store.revokeAll(subject);
    }

    /** 无绑定的 token（历史数据）：回退用提交值清索引/登记，不报错 */
    @Test
    void rotate_无绑定设备_回退提交值() {
        // 只写权威键不写设备索引，模拟绑定丢失
        String orphanToken = UUID.randomUUID().toString();
        redis.opsForValue().set("refresh:" + secretHasher.hash(orphanToken), subject);

        var rotated = store.rotate(orphanToken, "submitted-device", "[IT]");
        assertEquals(subject, rotated.subjectId());
        assertEquals("submitted-device", rotated.deviceId());

        store.revokeAll(subject);
    }

    /** 宽限期内重复（多标签页并发启动）：静默拒绝 401，不判盗用、不吊销其他设备 */
    @Test
    void rotate_宽限期内重复_401不吊销其他设备() {
        String otherDevice = UUID.randomUUID().toString();
        store.issue(subject, device, token, new DeviceInfo("Chrome", "127.0.0.1", OffsetDateTime.now()));
        store.issue(subject, otherDevice, UUID.randomUUID().toString());
        assertEquals(subject, store.rotate(token, device, "[IT]").subjectId());

        BusinessException ex = assertThrows(BusinessException.class, () -> store.rotate(token, device, "[IT]"));
        assertEquals(401, ex.getHttpStatus());
        // 并发重复不是盗用：另一设备仍在线
        assertEquals(otherDevice, store.listDevices(subject, null).getFirst().deviceId());

        store.revokeAll(subject);
    }

    /** 超期旧码再现：判盗用，410 + 全端吊销 */
    @Test
    void rotate_超期旧码_410并全端吊销() {
        String otherDevice = UUID.randomUUID().toString();
        store.issue(subject, device, token, new DeviceInfo("Chrome", "127.0.0.1", OffsetDateTime.now()));
        store.issue(subject, otherDevice, UUID.randomUUID().toString());
        // 先消费掉旧码（权威键已删），再把消费痕迹的时间戳拨回纪元（超出 REPLAY_GRACE_MS 宽限期）
        assertEquals(subject, store.consume(token));
        redis.opsForValue().set("refresh:consumed:" + secretHasher.hash(token), subject + ":0");

        BusinessException ex = assertThrows(BusinessException.class, () -> store.rotate(token, device, "[IT]"));
        assertEquals(410, ex.getHttpStatus());
        assertTrue(store.listDevices(subject, null).isEmpty());
    }

    /** 从未见过的码：401，且不误判盗用 */
    @Test
    void rotate_未知码_401() {
        BusinessException ex = assertThrows(BusinessException.class, () -> store.rotate(token, device, "[IT]"));
        assertEquals(401, ex.getHttpStatus());
    }
}
