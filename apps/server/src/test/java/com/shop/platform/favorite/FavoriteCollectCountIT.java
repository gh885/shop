package com.shop.platform.favorite;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.favorite.mapper.FavoriteItemMapper;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 收藏量统计真库验证：collectCountByProductIds 经 selectMaps 读 uuid 列。
 * PG JDBC 驱动对 uuid 列可能返回 {@link UUID} 或 {@link String}（取决驱动版本），
 * mapper 必须两者都兼容——此前强转 String 在 UUID 驱动下抛 ClassCastException（GET /favorites 500）。
 * 本测试直接插 favorite 行（收藏量是本模块自有指标，无需商品存在），钉死返回 Map 键为 UUID 且计数正确。
 */
@SpringBootTest
class FavoriteCollectCountIT extends IntegrationTestSupport {

    @Autowired
    private FavoriteItemMapper favoriteItemMapper;

    private final UUID userA = UUID.randomUUID();

    private final UUID userB = UUID.randomUUID();

    private final UUID productA = UUID.randomUUID();

    private final UUID productB = UUID.randomUUID();

    @Test
    void 统计收藏人数_返回UUID键且计数正确_不抛ClassCast() {
        insert(userA, productA);
        insert(userB, productA); // productA 被 2 人收藏
        insert(userA, productB); // productB 被 1 人收藏

        Map<UUID, Long> counts = favoriteItemMapper.collectCountByProductIds(List.of(productA, productB));

        assertThat(counts).containsEntry(productA, 2L).containsEntry(productB, 1L);
        // 关键：Map 键是 UUID 而非 String，若强转 String 会在此前抛 ClassCastException
        assertThat(counts.keySet()).allMatch(k -> k instanceof UUID);
    }

    @Test
    void 空入参_返回空Map() {
        assertThat(favoriteItemMapper.collectCountByProductIds(List.of())).isEmpty();
    }

    private void insert(UUID userId, UUID productId) {
        jdbc.update(
                "INSERT INTO favorite.items (id, user_id, product_id) VALUES (?::uuid, ?::uuid, ?::uuid)",
                UUID.randomUUID().toString(),
                userId.toString(),
                productId.toString());
        db.onDelete("DELETE FROM favorite.items WHERE user_id = ?::uuid", userId.toString());
    }
}
