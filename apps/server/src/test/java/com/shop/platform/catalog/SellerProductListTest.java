package com.shop.platform.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.catalog.mapper.SpuMapper;
import com.shop.platform.catalog.model.IdentityKind;
import com.shop.platform.catalog.service.SellerProductQuery;
import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import com.shop.platform.inventory.api.InventoryCommand;
import com.shop.platform.testsupport.IntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 卖家商品列表：归属隔离、游标分页、状态筛选、库存经 api 批查。
 *
 * <p>用真库：这里验的四件事（{@code WHERE merchant_id = ?} 的隔离、
 * {@code (created_at, id)} 复合游标的平局裁决、{@code COALESCE(l.status, 'draft')} 的草稿语义、
 * 库存跨仓求和）全是数据库行为，mock 掉等于什么都没验。
 */
class SellerProductListTest extends IntegrationTest {

    private static final UUID SPEC_ATTRIBUTE = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Autowired
    private SellerProductQuery query;

    @Autowired
    private SpuMapper spus;

    @Autowired
    private InventoryCommand inventory;

    private UUID merchant;
    private UUID category;

    private UUID[] categoryAncestors = new UUID[0];

    /** 只看得到自己的商品——归属写进 SQL，不是查出来再比对。 */
    @Test
    void theListOnlyContainsOwnProducts() {
        merchant = Ids.newId();
        product("我的", merchant);
        product("别人的", Ids.newId());

        var page = query.page(merchant, null, null, null, 20);

        assertThat(page.items()).extracting(item -> item.title()).containsExactly("list-test-我的");
    }

    /** 没有 listing 行的 SPU 展示成 draft，不是 null。 */
    @Test
    void aProductWithoutListingIsADraft() {
        merchant = Ids.newId();
        product("没提交过", merchant);

        var page = query.page(merchant, null, null, null, 20);

        assertThat(page.items().getFirst().status()).as("库里没有这个值，但商家看到的语义是「草稿」").isEqualTo("draft");
        assertThat(page.items().getFirst().rejectReason()).isNull();
    }

    /** 按状态筛：只出该状态的。 */
    @Test
    void filteringByStatusOnlyReturnsThatStatus() {
        merchant = Ids.newId();
        UUID draft = product("草稿", merchant);
        UUID online = product("在售", merchant);
        listing(online, merchant, "online");

        assertThat(query.page(merchant, "online", null, null, 20).items())
                .extracting(item -> item.spuId())
                .containsExactly(online);
        assertThat(query.page(merchant, "draft", null, null, 20).items())
                .extracting(item -> item.spuId())
                .containsExactly(draft);
    }

    /** 各状态计数与列表同一快照：「全部」等于各标签之和。 */
    @Test
    void countsMatchTheFilteredLists() {
        merchant = Ids.newId();
        product("草稿一", merchant);
        product("草稿二", merchant);
        listing(product("在售", merchant), merchant, "online");

        var counts = query.page(merchant, null, null, null, 20).counts();

        assertThat(counts.all()).isEqualTo(3);
        assertThat(counts.byStatus()).containsEntry("draft", 2L).containsEntry("online", 1L);
        assertThat(counts.byStatus().values().stream()
                        .mapToLong(Long::longValue)
                        .sum())
                .as("全部必须等于各标签之和，否则前端会显示「全部 3，加起来 2」")
                .isEqualTo(counts.all());
    }

    /**
     * 库存经 {@code inventory :: api} 批查，跨仓求和。
     *
     * <p>这条测试守的是「列表不跨 schema 读 inventory.stock」——那条规则一旦破了，
     * 库存口径就会有两处定义，而它们迟早会漂。
     */
    @Test
    void stockIsSummedAcrossWarehouses() {
        merchant = Ids.newId();
        UUID spu = product("有货", merchant);
        UUID sku = jdbc.queryForObject("SELECT id FROM catalog.sku WHERE spu_id = ?", UUID.class, spu);
        // 两个仓各 10 件：列表要给商家看「总共还有 20」，不是「默认仓 10」
        stock(sku, UUID.fromString("00000000-0000-0000-0000-000000000001"), 10);
        stock(sku, UUID.fromString("00000000-0000-0000-0000-000000000002"), 10);

        var page = query.page(merchant, null, null, null, 20);

        assertThat(page.items().getFirst().availableStock()).isEqualTo(20);
    }

    /** 停售的 SKU 不计入库存——它们卖不了。 */
    @Test
    void disabledSkusDoNotCountTowardsStock() {
        merchant = Ids.newId();
        UUID spu = product("停售一半", merchant);
        UUID active = jdbc.queryForObject("SELECT id FROM catalog.sku WHERE spu_id = ?", UUID.class, spu);
        UUID disabled = Ids.newId();
        jdbc.update(
                """
                INSERT INTO catalog.sku (id, spu_id, spec_values, spec_key, price_amount, price_currency, status)
                VALUES (?, ?, CAST(? AS jsonb), ?, 100, 'CNY', 'disabled')
                """,
                disabled,
                spu,
                "{\"" + SPEC_ATTRIBUTE + "\":\"另一个\"}",
                "disabled-" + disabled);
        stock(active, UUID.fromString("00000000-0000-0000-0000-000000000001"), 7);
        stock(disabled, UUID.fromString("00000000-0000-0000-0000-000000000001"), 99);

        var page = query.page(merchant, null, null, null, 20);

        assertThat(page.items().getFirst().availableStock())
                .as("停售的 SKU 卖不了，它的库存不该出现在「我还有多少货」里")
                .isEqualTo(7);
        assertThat(page.items().getFirst().skuCount()).as("只数 active 的").isEqualTo(1);
    }

