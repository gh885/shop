package com.shop.platform.cart;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.cart.mapper.FavoriteMapper;
import com.shop.platform.cart.service.FavoriteService;
import com.shop.platform.cart.service.FavoriteViews.FavoritePage;
import com.shop.platform.catalog.mapper.SkuMapper;
import com.shop.platform.catalog.mapper.SpuMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.FavoriteRules;
import com.shop.platform.common.id.Ids;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 收藏的语义验收：幂等、失效置灰、上限只在真的插进去之后判。
 *
 * <p>用真库而不是 mock——这里验的三件事（{@code ON CONFLICT DO NOTHING} 的幂等、
 * 批量查的 IN 子句、事务回滚把刚插的行一起带走）全都是数据库行为，mock 掉就等于什么都没验。
 */
@SpringBootTest
@ActiveProfiles("test")
class FavoriteServiceTest {

    @Autowired
    private FavoriteService favorites;

    @Autowired
    private FavoriteMapper mapper;

    @Autowired
    private SpuMapper spus;

    @Autowired
    private SkuMapper skus;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID buyer;

    /** 本测试自己的类目：测试库是空库，没有种子类目可用。 */
    private UUID category;

    @AfterEach
    void cleanUp() {
        if (buyer != null) {
            jdbc.update("DELETE FROM cart.favorite_item WHERE buyer_id = ?", buyer);
        }
        jdbc.update(
                "DELETE FROM catalog.listing WHERE spu_id IN (SELECT id FROM catalog.spu WHERE title LIKE 'fav-test-%')");
        jdbc.update(
                "DELETE FROM catalog.sku WHERE spu_id IN (SELECT id FROM catalog.spu WHERE title LIKE 'fav-test-%')");
        jdbc.update("DELETE FROM catalog.spu WHERE title LIKE 'fav-test-%'");
        if (category != null) {
            jdbc.update("DELETE FROM catalog.category WHERE id = ?", category);
            for (UUID ancestor : categoryAncestors) {
                jdbc.update("DELETE FROM catalog.category WHERE id = ?", ancestor);
            }
            category = null;
            categoryAncestors = new UUID[0];
        }
    }

