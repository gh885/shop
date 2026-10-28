package com.shop.platform.infra.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 游标编解码。
 *
 * <p>这里只测一件事：<b>编码再解码得到同一个点，坏输入回 400 而不是炸 500。</b>
 * 游标是客户端唯一可控的服务端状态，格式错是常态不是异常。
 */
class CursorCodecTest {

    @Test
    void 编码再解码还原同一个点() {
        Instant createdAt = Instant.parse("2026-10-24T08:30:00.123Z");
        UUID id = UUID.fromString("0b9e6c1e-5f2a-4c3d-8b7a-9e2d1c0f4a5b");

        CursorCodec.Point decoded = CursorCodec.decode(CursorCodec.encode(createdAt, id));

        assertThat(decoded.createdAt()).isEqualTo(createdAt);
        assertThat(decoded.id()).isEqualTo(id);
    }

    @Test
    void 同一毫秒的不同行编出不同游标() {
        Instant same = Instant.parse("2026-10-24T08:30:00.123Z");
        String a = CursorCodec.encode(same, UUID.randomUUID());
        String b = CursorCodec.encode(same, UUID.randomUUID());

        assertThat(a).isNotEqualTo(b);
    }

    /**
     * 微秒精度必须原样往返。
     *
     * <p>回归用例：PostgreSQL 的 {@code timestamptz} 存到微秒，一次事务里连建几行常常落在同一毫秒。
     * 用 {@code toEpochMilli()} 编码会把这几行的差别抹平，解码回来的时间偏大，
     * {@code (created_at, id) < (游标时间, 游标id)} 于是把本该出现在下一页的行判成「已翻过」——
     * 翻页静默丢行，客户端看不出任何异常。{@code StaffListTest} 一次插两行就必现。
     */
    @Test
    void 微秒精度原样往返_不要截成毫秒() {
        Instant a = Instant.parse("2026-10-24T08:30:00.123456Z");
        Instant b = Instant.parse("2026-10-24T08:30:00.123001Z");

        assertThat(CursorCodec.decode(CursorCodec.encode(a, UUID.randomUUID())).createdAt())
                .isEqualTo(a);
        assertThat(CursorCodec.decode(CursorCodec.encode(b, UUID.randomUUID())).createdAt())
                .isEqualTo(b);
        // 截成毫秒的话这两个会编码成同一个时间，游标就分不出先后
        assertThat(CursorCodec.encode(a, UUID.randomUUID())).isNotEqualTo(CursorCodec.encode(b, UUID.randomUUID()));
    }

    @Test
    void 坏输入回400带INVALID_CURSOR() {
        for (String bad : new String[] {"not-base64!!", "MTIzNDU", "", "abc", "0:不是uuid"}) {
            assertThatThrownBy(() -> CursorCodec.decode(bad))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("cursor");
        }
    }
}
