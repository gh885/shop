package com.shop.platform.account.infra;

import com.shop.platform.common.PhoneNumber;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * 开发环境短信通道：验证码打日志 + 固定码联调 + 虚拟收件箱。
 *
 * <p>必须显式配置 shop.auth.sms-channel=dev 才会装配（matchIfMissing=false）：
 * 生产漏配真实通道时启动即失败，而不是静默启用固定码后门。
 *
 * <p><b>虚拟收件箱</b>：每次「发出」的验证码同时写进 Redis（每手机号保留最近
 * {@value #INBOX_MAX} 条、{@value #INBOX_TTL_MINUTES} 分钟过期），由
 * {@link com.shop.platform.account.controller.DevSmsInboxController}（同一条件装配）提供查询——
 * 本地联调的体验等于「请求验证码 → 打开收件箱 → 回填」，不用翻日志。存的是**文案**而不是裸码，
 * 与真实通道收到的内容逐字一致；登录/重置/注销/将来的激活码都经这一条路。
 */
@Component
@ConditionalOnProperty(name = "shop.auth.sms-channel", havingValue = "dev")
@Slf4j
@RequiredArgsConstructor
public class DevSmsChannel implements SmsChannel {

    /** 开发环境固定验证码 */
    private static final String DEV_CODE = "666666";

    /** 收件箱 key：sms:dev:inbox:{手机号} → 最近「收到」的短信（JSON，新在前） */
    private static final String INBOX_KEY_PREFIX = "sms:dev:inbox:";

    /** 每个手机号保留的最近条数 */
    private static final int INBOX_MAX = 5;

    /** 收件箱条目的存活时间（比验证码本身多活一会儿，方便回看「刚才发过什么」） */
    private static final long INBOX_TTL_MINUTES = 10;

    private static final Duration INBOX_TTL = Duration.ofMinutes(INBOX_TTL_MINUTES);

    private final StringRedisTemplate redis;

    private final ObjectMapper objectMapper;

    @Override
    public boolean sendCode(String phone, String code) {
        log.info("[SMS] 发送验证码到 {}: {}（开发环境固定码: {}）", PhoneNumber.mask(phone), code, DEV_CODE);
        String key = INBOX_KEY_PREFIX + phone;
        // 自家 record 序列化失败 = 编程错误：Jackson 3 的异常不检查，直接往上炸，不静默丢一条
        redis.opsForList()
                .leftPush(
                        key,
                        objectMapper.writeValueAsString(
                                new DevSmsMessage(code, OffsetDateTime.now().toString())));
        redis.opsForList().trim(key, 0, INBOX_MAX - 1);
        redis.expire(key, INBOX_TTL);
        return true;
    }

    public String getDevCode() {
        return DEV_CODE;
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