    @Test
    void collectingTheSameProductTwiceIsIdempotent() {
        buyer = Ids.newId();
        UUID spu = onlineSpu("收藏幂等");

        var first = favorites.add(buyer, spu);
        var second = favorites.add(buyer, spu);

        assertThat(first.created()).as("第一次是真的新收了").isTrue();
        assertThat(second.created()).as("第二次是幂等命中，不是新建").isFalse();
        assertThat(second.favorited()).isTrue();
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM cart.favorite_item WHERE buyer_id = ? AND spu_id = ?",
                        Long.class,
                        buyer,
                        spu))
                .as("重复收藏不能长出第二行")
                .isEqualTo(1L);
    }

    /** 「什么时候收的」问的是第一次——重复收藏不刷新 created_at。 */
    @Test
    void collectingAgainDoesNotRefreshTheTimestamp() {
        buyer = Ids.newId();
        UUID spu = onlineSpu("时间不刷新");

        favorites.add(buyer, spu);
        var firstAt = mapper.findCreatedAt(buyer, spu).orElseThrow();
        favorites.add(buyer, spu);
        var secondAt = mapper.findCreatedAt(buyer, spu).orElseThrow();

        assertThat(secondAt).isEqualTo(firstAt);
    }

    /** 已下架的商品**能收藏成功**，列表里置灰。这是与购物车最大的不同。 */
    @Test
    void delistedProductStaysInTheListButIsMarkedUnavailable() {
        buyer = Ids.newId();
        UUID spu = onlineSpu("下架置灰");

        favorites.add(buyer, spu);
        // 下架：把 listing 从 online 挪走
        jdbc.update("UPDATE catalog.listing SET status = 'offline' WHERE spu_id = ?", spu);

        FavoritePage page = favorites.list(buyer, null, 20);

        assertThat(page.items()).hasSize(1);
        assertThat(page.items().getFirst().available()).as("下架后仍在列表里，只是置灰").isFalse();
        assertThat(page.items().getFirst().spuId()).isEqualTo(spu);
        assertThat(page.items().getFirst().title()).as("失效行不返回商品字段").isNull();
    }

    /** 收藏一个不存在的商品：404。与「已下架」是两件事。 */
    @Test
    void collectingANonExistentProductIsNotFound() {
        buyer = Ids.newId();

        assertThatThrownBy(() -> favorites.add(buyer, Ids.newId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("商品不存在");
    }

    /** 上限只在真的插进去之后判；超限回滚，刚插的那行一起没。 */
    @Test
    void exceedingTheLimitRollsBackTheInsert() {
        buyer = Ids.newId();
        UUID spu = onlineSpu("上限回滚");

        // 先把库填到上限（直接写库，不走 service，免得造 500 个真商品）
        jdbc.update(
                """
                INSERT INTO cart.favorite_item (id, buyer_id, spu_id)
                SELECT uuidv7(), ?, uuidv7() FROM generate_series(1, ?)
                """,
                buyer,
                FavoriteRules.ITEM_KINDS_MAX);

        assertThatThrownBy(() -> favorites.add(buyer, spu))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("收藏夹最多存放");

        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM cart.favorite_item WHERE buyer_id = ? AND spu_id = ?",
                        Long.class,
                        buyer,
                        spu))
                .as("超限时刚插的那行必须被回滚掉")
                .isZero();
    }

    /** 已经收藏过的商品，即使车满了也能「重复收藏」成功——幂等命中不占新坑。 */
    @Test
    void reCollectingAnAlreadyCollectedProductWorksEvenWhenFull() {
        buyer = Ids.newId();
        UUID spu = onlineSpu("满了也能重收");

        favorites.add(buyer, spu);
        jdbc.update(
                """
                INSERT INTO cart.favorite_item (id, buyer_id, spu_id)
                SELECT uuidv7(), ?, uuidv7() FROM generate_series(1, ?)
                """,
                buyer,
                FavoriteRules.ITEM_KINDS_MAX);

        var again = favorites.add(buyer, spu);

        assertThat(again.created()).isFalse();
        assertThat(again.favorited()).isTrue();
    }

    @Test
    void existsOnlyReturnsTheOnesActuallyCollected() {
        buyer = Ids.newId();
        UUID collected = onlineSpu("已收藏");
        UUID notCollected = onlineSpu("未收藏");

        favorites.add(buyer, collected);
        var result = favorites.exists(buyer, List.of(collected, notCollected));

        assertThat(result.favoritedSpuIds()).containsExactly(collected);
    }

    @Test
    void removingSomethingNeverCollectedIsSilent() {
        buyer = Ids.newId();

        // toggle 语义：取消一个没收藏的东西不是错误
        favorites.remove(buyer, Ids.newId());
    }

    /** 造一个可售 SPU：spu + 一个 active SKU + 一条 online listing。 */
    private UUID onlineSpu(String title) {
        UUID spuId = Ids.newId();
        UUID merchantId = Ids.newId();
        spus.insertSpu(
                spuId,
                merchantId,
                leafCategory(),
                null,
                "fav-test-" + title,
                null,
                true,
                null,
                com.shop.platform.catalog.model.IdentityKind.NONE,
                null);
        // 单规格商品允许空规格
        skus.insertSku(
                Ids.newId(),
                spuId,
                merchantId,
                java.util.Map.of(),
                com.shop.platform.common.money.Money.cny(1999L),
                null,
                null,
                null,
                null,
                null);
        jdbc.update(
                """
                INSERT INTO catalog.listing (id, spu_id, merchant_id, shop_id, status)
                VALUES (?, ?, ?, ?, 'online')
                """,
                Ids.newId(),
                spuId,
                merchantId,
                Ids.newId());
        return spuId;
    }

    /**
     * 懒建一个三层类目，整类测试共用（每个测试开头造、@AfterEach 删）。
     *
     * <p>必须造满三层：{@code ck_category_path_shape} 要求 {@code path} 以 {@code /id/} 结尾、
     * 且段数等于 {@code level}；{@code is_leaf} 已删（V20261022112500），叶子靠 {@code level = 3} 推导。
     * 造一条孤立的三层行是过不了约束的——它必须真的挂在一条两层的路径下。
     */
    private UUID leafCategory() {
        if (category == null) {
            UUID level1 = Ids.newId();
            UUID level2 = Ids.newId();
            category = Ids.newId();
            String suffix = category.toString().substring(0, 8);

            jdbc.update(
                    "INSERT INTO catalog.category (id, path, level, code, name) VALUES (?, ?, 1, ?, '收藏测试')",
                    level1,
                    "/" + level1 + "/",
                    "fav1-" + suffix);
            jdbc.update(
                    "INSERT INTO catalog.category (id, parent_id, path, level, code, name) VALUES (?, ?, ?, 2, ?, '收藏测试二级')",
                    level2,
                    level1,
                    "/" + level1 + "/" + level2 + "/",
                    "fav2-" + suffix);
            jdbc.update(
                    "INSERT INTO catalog.category (id, parent_id, path, level, code, name) VALUES (?, ?, ?, 3, ?, '收藏测试叶子')",
                    category,
                    level2,
                    "/" + level1 + "/" + level2 + "/" + category + "/",
                    "fav3-" + suffix);
            categoryAncestors = new UUID[] {level1, level2};
        }
        return category;
    }

    /** 造出来的祖先类目，清理时按层级倒序删。 */
    private UUID[] categoryAncestors = new UUID[0];
}