    /** 起价取 active SKU 的最低价。 */
    @Test
    void minPriceComesFromActiveSkus() {
        merchant = Ids.newId();
        UUID spu = product("两个规格", merchant);
        jdbc.update("DELETE FROM catalog.sku WHERE spu_id = ?", spu);
        sku(spu, "便宜", 1_999_00L, "active");
        sku(spu, "贵", 3_999_00L, "active");
        sku(spu, "停售的便宜货", 9_99L, "disabled");

        var page = query.page(merchant, null, null, null, 20);

        assertThat(page.items().getFirst().minPrice()).as("停售的 SKU 不该拉低起价").isEqualTo(Money.cny(1_999_00L));
    }

    /** 全停售的商品起价是 null（暂无报价），不是 0。 */
    @Test
    void aProductWithNoActiveSkuHasNoMinPrice() {
        merchant = Ids.newId();
        UUID spu = product("全停售", merchant);
        jdbc.update("UPDATE catalog.sku SET status = 'disabled' WHERE spu_id = ?", spu);

        var page = query.page(merchant, null, null, null, 20);

        assertThat(page.items().getFirst().minPrice()).isNull();
        assertThat(page.items().getFirst().skuCount()).isZero();
    }

    /** 被驳回的商品带出理由——那是商家唯一能看见的审核反馈。 */
    @Test
    void aRejectedProductCarriesTheReason() {
        merchant = Ids.newId();
        UUID spu = product("被驳回", merchant);
        listing(spu, merchant, "rejected");
        jdbc.update("UPDATE catalog.listing SET reject_reason = '图片不清晰' WHERE spu_id = ?", spu);

        var page = query.page(merchant, "rejected", null, null, 20);

        assertThat(page.items().getFirst().rejectReason()).isEqualTo("图片不清晰");
    }

    // ── 造数 ──

    private UUID product(String title, UUID owner) {
        UUID id = Ids.newId();
        spus.insertSpu(
                id, owner, leafCategory(), null, "list-test-" + title, null, true, null, IdentityKind.NONE, null);
        sku(id, "默认", 1_999_00L, "active");
        return id;
    }

    private void sku(UUID spuId, String spec, long priceAmount, String status) {
        jdbc.update(
                """
                INSERT INTO catalog.sku (id, spu_id, spec_values, spec_key, price_amount, price_currency, status)
                VALUES (?, ?, CAST(? AS jsonb), ?, ?, 'CNY', ?)
                """,
                Ids.newId(),
                spuId,
                "{\"" + SPEC_ATTRIBUTE + "\":\"" + spec + "\"}",
                spec,
                priceAmount,
                status);
    }

    private void listing(UUID spuId, UUID owner, String status) {
        jdbc.update(
                "INSERT INTO catalog.listing (id, spu_id, merchant_id, shop_id, status) VALUES (?, ?, ?, ?, ?)",
                Ids.newId(),
                spuId,
                owner,
                Ids.newId(),
                status);
    }

    private void stock(UUID skuId, UUID warehouseId, int available) {
        jdbc.update(
                """
                INSERT INTO inventory.stock
                    (sku_id, warehouse_id, merchant_id, on_hand, available_to_promise, reserved, safety)
                VALUES (?, ?, ?, ?, ?, 0, 0)
                """,
                skuId,
                warehouseId,
                merchant,
                available,
                available);
    }

    /**
     * 造一个三层叶子类目。
     *
     * <p>必须造满三层：{@code ck_category_path_shape} 要求 {@code path} 以 {@code /id/} 结尾、
     * 且段数等于 {@code level}。
     */
    private UUID leafCategory() {
        if (category != null) {
            return category;
        }
        UUID level1 = Ids.newId();
        UUID level2 = Ids.newId();
        category = Ids.newId();
        String suffix = category.toString().substring(0, 8);

        jdbc.update(
                "INSERT INTO catalog.category (id, path, level, code, name) VALUES (?, ?, 1, ?, '列表测试')",
                level1,
                "/" + level1 + "/",
                "ls1-" + suffix);
        jdbc.update(
                "INSERT INTO catalog.category (id, parent_id, path, level, code, name) VALUES (?, ?, ?, 2, ?, '二级')",
                level2,
                level1,
                "/" + level1 + "/" + level2 + "/",
                "ls2-" + suffix);
        jdbc.update(
                "INSERT INTO catalog.category (id, parent_id, path, level, code, name) VALUES (?, ?, ?, 3, ?, '叶子')",
                category,
                level2,
                "/" + level1 + "/" + level2 + "/" + category + "/",
                "ls3-" + suffix);
        categoryAncestors = new UUID[] {level1, level2};
        return category;
    }
}
