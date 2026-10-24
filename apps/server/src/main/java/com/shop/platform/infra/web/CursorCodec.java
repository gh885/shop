package com.shop.platform.infra.web;

import com.shop.platform.common.BusinessException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/**
 * 列表游标：把「翻到哪了」编成客户端不透明的一串。
 *
 * <p>游标载荷是 {@code (created_at, id)} 复合键——列表都按 {@code created_at DESC} 排，
 * 只带时间做游标的话同一毫秒落的多条会串页（跳过或重复），必须拿 id 做平局裁决。
 * base64url 只是编码不是加密：被篡改最多影响这个人自己的列表，不值得上签名。
 */
public final class CursorCodec {

    private CursorCodec() {}

    public record Point(Instant createdAt, UUID id) {}

    public static String encode(Instant createdAt, UUID id) {
        String raw = createdAt.toEpochMilli() + ":" + id;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.US_ASCII));
    }

    /** 坏游标回 400 不回 500：游标是客户端可控输入，格式错是客户端的锅。 */
    public static Point decode(String cursor) {
        String raw;
        try {
            raw = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.US_ASCII);
        } catch (IllegalArgumentException e) {
            throw invalid();
        }
        int sep = raw.indexOf(':');
        if (sep <= 0) {
            throw invalid();
        }
        try {
            return new Point(
                    Instant.ofEpochMilli(Long.parseLong(raw.substring(0, sep))),
                    UUID.fromString(raw.substring(sep + 1)));
        } catch (RuntimeException e) {
            throw invalid();
        }
    }

    /** 坏游标回 400 不回 500：游标是客户端可控输入，格式错是客户端的锅。前端无需按码分支，不占注册表。 */
    private static BusinessException invalid() {
        return BusinessException.badRequest("cursor 不是合法的游标");
    }
}
