package com.shop.platform.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.catalog.mapper.SpuMapper;
import com.shop.platform.catalog.model.IdentityKind;
import com.shop.platform.catalog.service.StandardProductService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.testsupport.IntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 标准品合并与同款比价。
 *
 * <p>用真库：这里验的五件事（递归 CTE 找终点、条件更新 0 行是判决、一条 UPDATE 改指全部挂靠、
 * 按 {@code identity_key} 分组的比价、合并链的解链）全是数据库行为，mock 掉等于什么都没验。
 *
 * <p><b>这个测试类存在的理由。</b> {@code standard_spu_id} 在这一轮之前是只写不读的列：
 * {@code StandardMatcher} 一直在匹配，但没有任何消费者。没有测试，它就一直是「代码写了、
 * 没人调用、所以没报错」的那一类——和这轮修掉的三个故障同源。
 */
class StandardProductTest extends IntegrationTest {

    private static final UUID SPEC_ATTRIBUTE = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Autowired
    private StandardProductService standards;

    @Autowired
    private SpuMapper spus;

    private UUID category;

    private UUID[] categoryAncestors = new UUID[0];

    /** 合并：挂靠在 source 上的商家商品全部改指 target。 */
    @Test
    void mergingRepointsEveryBoundProduct() {
        UUID source = standard("源标准品");
        UUID target = standard("目标标准品");
        UUID first = merchantProduct("商品一", source);
        UUID second = merchantProduct("商品二", source);

        standards.merge(source, target, Ids.newId());

        assertThat(standardOf(first)).as("一条 UPDATE 改指全部挂靠，不逐行读改写").isEqualTo(target);
        assertThat(standardOf(second)).isEqualTo(target);
        assertThat(mergedInto(source)).as("源行不物理删，记下去向").isEqualTo(target);
    }

    /** 改指之后 matched_by 变成 manual——这些挂靠关系现在有人工判断了。 */
    @Test
    void repointedProductsAreMarkedManual() {
        UUID source = standard("源");
        UUID target = standard("目标");
        UUID product = merchantProduct("商品", source);

        standards.merge(source, target, Ids.newId());

        assertThat(jdbc.queryForObject(
                        "SELECT standard_matched_by FROM catalog.spu WHERE id = ?", String.class, product))
                .as("说它还是「按型号自动匹配的」就是撒谎，而这一列是排查归并错误的唯一线索")
                .isEqualTo("manual");
    }

    /** 合并后不能再被挂靠——源已经不是终点了。 */
    @Test
    void aMergedStandardCannotBeBoundAgain() {
        UUID source = standard("源");
        UUID target = standard("目标");
        UUID product = merchantProduct("商品", null);
        standards.merge(source, target, Ids.newId());

        assertThatThrownBy(() -> standards.bind(product, merchantOf(product), source))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("已被合并到");
    }

