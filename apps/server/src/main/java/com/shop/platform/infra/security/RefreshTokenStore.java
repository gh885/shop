package com.shop.platform.infra.security;

import com.shop.platform.common.BusinessException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisOperations;
import org.springframework.data.redis.core.SessionCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Opaque refresh token 的 Redis 存储与轮换机制：签发（摘要落库 + 设备索引）、单次消费（getAndDelete = rotation）、
 * 重放裁决、设备级/全量吊销。token 只存 HMAC 摘要不落明文（摘要算法见 {@link SecretHasher}），
 * 调用方一律传原文，哈希细节收敛在本类内部。
 *
 * <p>存储结构：
 * <pre>
 * refresh:&lt;hmac&gt;                       → subjectId              （权威键，TTL 即有效期）
 * refresh:user:&lt;subjectId&gt;:&lt;deviceId&gt; → hmac                   （设备 → token 索引，登出用）
 * refresh:devices:&lt;subjectId&gt;          → Set&lt;deviceId&gt;          （设备集合，全量吊销枚举用）
 * refresh:consumed:&lt;hmac&gt;              → subjectId:timestamp    （重放裁决痕迹，短 TTL）
 * </pre>
 *
 * <p>auth（用户）与 admin（员工）共用同一套机制，subject 由调用方决定（userId / staffId），本类不感知业务实体。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class RefreshTokenStore {

    private static final String KEY_REFRESH = "refresh:"; // refresh:<hmac> → subjectId
    private static final String KEY_USER_DEVICE = "refresh:user:"; // refresh:user:<subjectId>:<deviceId> → hmac
    private static final String KEY_DEVICES = "refresh:devices:"; // refresh:devices:<subjectId> → Set<deviceId>
    private static final String KEY_CONSUMED = "refresh:consumed:"; // refresh:consumed:<hmac> → subjectId:ts
    private static final String KEY_DEVICE_META =
            "refresh:meta:"; // refresh:meta:<subjectId>:<deviceId> → hash{name,ip,lastLoginAt}
    private static final long REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000L; // 7 天

    /**
     * 并发重复宽限期：多标签页同时启动会拿同一个旧 refresh 并发请求，后到者若被当成攻击
     * 会把用户全端误杀。窗口内的重复按良性竞争处理，超出仍出现旧码才判定盗用。
     */
    private static final long REPLAY_GRACE_MS = 15_000;

    private final StringRedisTemplate redis;
    private final SecretHasher secretHasher;

    /** 重放裁决结果：consumed = 见过消费痕迹；withinGrace = 是否仍在并发宽限期内；subjectId = 属主 */
    public record ReplayCheck(boolean consumed, boolean withinGrace, String subjectId) {}

    /** 签发：无设备元数据的简版（admin 端暂不采集 UA/IP）；委托完整版并生成默认 DeviceInfo */
    public void issue(String subjectId, String deviceId, String rawToken) {
        issue(subjectId, deviceId, rawToken, new DeviceInfo("管理端", null, OffsetDateTime.now()));
    }

    /** 签发：存 HMAC 摘要（不落明文）+ 设备索引 + 设备集合（供全量吊销枚举）+ 设备元数据 */
    public void issue(String subjectId, String deviceId, String rawToken, DeviceInfo deviceInfo) {
        String hash = secretHasher.hash(rawToken);
        Duration ttl = Duration.ofMillis(REFRESH_TTL_MS);
        String metaKey = KEY_DEVICE_META + subjectId + ":" + deviceId;
        // 设备元数据：设备名（UA 解析）、登录 IP、最近活跃时间，随签发写入（ip 可空，Redis hash 不收 null 值）
        Map<String, String> meta = new HashMap<>();
        meta.put("name", deviceInfo.deviceName());
        if (deviceInfo.ip() != null) meta.put("ip", deviceInfo.ip());
        meta.put("lastLoginAt", deviceInfo.lastLoginAt().toString());
        // MULTI/EXEC 原子提交：五个键全落或全不落。权威键 refresh:<hash> 放最后——即便 EXEC 前中断，
        // 留下的是「有索引没 token」（登出/列表按空值跳过即无害），而不是「有 token 没索引」的吊销不掉的会话。
        atomically(tx -> {
            tx.opsForValue().set(KEY_USER_DEVICE + subjectId + ":" + deviceId, hash, ttl);
            // 设备集合随签发滑动续期。单个 refresh:<hash> 的 TTL 才是权威过期时间；
            // 集合里滞留的陈旧 deviceId 在吊销/登出时按空值跳过即可
            tx.opsForSet().add(KEY_DEVICES + subjectId, deviceId);
            tx.expire(KEY_DEVICES + subjectId, ttl);
            tx.opsForHash().putAll(metaKey, meta);
            tx.expire(metaKey, ttl);
            tx.opsForValue().set(KEY_REFRESH + hash, subjectId, ttl);
        });
    }

    /** 消费旧 token（getAndDelete = 一次性）；返回 null 表示无效或已被消费 */
    public String consume(String rawToken) {
        return redis.opsForValue().getAndDelete(KEY_REFRESH + secretHasher.hash(rawToken));
    }

    /**
     * 刷新轮换的统一入口（C 端用户与平台员工共用）：一次性消费旧码 → 重放裁决 → 标记已消费 → 清旧设备索引。
     *
     * <p>重放裁决的两个失败面（宽限期内并发竞争静默拒绝 / 超期盗用全端吊销）在此一处裁决，
     * 调用方拿到 subjectId 后只需查实体、签发新 token。
     *
     * @param logTag 日志前缀（[AUTH] / [STAFF]），供按端检索
     * @return token 属主 subjectId（调用方决定它是 userId 还是 staffId）
     */
    public String rotate(String rawToken, String deviceId, String logTag) {
        // 1. 消费旧 Refresh Token（getAndDelete = 一次性；哈希化收敛在存储层内部）
        String subjectId = consume(rawToken);
        if (subjectId == null) {
            // 2. 重放裁决：宽限期内算多标签页并发重复（静默拒绝），超期才算盗用（全端吊销）
            ReplayCheck replay = checkReplay(rawToken);
            if (replay.consumed()) {
                if (!replay.withinGrace()) {
                    log.warn("{} Refresh Token 重放攻击已检测, subjectId={}", logTag, replay.subjectId());
                    revokeAll(replay.subjectId());
                    throw new BusinessException(410, "REFRESH_TOKEN_REUSED", "Refresh Token 已被重复使用，所有设备已下线");
                }
                log.info("{} Refresh 并发竞争（宽限期内）, subjectId={}", logTag, replay.subjectId());
                throw BusinessException.unauthorized("登录状态正在其他页面刷新，请稍后重试");
            }
            throw BusinessException.unauthorized("Refresh Token 无效或已过期");
        }

        // 3. 标记已消费（带时间戳，供重放裁决区分并发竞争与盗用）
        markConsumed(rawToken, subjectId);
        // 4. 清除旧设备索引
        revokeDevice(subjectId, deviceId);
        return subjectId;
    }

    /**
     * 标记已消费（短 TTL 窗口）。值带消费时间戳：重放裁决必须区分
     * 「几秒前的并发重复」（良性）与「很久之后的旧码再现」（盗用），二者只差一个时间。
     */
    public void markConsumed(String rawToken, String subjectId) {
        String value = subjectId + ":" + System.currentTimeMillis();
        redis.opsForValue().set(KEY_CONSUMED + secretHasher.hash(rawToken), value, Duration.ofMinutes(30));
    }

    /**
     * 消费失败后的重放裁决。宽限期内视为并发重复（调用方静默拒绝即可），超出宽限期判盗用
     * （调用方应全端吊销 + 告警）。
     */
    public ReplayCheck checkReplay(String rawToken) {
        String raw = redis.opsForValue().get(KEY_CONSUMED + secretHasher.hash(rawToken));
        if (raw == null) {
            return new ReplayCheck(false, false, null);
        }
        int sep = raw.lastIndexOf(':');
        String subjectId = raw.substring(0, sep);
        long consumedAt = Long.parseLong(raw.substring(sep + 1));
        boolean withinGrace = System.currentTimeMillis() - consumedAt < REPLAY_GRACE_MS;
        return new ReplayCheck(true, withinGrace, subjectId);
    }

    /** 删除指定设备的 refresh token（登出 / 刷新前清理旧设备索引），并从设备集合移除 */
    public void revokeDevice(String subjectId, String deviceId) {
        String idxKey = KEY_USER_DEVICE + subjectId + ":" + deviceId;
        // 索引先 GETDEL 拿到 hash（MULTI 内读不到值），余下三个删除原子提交
        String storedHash = redis.opsForValue().getAndDelete(idxKey);
        atomically(tx -> {
            if (storedHash != null) {
                tx.delete(KEY_REFRESH + storedHash);
            }
            tx.opsForSet().remove(KEY_DEVICES + subjectId, deviceId);
            tx.delete(KEY_DEVICE_META + subjectId + ":" + deviceId);
        });
    }

    /** MULTI … EXEC 事务块：块内命令排队到 EXEC 一次性原子执行（Redis 事务无回滚，靠写入顺序保证半途失败无害） */
    private void atomically(Consumer<RedisOperations<String, String>> commands) {
        redis.execute(new SessionCallback<List<Object>>() {
            @Override
            @SuppressWarnings("unchecked")
            public <K, V> List<Object> execute(RedisOperations<K, V> ops) {
                RedisOperations<String, String> tx = (RedisOperations<String, String>) ops;
                tx.multi();
                commands.accept(tx);
                return tx.exec();
            }
        });
    }

    /**
     * 吊销某主体所有设备的 refresh token（改密 / 重放攻击兜底）。
     *
     * <p>经设备集合枚举而非 KEYS 通配扫描——KEYS 是 O(全键空间) 的阻塞命令，生产实例上会卡住所有请求；
     * 单主体的设备集合是个位数成员的小 Set，SMEMBERS 成本可忽略。
     */
    public void revokeAll(String subjectId) {
        String devicesKey = KEY_DEVICES + subjectId;
        Set<String> devices = redis.opsForSet().members(devicesKey);
        if (devices != null && !devices.isEmpty()) {
            for (String device : devices) {
                revokeDevice(subjectId, device);
            }
        }
        redis.delete(devicesKey);
    }

    /**
     * 枚举当前有效（仍在会话）的设备列表，含元数据与最后活跃时间，供安全设置页展示。
     * 仅返回仍有有效 refresh token 索引的设备；stale deviceId（token 已过期但集合残留）被跳过。
     *
     * @param currentDeviceId 前端当前设备（用于标记「本机」，可为 null）
     */
    public List<DeviceEntry> listDevices(String subjectId, String currentDeviceId) {
        Set<String> devices = redis.opsForSet().members(KEY_DEVICES + subjectId);
        if (devices == null || devices.isEmpty()) {
            return List.of();
        }
        List<DeviceEntry> result = new ArrayList<>();
        for (String deviceId : devices) {
            // 仅保留仍有有效 revoke 索引的设备（UUID 随机生成，服务端无脚本筛选；按 deviceId 精确匹配）
            if (redis.opsForValue().get(KEY_USER_DEVICE + subjectId + ":" + deviceId) == null) {
                continue;
            }
            result.add(new DeviceEntry(deviceId, readDeviceInfo(subjectId, deviceId)));
        }
        return result;
    }

    /** 读取某设备的元数据：name/ip/lastLoginAt；缺失（无 meta）时回退当前设备名"未知设备" */
    private DeviceInfo readDeviceInfo(String subjectId, String deviceId) {
        var hashOps = redis.opsForHash();
        String name = (String) hashOps.get(KEY_DEVICE_META + subjectId + ":" + deviceId, "name");
        String ip = (String) hashOps.get(KEY_DEVICE_META + subjectId + ":" + deviceId, "ip");
        String ts = (String) hashOps.get(KEY_DEVICE_META + subjectId + ":" + deviceId, "lastLoginAt");
        if (name == null) name = "未知设备";
        OffsetDateTime last = ts != null ? OffsetDateTime.parse(ts) : null;
        return new DeviceInfo(name, ip, last);
    }

    /** 设备列表条目：deviceId + 解析后的元数据 */
    public record DeviceEntry(String deviceId, DeviceInfo info) {}
}
