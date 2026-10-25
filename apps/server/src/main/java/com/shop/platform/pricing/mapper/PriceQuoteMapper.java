package com.shop.platform.pricing.mapper;

import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.pricing.service.QuoteCalculator;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import tools.jackson.core.type.TypeReference;

/**
 * 报价单及其四张明细表的写入与点查。
 *
 * <p>所有 INSERT 都写全量证据：只存结果不存输入，投诉"运费为什么是 12 块"时还是查不清。
 */
@Mapper
public interface PriceQuoteMapper {

    @Insert(
            """
            INSERT INTO pricing.price_quote
                (id, buyer_id, status, fingerprint, shipping_address, entitlements, currency,
                 goods_amount, discount_amount, shipping_amount, payable_amount, rule_ids, expires_at)
            VALUES (#{id}, #{buyerId}, 'issued', #{fingerprint}, CAST(#{shippingAddress} AS jsonb),
                    CAST(#{entitlements} AS jsonb), #{currency}, #{goodsAmount}, #{discountAmount},
                    #{shippingAmount}, #{payableAmount}, CAST(#{ruleIds} AS uuid[]), #{expiresAt})
            """)
    int insertQuoteRow(
            @Param("id") UUID quoteId,
            @Param("buyerId") UUID buyerId,
            @Param("fingerprint") String fingerprint,
            @Param("shippingAddress") String shippingAddress,
            @Param("entitlements") String entitlements,
            @Param("currency") String currency,
            @Param("goodsAmount") long goodsAmount,
            @Param("discountAmount") long discountAmount,
            @Param("shippingAmount") long shippingAmount,
            @Param("payableAmount") long payableAmount,
            @Param("ruleIds") String ruleIdsLiteral,
            @Param("expiresAt") Instant expiresAt);

    @Insert(
            """
            <script>
            INSERT INTO pricing.price_quote_line
                (quote_id, line_no, listing_id, sku_id, merchant_id, shop_id, quantity, unit_amount,
                 weight_g, subtotal, discount_amount, payable_amount,
                 spu_id, category_id, brand_id, title, image_url, spec_values, identity_key)
            VALUES
            <foreach collection="lines" item="l" separator=",">
                (#{l.quoteId}, #{l.lineNo}, #{l.listingId}, #{l.skuId}, #{l.merchantId}, #{l.shopId}, #{l.quantity}, #{l.unitAmount},
                 #{l.weightG}, #{l.subtotal}, #{l.discountAmount}, #{l.payableAmount},
                 #{l.spuId}, #{l.categoryId}, #{l.brandId}, #{l.title}, #{l.imageUrl}, CAST(#{l.specValues} AS jsonb), #{l.identityKey})
            </foreach>
            </script>
            """)
    int insertLines(@Param("lines") List<LineParam> lines);

    @Insert(
            """
            <script>
            INSERT INTO pricing.price_quote_rule
                (quote_id, rule_id, rule_version, type, scope, bearer, outcome,
                 base_amount, threshold, requested_amount, amount, allocation)
            VALUES
            <foreach collection="rules" item="r" separator=",">
                (#{r.quoteId}, #{r.ruleId}, #{r.ruleVersion}, #{r.type}, #{r.scope}, #{r.bearer}, #{r.outcome},
                 #{r.baseAmount}, #{r.threshold}, #{r.requestedAmount}, #{r.amount}, CAST(#{r.allocation} AS jsonb))
            </foreach>
            </script>
            """)
    int insertRules(@Param("rules") List<RuleParam> rules);

    @Insert(
            """
            <script>
            INSERT INTO pricing.price_quote_shipping
                (quote_id, merchant_id, template_id, charge_by, weight_g, shipping_amount, free_applied)
            VALUES
            <foreach collection="shipping" item="s" separator=",">
                (#{s.quoteId}, #{s.merchantId}, #{s.templateId}, #{s.chargeBy}, #{s.weightG}, #{s.shippingAmount}, #{s.freeApplied})
            </foreach>
            </script>
            """)
    int insertShippingRows(@Param("shipping") List<ShippingParam> shipping);

