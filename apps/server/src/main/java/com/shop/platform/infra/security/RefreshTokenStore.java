package com.shop.platform.infra.security;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisOperations;
import org.springframework.data.redis.core.SessionCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

/**
 * Opaque refresh token 的 Redis 存储与轮换机制：签发（摘要落库 + 设备索引）、单次消费（rotation）、
 * 重放裁决、设备级/全量吊销。token 只存 HMAC 摘要不落明文（摘要算法见 {@link SecretHasher}），
 * 调用方一律传原文，哈希细节收敛在本类内部。subject 对本类不透明——买家/卖家/员工三个身份域共用，
 * 各域的刷新端点自己认领 subjectId 指的是谁。
 *
 * <p>存储结构：
 * <pre>
 * refresh:&lt;hmac&gt;                       → subjectId              （权威键，TTL 即有效期）
 * refresh:user:&lt;subjectId&gt;:&lt;deviceId&gt; → hmac                   （设备 → token 索引，登出用）
 * refresh:devices:&lt;subjectId&gt;          → Set&lt;deviceId&gt;          （设备集合，全量吊销枚举用）
 * refresh:meta:&lt;subjectId&gt;:&lt;deviceId&gt; → hash{name,ip,lastLoginAt} （设备元数据，列表展示用）
 * refresh:consumed:&lt;hmac&gt;              → subjectId:timestamp    （重放裁决痕迹，短 TTL）
 * </pre>
 */
