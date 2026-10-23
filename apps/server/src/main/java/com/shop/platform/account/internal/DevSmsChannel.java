package com.shop.platform.account.internal;

import com.shop.platform.common.PhoneNumber;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * 开发环境短信通道：验证码打日志 + 固定码联调 + 虚拟收件箱。
 *
 * <p>必须显式配置 shop.auth.sms-channel=dev 才会装配（matchIfMissing=false）：生产漏配真实通道时
 * 启动即失败（{@code SmsCodeService} 构造器要不到 SmsChannel bean），而不是静默启用固定码后门。
 *
 * <p><b>虚拟收件箱</b>：每次「发出」的验证码同时写进 Redis（每手机号保留最近 5 条、10 分钟过期），
 * 由 {@link DevSmsInboxController}（同一条件装配）提供查询——本地联调的体验等于
 * 「请求验证码 → 打开收件箱 → 回填」，不用翻日志。存的是<b>文案</b>而不是裸码，
 * 与真实通道收到的内容逐字一致。
 */
@Component
@ConditionalOnProperty(name = "shop.auth.sms-channel", havingValue = "dev")
public class DevSmsChannel implements SmsChannel {

    private static final Logger log = LoggerFactory.getLogger(DevSmsChannel.class);

    /** 开发环境固定验证码 */
    public static final String DEV_CODE = "666666";

    /** 收件箱 key：sms:dev:inbox:{手机号} → 最近「收到」的短信（JSON，新在前） */
    private static final String INBOX_KEY_PREFIX = "sms:dev:inbox:";

    private static final int INBOX_MAX = 5;

    private static final Duration INBOX_TTL = Duration.ofMinutes(10);

    private final StringRedisTemplate redis;

    private final ObjectMapper objectMapper;

    @Autowired
    public DevSmsChannel(StringRedisTemplate redis, ObjectMapper objectMapper) {
        this.redis = redis;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean sendCode(String phone, String text) {
        log.info("[SMS] 发送验证码到 {}: {}（开发环境固定码: {}）", PhoneNumber.mask(phone), text, DEV_CODE);
        String key = INBOX_KEY_PREFIX + phone;
        // 自家 record 序列化失败 = 编程错误：Jackson 3 的异常不检查，直接往上炸，不静默丢一条
        redis.opsForList()
                .leftPush(
                        key,
                        objectMapper.writeValueAsString(
                                new DevSmsMessage(text, OffsetDateTime.now().toString())));
        redis.opsForList().trim(key, 0, INBOX_MAX - 1);
        redis.expire(key, INBOX_TTL);
        return true;
    }

    /** 最近「收到」的短信，新在前；坏值跳过——开发工具不该因为一条脏数据整页打不开 */
    public List<DevSmsMessage> recentMessages(String phone) {
        List<String> raw = redis.opsForList().range(INBOX_KEY_PREFIX + phone, 0, -1);
        if (raw == null) {
            return List.of();
        }
        List<DevSmsMessage> out = new ArrayList<>();
        for (String json : raw) {
            try {
                out.add(objectMapper.readValue(json, DevSmsMessage.class));
            } catch (Exception e) {
                log.warn("[SMS] 收件箱里有无法解析的条目，已跳过: {}", json);
            }
        }
        return out;
    }
}
