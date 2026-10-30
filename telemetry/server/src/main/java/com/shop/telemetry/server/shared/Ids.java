package com.shop.telemetry.server.shared;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;

/**
 * id 生成。两个方法对应两种语义：
 *
 * <ul>
 *   <li>{@link #newEventId()} 随机——客户端没给 id 时的兜底
 *   <li>{@link #contentId(String)} 确定性——原始类 item（session/transaction/check_in）没有天然主键，
 *       用内容哈希做幂等键。at-least-once 重投时哈希相同 ⇒ 唯一约束挡住重复
 * </ul>
 */
public final class Ids {

    private static final SecureRandom RANDOM = new SecureRandom();

    private Ids() {}

    public static String newEventId() {
        byte[] buffer = new byte[16];
        RANDOM.nextBytes(buffer);
        return HexFormat.of().formatHex(buffer);
    }

    public static String contentId(String payload) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 必须存在于 JRE", e);
        }
    }
}