    default void insertQuote(
            UUID quoteId,
            UUID buyerId,
            String fingerprint,
            String shippingAddress,
            String entitlements,
            QuoteCalculator.Result result,
            List<UUID> ruleIds,
            Instant expiresAt) {
        insertQuoteRow(
                quoteId,
                buyerId,
                fingerprint,
                shippingAddress,
                entitlements,
                result.currency(),
                result.goodsAmount(),
                result.discountAmount(),
                result.shippingAmount(),
                result.payableAmount(),
                toUuidArray(ruleIds),
                expiresAt);

        // 三张证据表都是纯 INSERT 没有前置条件，攒一批一次写入（多值 INSERT，一次 roundtrip）。
        // 一次试算 = 1 + N 行 + R 规则 + S 运费，逐条写的话 roundtrip 数随购物车线性涨
        if (!result.lines().isEmpty()) {
            List<LineParam> lines = new ArrayList<>(result.lines().size());
            for (QuoteCalculator.ComputedLine line : result.lines()) {
                lines.add(new LineParam(
                        quoteId,
                        line.lineNo(),
                        line.listingId(),
                        line.skuId(),
                        line.merchantId(),
                        line.shopId(),
                        line.quantity(),
                        line.unitAmount(),
                        line.weightG(),
                        line.subtotal(),
                        line.discountAmount(),
                        line.subtotal() - line.discountAmount(),
                        line.spuId(),
                        line.categoryId(),
                        line.brandId(),
                        line.title(),
                        line.imageUrl(),
                        line.specValuesJson() == null ? "{}" : line.specValuesJson(),
                        line.identityKey()));
            }
            insertLines(lines);
        }

        if (!result.outcomes().isEmpty()) {
            List<RuleParam> rules = new ArrayList<>(result.outcomes().size());
            for (QuoteCalculator.RuleOutcome outcome : result.outcomes()) {
                rules.add(new RuleParam(
                        quoteId,
                        outcome.rule().ruleId(),
                        outcome.rule().ruleVersion(),
                        outcome.rule().type(),
                        outcome.rule().scope().name().toLowerCase(Locale.ROOT),
                        outcome.rule().bearer().name().toLowerCase(Locale.ROOT),
                        outcome.outcome(),
                        outcome.baseAmount(),
                        outcome.rule().threshold(),
                        outcome.requestedAmount(),
                        outcome.amount(),
                        outcome.allocation() == null ? null : JsonColumns.write(outcome.allocation())));
            }
            insertRules(rules);
        }

        if (!result.shipping().isEmpty()) {
            List<ShippingParam> shipping = new ArrayList<>(result.shipping().size());
            for (QuoteCalculator.MerchantShipping item : result.shipping()) {
                shipping.add(new ShippingParam(
                        quoteId,
                        item.merchantId(),
                        item.templateId(),
                        item.chargeBy(),
                        item.weightG(),
                        item.amount(),
                        item.freeApplied()));
            }
            insertShippingRows(shipping);
        }
    }

    /**
     * 落单时的 CAS。影响 0 行 = 这张报价刚被别的请求用掉了，拒单。
     *
     * <p>必须和插单在同一个事务，不能先置 used 再让 trade 落单——插单失败就白烧一张报价。
     * 返回 false = 这张报价已经 used 或过期了。
     */
    @Update(
            """
            UPDATE pricing.price_quote SET status = 'used'
             WHERE id = #{id} AND status = 'issued' AND expires_at > now()
            """)
    boolean consume(@Param("id") UUID quoteId);

    @Select(
            """
            SELECT id, buyer_id, status, fingerprint, currency,
                   goods_amount, discount_amount, shipping_amount, payable_amount, expires_at
              FROM pricing.price_quote
             WHERE id = #{id}
            """)
    Optional<QuoteRow> find(@Param("id") UUID quoteId);

    /** 逐行金额，按 {@code line_no} 升序。 */
    @Select(
            """
            SELECT line_no, listing_id, sku_id, spu_id, merchant_id, shop_id, category_id, brand_id,
                   quantity, unit_amount, weight_g, subtotal, discount_amount, payable_amount,
                   title, image_url, CAST(spec_values AS text) AS spec_values_json, identity_key
              FROM pricing.price_quote_line
             WHERE quote_id = #{quoteId}
             ORDER BY line_no
            """)
    List<LineRow> findLines(@Param("quoteId") UUID quoteId);

    /** 只捞真减了钱的规则：skipped 的 allocation 是 null，也进不了分红。 */
    @Select(
            """
            SELECT rule_id, rule_version, type, bearer, CAST(allocation AS text) AS allocation
              FROM pricing.price_quote_rule
             WHERE quote_id = #{quoteId} AND outcome IN ('applied', 'truncated') AND allocation IS NOT NULL
            """)
    List<RuleRaw> findRuleRaws(@Param("quoteId") UUID quoteId);

    /**
     * 分摊矩阵，按 {@code line_no} 归到每条规则下。
     *
     * <p>{@code allocation} 存成 jsonb 而不是独立表——它是整体证据，从不单独查询。这里读出来转成
     * {@code Map<Integer, Long>}，交给调用方按行贴。
     */
    default List<RuleRow> findRules(UUID quoteId) {
        return findRuleRaws(quoteId).stream()
                .map(raw -> new RuleRow(
                        raw.ruleId(),
                        raw.ruleVersion(),
                        raw.type(),
                        raw.bearer(),
                        JsonColumns.read(raw.allocation(), new TypeReference<LinkedHashMap<String, Long>>() {})))
                .toList();
    }

