package com.shop.platform.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.catalog.dto.SellerProductDetail;
import com.shop.platform.catalog.dto.UpdateProductRequest;
import com.shop.platform.catalog.mapper.ListingMapper;
import com.shop.platform.catalog.mapper.SkuMapper;
import com.shop.platform.catalog.mapper.SpuMapper;
import com.shop.platform.catalog.model.IdentityKind;
import com.shop.platform.catalog.service.SellerProductEditService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.testsupport.IntegrationTest;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 商品编辑：归属隔离、改完要不要重审、SKU 全量替换语义、删草稿的边界。
 *
 * <p>用真库：这里验的四件事（{@code WHERE merchant_id = ?} 的归属隔离、
 * {@code NOT EXISTS} 的删草稿条件、{@code status} 的 CAS 条件更新、停售 vs 删行对历史的影响）
 * 全是数据库行为，mock 掉等于什么都没验。
 *
 * <p><b>不验 HTTP 层。</b> controller 只做 {@code authorizer.check} + 转发，
 * 真正的判断都在 service 里；用 MockMvc 会把「Spring Security 怎么注入 operator」也拖进来，
 * 而那套已有专门的 {@code WebControllerTestSupport} 覆盖。
 */
class SellerProductEditTest extends IntegrationTest {

    @Autowired
    private SellerProductEditService products;

    @Autowired
    private SpuMapper spus;

    @Autowired
    private SkuMapper skus;

    @Autowired
    private ListingMapper listings;

    /** 规格维度用的假属性 id：{@code specKey} 只要求 specs 非空，不校验 attributeId 是否真实存在。 */
    private static final UUID SPEC_ATTRIBUTE = UUID.fromString("00000000-0000-0000-0000-000000000001");

    private UUID merchant;
    private UUID shop;
    private UUID spu;
    private UUID category;

