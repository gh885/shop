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

    @Test
    void 坏输入回400带INVALID_CURSOR() {
        for (String bad : new String[] {"not-base64!!", "MTIzNDU", "", "abc", "0:不是uuid"}) {
            assertThatThrownBy(() -> CursorCodec.decode(bad))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("cursor");
        }
    }
}