@Component
public class RefreshTokenStore {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenStore.class);

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private static final String KEY_REFRESH = "refresh:"; // refresh:<hmac> → subjectId
    private static final String KEY_USER_DEVICE = "refresh:user:"; // refresh:user:<subjectId>:<deviceId> → hmac
    private static final String KEY_DEVICES = "refresh:devices:"; // refresh:devices:<subjectId> → Set<deviceId>
    private static final String KEY_CONSUMED = "refresh:consumed:"; // refresh:consumed:<hmac> → subjectId:ts
    private static final String KEY_DEVICE_META = "refresh:meta:"; // refresh:meta:<subjectId>:<deviceId> → hash
    private static final long REFRESH_TTL_SECONDS = Duration.ofDays(7).toSeconds();

    /**
     * 并发重复宽限期：多标签页同时启动会拿同一个旧 refresh 并发请求，后到者若被当成攻击
     * 会把用户全端误杀。窗口内的重复按良性竞争处理，超出仍出现旧码才判定盗用。
     */
    private static final long REPLAY_GRACE_MS = 15_000;

    private static final Duration CONSUMED_TTL = Duration.ofMinutes(30);

    /**
     * 无设备标识时的归桶：web 端没有 deviceId 容器（refresh 只带 cookie），这类会话统一落这一个桶。
     * 口径住在本类，因为只有本类知道 deviceId 是键的一部分——各端 controller 各写一份字面量时，
     * 同一次刷新可能归到两个不同的桶。
     */
    public static final String DEFAULT_DEVICE_ID = "default";

    /**
     * 签发的索引换血（重登同设备不产孤儿 token）：GETDEL 旧索引拿到旧摘要，删掉它的权威键，再写入新摘要。
     * 必须原子——分离写的话进程在两步之间死掉，留下「有索引没 token」或「有 token 没索引」，后者是
     * 吊销不掉的会话。没有这一步，同一设备重复登录会在 Redis 里积累仍有效的旧 refresh token：
     * 登出/改密/重放兜底都只按索引吊销最新的那个，旧的全数存活到 TTL——「改密后全端下线」就不成立。
     */
    private static final DefaultRedisScript<String> SWAP_DEVICE_INDEX = new DefaultRedisScript<>(
            """
            local old = redis.call('GETDEL', KEYS[1])
            if old then
                redis.call('DEL', KEYS[2] .. old)
            end
            redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
            return 'OK'
            """,
            String.class);

    /**
     * 一次性消费 + 就地标记已消费（轮换的第一步）。消费与标记必须在同一个 Lua 里：
     * 分开写时，并发重复请求会落在「旧键已删、consumed 未写」的窗口里拿到「无效」的硬 401，
     * 而不是宽限期那句「正在其他页面刷新」——良性多标签页场景被误判成掉线。
     */
    private static final DefaultRedisScript<String> CONSUME_AND_MARK = new DefaultRedisScript<>(
            """
            local v = redis.call('GETDEL', KEYS[1])
            if v then
                redis.call('SET', KEYS[2], v .. ':' .. ARGV[1], 'EX', ARGV[2])
            end
            return v
            """,
            String.class);

    private final StringRedisTemplate redis;
    private final SecretHasher secretHasher;
    private final Clock clock;

    // 两个构造器并存时 Spring 不会自己挑，必须指明用哪个——不标的话启动直接
    // "No default constructor found"，所有 @SpringBootTest 一起挂
    @Autowired
    public RefreshTokenStore(StringRedisTemplate redis, SecretHasher secretHasher) {
        this(redis, secretHasher, Clock.systemDefaultZone());
    }

    /** 内部时间 seam：生产走系统时钟，测试可推进时间而不改 Redis 的私有键。 */
    RefreshTokenStore(StringRedisTemplate redis, SecretHasher secretHasher, Clock clock) {
        this.redis = redis;
        this.secretHasher = secretHasher;
        this.clock = clock;
    }

    /** 重放裁决结果：consumed = 见过消费痕迹；withinGrace = 是否仍在并发宽限期内；subjectId = 属主 */
    private record ReplayCheck(boolean consumed, boolean withinGrace, String subjectId) {}

    /** 轮换结果：属主 + 该会话绑定的设备 ID（调用方签发新 token 时必须沿用，见 {@link #rotate}） */
    public record Rotation(String subjectId, String deviceId) {}

    /**
     * 生成不透明 refresh token：高熵 32 字节 hex，前缀 rt:。生成住在存储类而不是各身份域——
     * 「刷新凭证长什么样」是会话存储的口径，三个身份域不该各写一份。
     */
    public static String newToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return "rt:" + HexFormat.of().formatHex(bytes);
    }

    /** 签发：无设备元数据的简版；委托完整版并生成占位设备名 */
    public void issue(String subjectId, String deviceId, String rawToken) {
        issue(subjectId, deviceId, rawToken, new DeviceInfo("未知设备", null, java.time.OffsetDateTime.now(clock)));
    }

    /**
     * 签发：存 HMAC 摘要（不落明文）+ 设备索引 + 设备集合（供全量吊销枚举）+ 设备元数据。
     * 设备索引先原子换血（见 {@link #SWAP_DEVICE_INDEX}），再 MULTI 落其余三键；
     * 权威键 refresh:&lt;hash&gt; 放最后——即便 EXEC 前中断，留下的是「有索引没 token」
     * （登出/列表按空值跳过即无害），而不是「有 token 没索引」的吊销不掉的会话。
     */
    public void issue(String subjectId, String deviceId, String rawToken, DeviceInfo deviceInfo) {
        String effectiveDevice = orDefault(deviceId);
        String hash = secretHasher.hash(rawToken);
        Duration ttl = Duration.ofSeconds(REFRESH_TTL_SECONDS);
        redis.execute(
                SWAP_DEVICE_INDEX,
                List.of(KEY_USER_DEVICE + subjectId + ":" + effectiveDevice, KEY_REFRESH),
                hash,
                String.valueOf(REFRESH_TTL_SECONDS));

        String metaKey = KEY_DEVICE_META + subjectId + ":" + effectiveDevice;
        // 设备元数据：设备名（UA 解析）、登录 IP、最近活跃时间，随签发写入（ip 可空，Redis hash 不收 null 值）
        Map<String, String> meta = new HashMap<>();
        meta.put("name", deviceInfo.deviceName());
        if (deviceInfo.ip() != null) {
            meta.put("ip", deviceInfo.ip());
        }
        meta.put("lastLoginAt", deviceInfo.lastLoginAt().toString());
        // 设备集合随签发滑动续期。单个 refresh:<hash> 的 TTL 才是权威过期时间；
        // 集合里滞留的陈旧 deviceId 在吊销/登出时按空值跳过即可
        atomically(tx -> {
            tx.opsForSet().add(KEY_DEVICES + subjectId, effectiveDevice);
            tx.expire(KEY_DEVICES + subjectId, ttl);
            tx.opsForHash().putAll(metaKey, meta);
            tx.expire(metaKey, ttl);
            tx.opsForValue().set(KEY_REFRESH + hash, subjectId, ttl);
        });
    }

    /**
     * 刷新轮换的统一入口（三个身份域共用）：一次性消费旧码（含原子标记）→ 重放裁决 → 反查绑定设备。
     * 调用方拿到 {@link Rotation} 后查实体、按 {@code rotation.deviceId()} 签发新 token——
     * 新签发会原子换掉设备索引指向的旧摘要，这里无需再清。
     *
     * <p><b>设备身份以 token 绑定的设备为准，不信任本次提交的新 deviceId</b>：同一 token 可能被
     * 多个前端各自提交不同的 deviceId，若按提交值重新登记，会话每换一端就迁移出一个新设备条目——
     * 设备列表堆假活跃条目、按设备吊销打不中真正持有 token 的那条。故轮换时先在设备集合里找
     * 「当前指向本 token 摘要」的 deviceId（首次登录登记的那个），吊销与重签发都沿用同一条；
     * 找不到（历史数据/绑定丢失）才回退用提交值登记。
     *
     * @param logTag 日志前缀（[BUYER] / [SELLER] / [STAFF]），供按端检索
     */
    public Rotation rotate(String rawToken, String deviceId, String logTag) {
        String hash = secretHasher.hash(rawToken);
        // 1. 一次性消费旧码（getAndDelete + 标记原子完成；标记值 = 脚本内取到的 subjectId + 消费时刻）
        String subjectId = redis.execute(
                CONSUME_AND_MARK,
                List.of(KEY_REFRESH + hash, KEY_CONSUMED + hash),
                String.valueOf(clock.millis()),
                String.valueOf(CONSUMED_TTL.toSeconds()));
        if (subjectId == null) {
            // 2. 重放裁决：宽限期内算多标签页并发重复（静默拒绝），超期才算盗用（全端吊销）
            ReplayCheck replay = checkReplay(hash);
            if (replay.consumed()) {
                if (!replay.withinGrace()) {
                    log.warn("{} Refresh Token 重放攻击已检测, subjectId={}", logTag, replay.subjectId());
                    revokeAll(replay.subjectId());
                    throw BusinessException.gone(ErrorCodes.REFRESH_TOKEN_REUSED, "Refresh Token 已被重复使用，所有设备已下线");
                }
                log.info("{} Refresh 并发竞争（宽限期内）, subjectId={}", logTag, replay.subjectId());
                throw BusinessException.unauthorized("登录状态正在其他页面刷新，请稍后重试");
            }
            throw BusinessException.unauthorized(ErrorCodes.INVALID_TOKEN, "Refresh Token 无效或已过期");
        }

        // 3. 设备身份以 token 绑定为准（此时设备索引仍持有旧摘要，可反查）；无绑定才回退提交值
        String boundDevice = findDeviceByTokenHash(subjectId, hash);
        return new Rotation(subjectId, boundDevice != null ? boundDevice : orDefault(deviceId));
    }

    /**
     * 反查「当前索引指向该 token 摘要」的 deviceId：只扫本主体的设备集合（个位数成员），不碰 KEYS。
     * 消费旧码删除的是权威键 refresh:&lt;hmac&gt;，设备索引 refresh:user:&lt;subject&gt;:&lt;deviceId&gt; 此时仍在，
     * 其值即旧 token 摘要。找不到返回 null（无绑定的历史 token）。
     */
    private String findDeviceByTokenHash(String subjectId, String tokenHash) {
        Set<String> devices = redis.opsForSet().members(KEY_DEVICES + subjectId);
        if (devices == null) {
            return null;
        }
        for (String candidate : new HashSet<>(devices)) {
            if (tokenHash.equals(redis.opsForValue().get(KEY_USER_DEVICE + subjectId + ":" + candidate))) {
                return candidate;
            }
        }
        return null;
    }

    /** 提交值缺省时归入 {@link #DEFAULT_DEVICE_ID}；键拼装只用归一后的值，不让 null 混进键名 */
    private static String orDefault(String deviceId) {
        return deviceId == null ? DEFAULT_DEVICE_ID : deviceId;
    }

    /**
     * 消费失败后的重放裁决。宽限期内视为并发重复（调用方静默拒绝即可），超出宽限期判盗用
     * （调用方应全端吊销 + 告警）。
     */
    private ReplayCheck checkReplay(String hash) {
        String raw = redis.opsForValue().get(KEY_CONSUMED + hash);
        if (raw == null) {
            return new ReplayCheck(false, false, null);
        }
        int sep = raw.lastIndexOf(':');
        String subjectId = raw.substring(0, sep);
        long consumedAt = Long.parseLong(raw.substring(sep + 1));
        boolean withinGrace = clock.millis() - consumedAt < REPLAY_GRACE_MS;
        return new ReplayCheck(true, withinGrace, subjectId);
    }

    /** 删除指定设备的 refresh token（登出），并从设备集合移除 */
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
            for (String device : new HashSet<>(devices)) {
                revokeDevice(subjectId, device);
            }
        }
        redis.delete(devicesKey);
    }

    /**
     * 枚举当前有效（仍在会话）的设备列表，含元数据与最后活跃时间，供安全设置页展示。
     * 仅返回仍有有效 refresh token 索引的设备；stale deviceId（token 已过期但集合残留）被跳过。
     */
    public List<DeviceEntry> listDevices(String subjectId) {
        Set<String> devices = redis.opsForSet().members(KEY_DEVICES + subjectId);
        if (devices == null || devices.isEmpty()) {
            return List.of();
        }
        List<DeviceEntry> result = new ArrayList<>();
        for (String deviceId : devices) {
            if (redis.opsForValue().get(KEY_USER_DEVICE + subjectId + ":" + deviceId) == null) {
                continue;
            }
            result.add(new DeviceEntry(deviceId, readDeviceInfo(subjectId, deviceId)));
        }
        return result;
    }

    /** 读取某设备的元数据：name/ip/lastLoginAt；缺失时回退「未知设备」 */
    private DeviceInfo readDeviceInfo(String subjectId, String deviceId) {
        var hashOps = redis.opsForHash();
        String name = (String) hashOps.get(KEY_DEVICE_META + subjectId + ":" + deviceId, "name");
        String ip = (String) hashOps.get(KEY_DEVICE_META + subjectId + ":" + deviceId, "ip");
        String ts = (String) hashOps.get(KEY_DEVICE_META + subjectId + ":" + deviceId, "lastLoginAt");
        if (name == null) {
            name = "未知设备";
        }
        java.time.OffsetDateTime last = ts != null ? java.time.OffsetDateTime.parse(ts) : null;
        return new DeviceInfo(name, ip, last);
    }

    /** 设备列表条目：deviceId + 解析后的元数据 */
    public record DeviceEntry(String deviceId, DeviceInfo info) {}
}