    /** 不能并到自己。 */
    @Test
    void mergingIntoItselfIsRejected() {
        UUID standard = standard("自己");

        assertThatThrownBy(() -> standards.merge(standard, standard, Ids.newId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("并入自己");
    }

    /** 不能并到一个已被合并的标准品上——那会造出 A→B→C 的链，每个消费方都得解链。 */
    @Test
    void mergingIntoAnAlreadyMergedStandardIsRejected() {
        UUID first = standard("一");
        UUID second = standard("二");
        UUID third = standard("三");
        standards.merge(first, second, Ids.newId());

        assertThatThrownBy(() -> standards.merge(third, first, Ids.newId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("已被合并到");
    }

    /** 重复合并同一个源：第二次是 409，不是静默成功。 */
    @Test
    void mergingTheSameSourceTwiceIsAConflict() {
        UUID source = standard("源");
        UUID target = standard("目标");
        standards.merge(source, target, Ids.newId());

        assertThatThrownBy(() -> standards.merge(source, standard("另一个目标"), Ids.newId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("已被合并到");
    }

    /**
     * 同款比价：同一标准品下，同一 {@code identity_key} 的各家报价按价格升序。
     *
     * <p>这是标准品存在的全部理由——没有它，{@code standard_spu_id} 只是一列没人读的数据。
     */
    @Test
    void sameProductGroupsQuotesBySkuIdentityKey() {
        UUID standard = standard("iPhone 15 Pro 256G");
        UUID cheap = merchantProduct("便宜的", standard, "GTIN-001", 7_999_00L);
        UUID pricey = merchantProduct("贵的", standard, "GTIN-001", 8_999_00L);
        online(cheap);
        online(pricey);

        var view = standards.sameProduct(standard);

        assertThat(view.offers()).as("两个商家商品都在卖").hasSize(2);
        assertThat(view.pricesBySpec()).as("同一个 identity_key 归成一组").hasSize(1);
        var spec = view.pricesBySpec().getFirst();
        // identity_key 是写入侧归一化后的值（IdentityKeyResolver 做小写）；这里直接 INSERT
        // 绕过了归一化，所以拿到的就是原样。比价只按它分组，不自己再归一一次——
        // 两处归一就会有两份可能不同的规则
        assertThat(spec.identityKey()).isEqualTo("GTIN-001");
        assertThat(spec.lowest().amount()).as("最低价是最便宜那家").isEqualTo(7_999_00L);
        assertThat(spec.quotes())
                .as("组内按价格升序，买家要看到最便宜的在前")
                .extracting(quote -> quote.price().amount())
                .containsExactly(7_999_00L, 8_999_00L);
    }

    /** 不同 identity_key 的 SKU 不能混进同一组——拿 128G 的价和 256G 的价比是错的。 */
    @Test
    void differentSkuIdentitiesAreNotCompared() {
        UUID standard = standard("手机");
        UUID product = merchantProduct("商品", standard);
        // 两个 SKU：128G 和 256G，价格不同
        skus(product, "GTIN-128", 5_999_00L);
        skus(product, "GTIN-256", 6_999_00L);
        online(product);

        var view = standards.sameProduct(standard);

        assertThat(view.pricesBySpec()).as("两个规格两组，不合并").hasSize(2);
        assertThat(view.pricesBySpec())
                .extracting(spec -> spec.lowest().amount())
                .containsExactly(5_999_00L, 6_999_00L);
    }

    /** 已合并的标准品也能查：内部顺着 merged_into 找到终点。 */
    @Test
    void queryingAMergedStandardResolvesToTheTerminal() {
        UUID source = standard("源");
        UUID target = standard("目标");
        UUID product = merchantProduct("商品", target);
        online(product);
        standards.merge(source, target, Ids.newId());

        var view = standards.sameProduct(source);

        assertThat(view.standardSpuId()).as("返回的是终点，不是入参").isEqualTo(target);
        assertThat(view.offers()).hasSize(1);
    }

    /** 没在卖的商品不进比价——标准品列表是「现在能不能买」，不是「曾经有没有人卖」。 */
    @Test
    void offlineProductsDoNotAppearInOffers() {
        UUID standard = standard("型号");
        merchantProduct("下架的", standard);

        var view = standards.sameProduct(standard);

        assertThat(view.offers()).isEmpty();
        assertThat(view.pricesBySpec()).isEmpty();
    }

    /** 挂别家的商品：404，不是 403。 */
    @Test
    void bindingAnotherMerchantsProductIsNotFound() {
        UUID standard = standard("型号");
        UUID product = merchantProduct("商品", null);

        assertThatThrownBy(() -> standards.bind(product, Ids.newId(), standard))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("商品不存在或不属于当前商家");
    }

    // ── 造数 ──

    /** 造一个标准品（{@code spu_type = 'standard'}）。 */
    private UUID standard(String title) {
        UUID id = Ids.newId();
        jdbc.update(
                """
                INSERT INTO catalog.spu (id, spu_type, category_id, title, identity_kind, match_key)
                VALUES (?, 'standard', ?, ?, 'model_no', ?)
                """,
                id,
                leafCategory(),
                "std-test-" + title,
                "std-test-key-" + id);
        return id;
    }

    /** 造一个商家商品（{@code spu_type = 'merchant'}），可指定挂在哪个标准品上。 */
    private UUID merchantProduct(String title, UUID standardSpuId) {
        UUID id = Ids.newId();
        spus.insertSpu(
                id, Ids.newId(), leafCategory(), null, "std-test-" + title, null, true, null, IdentityKind.NONE, null);
        if (standardSpuId != null) {
            jdbc.update(
                    "UPDATE catalog.spu SET standard_spu_id = ?, standard_matched_by = 'model_no' WHERE id = ?",
                    standardSpuId,
                    id);
        }
        skus(id, null, 1_999_00L);
        return id;
    }

    /** 同上，但带一个指定 identity_key 和价格的 SKU（比价测试要它）。 */
    private UUID merchantProduct(String title, UUID standardSpuId, String identityKey, long priceAmount) {
        UUID id = merchantProduct(title, standardSpuId);
        // 覆盖掉 merchantProduct 里默认建的那个 SKU，换成带 identity_key 的
        jdbc.update("DELETE FROM catalog.sku WHERE spu_id = ?", id);
        skus(id, identityKey, priceAmount);
        return id;
    }

    /** 建一个 SKU。{@code identityKey} 传 null 表示认不出规格。 */
    private void skus(UUID spuId, String identityKey, long priceAmount) {
        jdbc.update(
                """
                INSERT INTO catalog.sku (id, spu_id, spec_values, spec_key, identity_key, price_amount, price_currency)
                VALUES (?, ?, CAST(? AS jsonb), ?, ?, ?, 'CNY')
                """,
                Ids.newId(),
                spuId,
                "{\"" + SPEC_ATTRIBUTE + "\":\"默认\"}",
                "k-" + Ids.newId(),
                identityKey,
                priceAmount);
    }

    /** 给商品挂一条 online listing，让它进「在卖」的范围。 */
    private void online(UUID spuId) {
        jdbc.update(
                "INSERT INTO catalog.listing (id, spu_id, merchant_id, shop_id, status) VALUES (?, ?, ?, ?, 'online')",
                Ids.newId(),
                spuId,
                merchantOf(spuId),
                Ids.newId());
    }

    private UUID merchantOf(UUID spuId) {
        return jdbc.queryForObject("SELECT merchant_id FROM catalog.spu WHERE id = ?", UUID.class, spuId);
    }

    private UUID standardOf(UUID spuId) {
        return jdbc.queryForObject("SELECT standard_spu_id FROM catalog.spu WHERE id = ?", UUID.class, spuId);
    }

    private UUID mergedInto(UUID spuId) {
        return jdbc.queryForObject("SELECT merged_into FROM catalog.spu WHERE id = ?", UUID.class, spuId);
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
                "INSERT INTO catalog.category (id, path, level, code, name) VALUES (?, ?, 1, ?, '标准品测试')",
                level1,
                "/" + level1 + "/",
                "std1-" + suffix);
        jdbc.update(
                "INSERT INTO catalog.category (id, parent_id, path, level, code, name) VALUES (?, ?, ?, 2, ?, '二级')",
                level2,
                level1,
                "/" + level1 + "/" + level2 + "/",
                "std2-" + suffix);
        jdbc.update(
                "INSERT INTO catalog.category (id, parent_id, path, level, code, name) VALUES (?, ?, ?, 3, ?, '叶子')",
                category,
                level2,
                "/" + level1 + "/" + level2 + "/" + category + "/",
                "std3-" + suffix);
        categoryAncestors = new UUID[] {level1, level2};
        return category;
    }
}