    @Select(
            """
            SELECT merchant_id, shipping_amount
              FROM pricing.price_quote_shipping
             WHERE quote_id = #{quoteId}
             ORDER BY merchant_id
            """)
    List<ShippingRow> findShipping(@Param("quoteId") UUID quoteId);

    /**
     * 过期试算落个终态：{@code expired} 之后 consume 的 CAS 和读侧都不会再碰它。
     * 没有 status 语义需要它，但让人一眼看得出"这张报价为什么死了"。
     */
    @Update("UPDATE pricing.price_quote SET status = 'expired'"
            + " WHERE status = 'issued' AND expires_at < now() - interval '7 days'")
    int expireStale();

    /** 证据留存期一到就删。三张子表没有外键，先删子表再删主表。 */
    @Delete("DELETE FROM pricing.price_quote_line"
            + " WHERE quote_id IN (SELECT id FROM pricing.price_quote WHERE created_at < #{cutoff})")
    int purgeLines(@Param("cutoff") Instant cutoff);

    @Delete("DELETE FROM pricing.price_quote_rule"
            + " WHERE quote_id IN (SELECT id FROM pricing.price_quote WHERE created_at < #{cutoff})")
    int purgeRules(@Param("cutoff") Instant cutoff);

    @Delete("DELETE FROM pricing.price_quote_shipping"
            + " WHERE quote_id IN (SELECT id FROM pricing.price_quote WHERE created_at < #{cutoff})")
    int purgeShipping(@Param("cutoff") Instant cutoff);

    @Delete("DELETE FROM pricing.price_quote WHERE created_at < #{cutoff}")
    int purgeQuotes(@Param("cutoff") Instant cutoff);

    /**
     * 清理过期的报价证据。
     *
     * <p>这是全库写入量最大的表族（每次试算 N 行证据），不清理就是无界增长。
     *
     * @return 删掉的报价张数（子表行数不计）
     */
    default int purgeExpired(Instant cutoff) {
        expireStale();
        purgeLines(cutoff);
        purgeRules(cutoff);
        purgeShipping(cutoff);
        return purgeQuotes(cutoff);
    }

    /**
     * Postgres 的 {@code uuid[]} 用文本字面量传，比纠结 {@code setArray} 的驱动差异稳。
     *
     * <p>这里传 {@code '{...}'} 字面量，SQL 里是 {@code CAST(#{x} AS uuid[])}。
     */
    static String toUuidArray(List<UUID> ids) {
        if (ids.isEmpty()) {
            return "{}";
        }
        return "{"
                + ids.stream()
                        .map(UUID::toString)
                        .reduce((left, right) -> left + "," + right)
                        .orElse("") + "}";
    }

    /** 批量参数行：payableAmount 由 subtotal − discountAmount 算死在 default 方法里，specValues 空补 {}。 */
    record LineParam(
            UUID quoteId,
            int lineNo,
            UUID listingId,
            UUID skuId,
            UUID merchantId,
            UUID shopId,
            int quantity,
            long unitAmount,
            Integer weightG,
            long subtotal,
            long discountAmount,
            long payableAmount,
            UUID spuId,
            UUID categoryId,
            UUID brandId,
            String title,
            String imageUrl,
            String specValues,
            String identityKey) {}

    record RuleParam(
            UUID quoteId,
            UUID ruleId,
            String ruleVersion,
            String type,
            String scope,
            String bearer,
            String outcome,
            long baseAmount,
            Long threshold,
            Long requestedAmount,
            long amount,
            String allocation) {}

    record ShippingParam(
            UUID quoteId,
            UUID merchantId,
            UUID templateId,
            String chargeBy,
            Long weightG,
            long shippingAmount,
            boolean freeApplied) {}

    record LineRow(
            int lineNo,
            UUID listingId,
            UUID skuId,
            UUID spuId,
            UUID merchantId,
            UUID shopId,
            UUID categoryId,
            UUID brandId,
            int quantity,
            long unitAmount,
            Integer weightG,
            long subtotal,
            long discountAmount,
            long payableAmount,
            String title,
            String imageUrl,
            String specValuesJson,
            String identityKey) {}

    record RuleRow(UUID ruleId, String ruleVersion, String type, String bearer, Map<String, Long> allocation) {}

    record RuleRaw(UUID ruleId, String ruleVersion, String type, String bearer, String allocation) {}

    record ShippingRow(UUID merchantId, long shippingAmount) {}

    record QuoteRow(
            UUID id,
            UUID buyerId,
            String status,
            String fingerprint,
            String currency,
            long goodsAmount,
            long discountAmount,
            long shippingAmount,
            long payableAmount,
            Instant expiresAt) {

        public Map<String, Object> totals() {
            return Map.of(
                    "goods", goodsAmount,
                    "discount", discountAmount,
                    "shipping", shippingAmount,
                    "payableAmount", payableAmount);
        }
    }
}
