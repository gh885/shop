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
 * 只带时间做游标的话同一时刻落的多条会串页（跳过或重复），必须拿 id 做平局裁决。
 * base64url 只是编码不是加密：被篡改最多影响这个人自己的列表，不值得上签名。
 *
 * <p><b>时间用纳秒编码，不是毫秒。</b> PostgreSQL 的 {@code timestamptz} 精度是微秒，
 * 批量插入（种子、迁移回填、一次事务里连建几行）经常落进同一毫秒。用 {@code toEpochMilli()}
 * 编码会把这几行的差别抹平，解码回来的时间大于等于真实行时间，于是
 * {@code (created_at, id) < (游标时间, 游标id)} 把它们全判成"已翻过"，翻页就静默丢行。
 * 这不是理论问题：任一列表页一次事务里插两行即必现。
 */
public final class CursorCodec {

    private CursorCodec() {}

    public record Point(Instant createdAt, UUID id) {}

    public static String encode(Instant createdAt, UUID id) {
        // toEpochMilli 会截微秒；纳秒能完整覆盖 PG 的微秒精度（再往下 PG 也没有了）
        String raw = createdAt.getEpochSecond() + "." + createdAt.getNano() + ":" + id;
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
        int dot = raw.indexOf('.');
        if (sep <= 0 || dot <= 0 || dot > sep) {
            throw invalid();
        }
        try {
            Instant createdAt = Instant.ofEpochSecond(
                    Long.parseLong(raw.substring(0, dot)), Long.parseLong(raw.substring(dot + 1, sep)));
            return new Point(createdAt, UUID.fromString(raw.substring(sep + 1)));
        } catch (RuntimeException e) {
            throw invalid();
        }
    }

    /** 坏游标回 400 不回 500：游标是客户端可控输入，格式错是客户端的锅。前端无需按码分支，不占注册表。 */
    private static BusinessException invalid() {
        return BusinessException.badRequest("cursor 不是合法的游标");
    }
}