    private UUID[] categoryAncestors = new UUID[0];
    /** 别家商家查不到——404 而不是 403，403 本身就是「这个 id 存在」的确认。 */
    @Test
    void anotherMerchantCannotSeeTheProduct() {
        draftSpu();

        assertThatThrownBy(() -> products.detail(spu, seller(Ids.newId())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("商品不存在");
    }

    /** 卖家详情任何状态可读：草稿也要看得见（买家侧详情查不到它）。 */
    @Test
    void theSellerCanReadADraft() {
        draftSpu();

        SellerProductDetail detail = products.detail(spu, seller(merchant));

        assertThat(detail.title()).isEqualTo("测试商品");
        assertThat(detail.listingStatus()).as("草稿还没提交过挂售").isNull();
        assertThat(detail.skus()).hasSize(1);
        assertThat(detail.skus().getFirst().status()).isEqualTo("active", null, null);
    }

    /** 改标题：属性全量替换、识别键重算、审计落地。 */
    @Test
    void updatingBasicsReplacesTitleAndKeepsSkus() {
        draftSpu();

        var updated = products.updateBasics(
                spu,
                new UpdateProductRequest(
                        "改过的标题", null, null, null, null, List.of(), List.of("https://img/1.png"), List.of(), List.of()),
                seller(merchant));

        assertThat(updated.title()).isEqualTo("改过的标题");
        assertThat(updated.images()).containsExactly("https://img/1.png");
        assertThat(updated.skus()).as("改基本信息不动 SKU").hasSize(1);
        assertThat(jdbc.queryForObject("SELECT title FROM catalog.spu WHERE id = ?", String.class, spu))
                .isEqualTo("改过的标题");
    }

    /**
     * 改已上架商品 → 退回 pending 重新审核。
     *
     * <p>这条是整个编辑链路最重要的不变式：不加它，「先上架合规商品、再改成违规商品」
     * 就是一条绕过审核的路，而平台侧完全看不见（状态一直显示 online）。
     */
    @Test
    void editingAnOnlineProductSendsItBackForReview() {
        onlineSpu(false);

        var updated = products.updateBasics(
                spu,
                new UpdateProductRequest("偷偷改的标题", null, null, null, null, List.of(), List.of(), List.of(), List.of()),
                seller(merchant));

        assertThat(updated.listingStatus()).as("已上架商品被编辑后必须退回审核，否则编辑就是绕过审核的开关").isEqualTo("pending");
        assertThat(jdbc.queryForObject("SELECT status FROM catalog.listing WHERE spu_id = ?", String.class, spu))
                .isEqualTo("pending");
    }

    /** 审核中的商品拒改：审核员看的那一版和商家提交的那一版必须一致。 */
    @Test
    void editingAPendingProductIsRejected() {
        onlineSpu(false);
        jdbc.update("UPDATE catalog.listing SET status = 'pending' WHERE spu_id = ?", spu);

        assertThatThrownBy(() -> products.updateBasics(
                        spu,
                        new UpdateProductRequest(
                                "审核中改标题", null, null, null, null, List.of(), List.of(), List.of(), List.of()),
                        seller(merchant)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("正在审核中");
    }

    /**
     * 改 SKU：<b>请求里没给的 SKU 一律停售</b>。
     *
     * <p>这条语义与「改价」的直觉相反，但增量语义下商家删掉的规格会永远活着——
     * 继续出现在可售点查里，买家能买到商家以为已经删掉的规格。
     */
    @Test
    void skusNotInTheRequestAreDisabled() {
        draftSpu();
        UUID secondSku = Ids.newId();
        skus.insertSku(
                secondSku,
                spu,
                merchant,
                Map.of(SPEC_ATTRIBUTE, "另一个"),
                Money.cny(2999L),
                null,
                null,
                null,
                null,
                null);
        UUID firstSku = jdbc.queryForObject(
                "SELECT id FROM catalog.sku WHERE spu_id = ? AND id <> ?", UUID.class, spu, secondSku);

        products.updateSkus(
                spu,
                List.of(new UpdateProductRequest.SkuRequest(firstSku, Money.cny(888L), 500, "active", null, null)),
                seller(merchant));

        assertThat(jdbc.queryForObject("SELECT price_amount FROM catalog.sku WHERE id = ?", Long.class, firstSku))
                .as("给了的 SKU 按请求改价")
                .isEqualTo(888L);
        assertThat(jdbc.queryForObject("SELECT status FROM catalog.sku WHERE id = ?", String.class, secondSku))
                .as("没给的 SKU 停售，不是留着继续卖")
                .isEqualTo("disabled");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM catalog.sku WHERE spu_id = ?", Long.class, spu))
                .as("停售不删行——order_line 还指着这些 id")
                .isEqualTo(2L);
    }

    /** 一个 SKU 都不留就是商品卖不了，拒掉。 */
    @Test
    void disablingEverySkuIsRejected() {
        draftSpu();

        assertThatThrownBy(() -> products.updateSkus(spu, List.of(), seller(merchant)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("至少要保留一个 SKU");
    }

    /** 传了别家的 SKU id：404 说清是「不是这个商品的」，不是「刚被改过」。 */
    @Test
    void aSkuFromAnotherProductIsNotFound() {
        draftSpu();

        assertThatThrownBy(() -> products.updateSkus(
                        spu,
                        List.of(new UpdateProductRequest.SkuRequest(
                                Ids.newId(), Money.cny(100L), null, "active", null, null)),
                        seller(merchant)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("SKU 不属于这个商品");
    }

    /** 同一个 SKU 传两次：409，不是静默按最后一次生效。 */
    @Test
    void theSameSkuTwiceIsRejected() {
        draftSpu();
        UUID skuId = jdbc.queryForObject("SELECT id FROM catalog.sku WHERE spu_id = ?", UUID.class, spu);

        assertThatThrownBy(() -> products.updateSkus(
                        spu,
                        List.of(
                                new UpdateProductRequest.SkuRequest(skuId, Money.cny(100L), null, "active", null, null),
                                new UpdateProductRequest.SkuRequest(
                                        skuId, Money.cny(200L), null, "active", null, null)),
                        seller(merchant)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("出现了两次");
    }

    /** 非法 SKU 状态：400，不是让数据库 CHECK 报 500。 */
    @Test
    void anUnknownSkuStatusIsRejectedBeforeTheDatabase() {
        draftSpu();
        UUID skuId = jdbc.queryForObject("SELECT id FROM catalog.sku WHERE spu_id = ?", UUID.class, spu);

        assertThatThrownBy(() -> products.updateSkus(
                        spu,
                        List.of(new UpdateProductRequest.SkuRequest(
                                skuId, Money.cny(100L), null, "sold_out", null, null)),
                        seller(merchant)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("只能是 active / disabled");
    }

    /**
     * 删草稿：真的删干净（子表一起走）。
     *
     * <p>本库不建外键，所以数据库不会替你挡——子表不删就是永久的孤儿行。
     */
    @Test
    void deletingADraftRemovesItsChildren() {
        draftSpu();
        jdbc.update(
                "INSERT INTO catalog.spu_media (id, spu_id, url) VALUES (?, ?, 'https://img/x.png')", Ids.newId(), spu);

        products.deleteDraft(spu, seller(merchant));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM catalog.spu WHERE id = ?", Long.class, spu))
                .isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM catalog.sku WHERE spu_id = ?", Long.class, spu))
                .isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM catalog.spu_media WHERE spu_id = ?", Long.class, spu))
                .isZero();
        spu = null;
    }

    /**
     * 提交过挂售的商品删不掉——哪怕是草稿状态。
     *
     * <p>驳回理由和轮次都在 {@code listing_review} 里，删了 SPU 会让这些行悬空，
     * 而商家看到的是「我明明提交过，怎么什么都没有了」。
     */
    @Test
    void aProductWithAListingCannotBeDeleted() {
        draftSpu();
        listings.insert(Ids.newId(), spu, merchant, shop);

        assertThatThrownBy(() -> products.deleteDraft(spu, seller(merchant)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("提交过挂售");
    }

    /** 下架：只有 online 能下。 */
    @Test
    void onlyAnOnlineProductCanBeTakenOffline() {
        draftSpu();
        listings.insert(Ids.newId(), spu, merchant, shop);

        assertThatThrownBy(() -> products.offline(spu, "不卖了", seller(merchant)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("没有已上架的 listing 可下架");
    }

    /** 下架后重新提交：回 pending，不是直接回 online（免审类目除外，见下一个测试）。 */
    @Test
    void relistingGoesBackToReview() {
        onlineSpu(false);
        products.offline(spu, "不卖了", seller(merchant));

        var relisted = products.relist(spu, seller(merchant));

        assertThat(relisted.listingStatus()).isEqualTo("pending");
    }

    /** 免审类目下重新提交一路推到 online，商家感觉不到差别。 */
    @Test
    void relistingInAnAutoApproveCategoryComesBackOnline() {
        onlineSpu(true);
        products.offline(spu, "不卖了", seller(merchant));

        var relisted = products.relist(spu, seller(merchant));

        assertThat(relisted.listingStatus()).isEqualTo("online");
    }

    /**
     * 改了识别键之后认不出新键：旧的标准品挂载必须被清掉。
     *
     * <p>不加这一步的后果：商品已经叫另一个名字了，却还挂在**旧识别键的标准品**上——
     * 于是它出现在一个与它无关的比价列表里，而两边都看不出错在哪。
     * {@code ck_spu_matched} 只校验 {@code standard_matched_by} 的枚举值，拦不住这个。
     */
    @Test
    void editingBasicsClearsAStaleStandardLinkWhenTheNewKeyIsUnrecognizable() {
        draftSpu();
        UUID staleStandard = Ids.newId();
        jdbc.update(
                """
                INSERT INTO catalog.spu (id, spu_type, category_id, title, identity_kind, match_key)
                VALUES (?, 'standard', ?, '旧标准品', 'model_no', ?)
                """,
                staleStandard,
                category,
                "stale-" + staleStandard);
        jdbc.update(
                "UPDATE catalog.spu SET standard_spu_id = ?, standard_matched_by = 'model_no' WHERE id = ?",
                staleStandard,
                spu);

        // 类目 identity_keys 是 none，所以改完之后认不出任何识别键
        products.updateBasics(
                spu,
                new UpdateProductRequest("改过名字", null, null, null, null, List.of(), List.of(), List.of(), List.of()),
                seller(merchant));

        assertThat(jdbc.queryForObject("SELECT standard_spu_id FROM catalog.spu WHERE id = ?", UUID.class, spu))
                .as("认不出新键就不能继续挂在旧键的标准品上")
                .isNull();
        assertThat(jdbc.queryForObject("SELECT standard_matched_by FROM catalog.spu WHERE id = ?", String.class, spu))
                .as("留一个「按型号匹配」的标记而指向 NULL 是一条自己说不通的脏数据")
                .isNull();
        jdbc.update("DELETE FROM catalog.spu WHERE id = ?", staleStandard);
    }

    // ── 造数 ──

    private CurrentOperator seller(UUID merchantId) {
        return new CurrentOperator(
                Ids.newId(), CurrentOperator.TYPE_SELLER, merchantId, Set.of(shop), Set.of("product:write"));
    }

    /**
     * 一个草稿 SPU + 一个 active SKU，没有 listing。
     *
     * <p>顺带把商家的售卖资格造出来（{@code seller_profile} + {@code category_grant}）：
     * 编辑链路会重跑发布闸门 {@code governance.canSell}，没有资格的商品改不动。
     * 这是对的——「建的时候有资格、改的时候没有」不该被允许。
     */
    private void draftSpu() {
        merchant = Ids.newId();
        shop = Ids.newId();
        spu = Ids.newId();
        UUID leaf = leafCategory();
        grantEligibility(leaf);
        spus.insertSpu(spu, merchant, leaf, null, "测试商品", null, true, null, IdentityKind.NONE, null);
        skus.insertSku(
                Ids.newId(),
                spu,
                merchant,
                Map.of(SPEC_ATTRIBUTE, "默认"),
                Money.cny(1999L),
                null,
                null,
                null,
                null,
                null);
    }

    /** 一个已上架的 SPU：草稿 + online listing。 */
    private void onlineSpu(boolean autoApprove) {
        draftSpu();
        jdbc.update("UPDATE catalog.category_config SET auto_approve = ? WHERE category_id = ?", autoApprove, category);
        jdbc.update(
                "INSERT INTO catalog.listing (id, spu_id, merchant_id, shop_id, status) VALUES (?, ?, ?, ?, 'online')",
                Ids.newId(),
                spu,
                merchant,
                shop);
    }

    /**
     * 造一个可配置的三层叶子类目。
     *
     * <p>必须造满三层：{@code ck_category_path_shape} 要求 {@code path} 以 {@code /id/} 结尾、
     * 且段数等于 {@code level}。{@code category_config} 还必须有一行——
     * 否则 {@code requireConfig} 会回「类目还没配置」。
     */
    /** 造出「这家商家现在有资格卖这个类目」：profile active + category_grant active。 */
    private void grantEligibility(UUID categoryId) {
        jdbc.update(
                "INSERT INTO governance.seller_profile (merchant_id, status, level, points_12m) VALUES (?, 'active', 'L1', 100)",
                merchant);
        jdbc.update(
                """
                INSERT INTO governance.category_grant
                    (id, merchant_id, category_id, status, source, granted_at)
                VALUES (?, ?, ?, 'active', 'platform', now())
                """,
                Ids.newId(),
                merchant,
                categoryId);
    }

    private UUID leafCategory() {
        if (category != null) {
            return category;
        }
        UUID level1 = Ids.newId();
        UUID level2 = Ids.newId();
        category = Ids.newId();
        String suffix = category.toString().substring(0, 8);

        jdbc.update(
                "INSERT INTO catalog.category (id, path, level, code, name) VALUES (?, ?, 1, ?, '编辑测试')",
                level1,
                "/" + level1 + "/",
                "edit1-" + suffix);
        jdbc.update(
                "INSERT INTO catalog.category (id, parent_id, path, level, code, name) VALUES (?, ?, ?, 2, ?, '编辑测试二级')",
                level2,
                level1,
                "/" + level1 + "/" + level2 + "/",
                "edit2-" + suffix);
        jdbc.update(
                "INSERT INTO catalog.category (id, parent_id, path, level, code, name) VALUES (?, ?, ?, 3, ?, '编辑测试叶子')",
                category,
                level2,
                "/" + level1 + "/" + level2 + "/" + category + "/",
                "edit3-" + suffix);
        categoryAncestors = new UUID[] {level1, level2};

        jdbc.update(
                """
                INSERT INTO catalog.category_config
                    (category_id, identity_keys, sku_identity_kinds, brand_policy, auto_approve, qualification_codes)
                VALUES (?, ARRAY['none'], ARRAY['none'], 'optional', true, ARRAY[]::text[])
                """,
                category);
        // 规格属性必须真实存在：提交 / 重新上架现在会复验存量 SKU 的规格维度
        jdbc.update(
                """
                INSERT INTO catalog.attribute
                    (id, category_id, code, name, value_type, is_sales_spec, is_required, is_identity,
                     is_filterable, is_multi, status, sort)
                VALUES (?, ?, 'spec', '规格', 'text', true, false, false, false, false, 'active', 0)
                """,
                SPEC_ATTRIBUTE,
                category);
        return category;
    }
}
