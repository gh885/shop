package com.shop.platform.recommend.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * feed 游标：{@code <seed>.<lastId>}。
 *
 * <p>种子在「无游标的首请求」由服务端生成，随 {@code nextCursor} 带回，后续页原样带回来——
 * 服务端不存会话状态。排序键可由 lastId + seed 重算，所以游标里不存哈希。
 * 对客户端是不透明字符串，编解码只此一处。
 */
public record FeedCursor(String seed, UUID lastId) {

    /** 形态闸门：16 位 hex 种子 + 36 位 UUID；被改过的游标一律 400，不放它去撞 SQL 类型错 */
    private static final Pattern SHAPE = Pattern.compile("^[0-9a-f]{16}\\.[0-9a-f-]{36}$");

    private static final int SEED_BYTES = 8;

    private static final SecureRandom RANDOM = new SecureRandom();

    /** 新种子（16 位 hex）：只用于打乱顺序，不是安全令牌，SecureRandom 只是免去手写线程安全 */
    public static String newSeed() {
        byte[] bytes = new byte[SEED_BYTES];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    /** 解码上一页带回的游标；形态不合法一律 400 */
    public static FeedCursor decode(String raw) {
        Validate.isTrue(raw != null && SHAPE.matcher(raw).matches(), "游标不合法");
        int dot = raw.indexOf('.');
        try {
            return new FeedCursor(raw.substring(0, dot), UUID.fromString(raw.substring(dot + 1)));
        } catch (IllegalArgumentException e) {
            // 正则只挡长度与字符集，UUID 的段结构由 fromString 兜底（如全 '-' 的 36 位串）
            throw BusinessException.badRequest("游标不合法");
        }
    }

    /** 编回客户端：只带种子与位置，排序键留给服务端重算 */
    public String encode() {
        return seed + "." + lastId;
    }
}
