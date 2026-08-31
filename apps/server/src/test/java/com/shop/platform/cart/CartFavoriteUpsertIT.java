package com.shop.platform.cart;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.cart.mapper.CartItem;
import com.shop.platform.cart.mapper.CartItemMapper;
import com.shop.platform.favorite.mapper.FavoriteItem;
import com.shop.platform.favorite.mapper.FavoriteItemMapper;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 加购 / 收藏的 upsert 单语句真库验证 —— 这两条 SQL 的语义（ON CONFLICT 合并、封顶、RETURNING 出行）
 * 全在 DB 侧，mock 掉 mapper 的单测一行也测不到。
 *
 * <p>为何必须是 upsert 而不是「插入 + catch DuplicateKeyException 回退」：PG 一旦因唯一索引报错就把
 * 整个事务标记为 aborted，catch 之后的任何语句都会 25P02 失败（pgjdbc 默认 autosave=never，不打 savepoint），
 * 回退路径根本执行不到。本测试同时钉死「同一事务里连做两次不炸」——正是旧写法做不到的那件事。
 */
@SpringBootTest
class CartFavoriteUpsertIT extends IntegrationTestSupport {

    @Autowired
    private CartItemMapper cartItemMapper;

    @Autowired
    private FavoriteItemMapper favoriteItemMapper;

    private final UUID userId = UUID.randomUUID();

    private final UUID skuId = UUID.randomUUID();

    private final UUID productId = UUID.randomUUID();

    private void cleanupCart() {
        db.onDelete("DELETE FROM cart.items WHERE user_id = ?::uuid", userId.toString());
    }

    @Test
    void 加购_首次插入_二次同SKU累加_同事务连做不中止() {
        cleanupCart();

        CartItem first = cartItemMapper.upsertMerging(userId, skuId, 2);
        assertThat(first.getId()).isNotNull(); // RETURNING * 带回列默认值生成的主键
        assertThat(first.getQuantity()).isEqualTo(2);
        assertThat(first.getSelected()).isTrue();
        assertThat(first.getCreatedAt()).isNotNull();

        // 第二次撞 uk_cart_items_user_sku：走 DO UPDATE 累加，且事务仍然可用（旧写法在此处 25P02）
        CartItem merged = cartItemMapper.upsertMerging(userId, skuId, 3);
        assertThat(merged.getId()).isEqualTo(first.getId()); // 同一逻辑行，不新增
        assertThat(merged.getQuantity()).isEqualTo(5);

        // 事务确实没被中止：还能继续发语句
        assertThat(cartItemMapper.countByUser(userId)).isEqualTo(1L);
    }

    @Test
    void 加购_累加封顶999_不触发DB的CHECK() {
        cleanupCart();

        cartItemMapper.upsertMerging(userId, skuId, 995);
        CartItem capped = cartItemMapper.upsertMerging(userId, skuId, 10);

        // LEAST(...) 封顶在 SQL 里，995 + 10 顶到 999 而不是撞 CHECK (quantity BETWEEN 1 AND 999)
        assertThat(capped.getQuantity()).isEqualTo(CartItem.MAX_QUANTITY_PER_ITEM);
    }

    @Test
    void 收藏_重复收藏返回同一行_不产生第二行() {
        db.onDelete("DELETE FROM favorite.items WHERE user_id = ?::uuid", userId.toString());

        FavoriteItem first = favoriteItemMapper.upsertIdempotent(userId, productId);
        assertThat(first.getId()).isNotNull();

        // DO UPDATE 写回同值只为让 RETURNING 出行——DO NOTHING 撞冲突时不返回任何行
        FavoriteItem again = favoriteItemMapper.upsertIdempotent(userId, productId);
        assertThat(again.getId()).isEqualTo(first.getId());
        assertThat(again.getCreatedAt()).isEqualTo(first.getCreatedAt()); // 原行未被重建

        assertThat(favoriteItemMapper.selectByUserAndProducts(userId, java.util.List.of(productId)))
                .hasSize(1);
    }
}
