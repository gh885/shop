package com.shop.platform.pricing.service;

import com.shop.platform.catalog.api.CatalogQuery;
import com.shop.platform.common.BusinessException;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.pricing.mapper.ShippingTemplateStore;
import com.shop.platform.pricing.model.Allocation;
import com.shop.platform.promotion.api.AppliedRule;
import com.shop.platform.promotion.api.PromotionQuery;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * 五层流水线的前四层：基础价、促销、分摊、运费。
 *
 * <p>这一层是<b>纯计算</b>：不写库，只吃 {@link CatalogQuery} 和 {@link PromotionQuery} 给的事实。
 * 同样的输入必须得到同样的输出，否则「同输入两次算价结果逐字节相同」那条验收根本做不到。
 * 落库与证据是 {@link PriceQuoteService} 的事。
 */
public final class QuoteCalculator {

    /**
     * 一行算完之后的样子，落库与出参都用它。
     *
     * <p>带商品快照（标题、图片、规格、类目、品牌），因为订单行要存"下单时是什么"，
     * 而 trade 不许回头查 catalog——那既是竞态，也让订单金额和商品状态脱钩。
     */
    public record ComputedLine(
            int lineNo,
            UUID offerId,
            UUID skuId,
            UUID spuId,
            UUID merchantId,
            UUID shopId,
            UUID categoryId,
            UUID brandId,
            int quantity,
            long unitAmount,
            String currency,
            Integer weightG,
            String title,
            String imageUrl,
            String specValuesJson,
            String identityKey,
            long subtotal,
            long discountAmount) {

        public long payable() {
            return subtotal - discountAmount;
        }
    }

    /** 一条规则的评估结果，直接映射到 {@code price_quote_rule} 一行。 */
    public record RuleOutcome(
            AppliedRule rule,
            String outcome,
            long baseAmount,
            Long requestedAmount,
            long amount,
            Map<Integer, Long> allocation) {}

    /** 每个商家一笔运费，映射到 {@code price_quote_shipping} 一行。 */
    public record MerchantShipping(
            UUID merchantId, UUID templateId, String chargeBy, Long weightG, long amount, boolean freeApplied) {}

    public record Result(
            List<ComputedLine> lines,
            List<RuleOutcome> outcomes,
            List<MerchantShipping> shipping,
            String currency,
            long goodsAmount,
            long discountAmount,
            long shippingAmount) {

        public long payable() {
            return goodsAmount - discountAmount + shippingAmount;
        }
    }

    private final CatalogQuery catalog;

    private final PromotionQuery promotions;

    private final ShippingTemplateStore templates;

    QuoteCalculator(CatalogQuery catalog, PromotionQuery promotions, ShippingTemplateStore templates) {
        this.catalog = Objects.requireNonNull(catalog, "catalog");
        this.promotions = Objects.requireNonNull(promotions, "promotions");
        this.templates = Objects.requireNonNull(templates, "templates");
    }

    Result calculate(PricingRequest request) {
        List<ComputedLine> lines = resolveLines(request);
        String currency = singleCurrency(lines);

        List<RuleOutcome> outcomes = new ArrayList<>();
        Map<Integer, Long> discounts = applyRules(lines, outcomes);

        List<ComputedLine> discounted = new ArrayList<>(lines.size());
        for (ComputedLine line : lines) {
            long discount = discounts.getOrDefault(line.lineNo(), 0L);
            if (discount > line.subtotal()) {
                // ck_line_disc / ck_line_payable 会兜住，但那时报的是约束名；这里给出可定位的一句话
                throw new IllegalStateException("分摊把行刷成负数了，line_no=" + line.lineNo() + " discount=" + discount
                        + " subtotal=" + line.subtotal());
            }
            discounted.add(new ComputedLine(
                    line.lineNo(),
                    line.offerId(),
                    line.skuId(),
                    line.spuId(),
                    line.merchantId(),
                    line.shopId(),
                    line.categoryId(),
                    line.brandId(),
                    line.quantity(),
                    line.unitAmount(),
                    line.currency(),
                    line.weightG(),
                    line.title(),
                    line.imageUrl(),
                    line.specValuesJson(),
                    line.identityKey(),
                    line.subtotal(),
                    discount));
        }

        List<MerchantShipping> shipping = computeShipping(discounted, request.address());

        long goods = discounted.stream().mapToLong(ComputedLine::subtotal).sum();
        long discountTotal =
                discounted.stream().mapToLong(ComputedLine::discountAmount).sum();
        long shippingTotal =
                shipping.stream().mapToLong(MerchantShipping::amount).sum();

        return new Result(discounted, outcomes, shipping, currency, goods, discountTotal, shippingTotal);
    }

    /**
     * 第 1 层：基础价。单价一律从 catalog 取——让调用方传价格，等于允许别处编价格。
     */
    private List<ComputedLine> resolveLines(PricingRequest request) {
        List<ComputedLine> lines = new ArrayList<>(request.lines().size());
        Set<Integer> seenLineNo = new HashSet<>();
        for (PricingRequest.Line line : request.lines()) {
            if (!seenLineNo.add(line.lineNo())) {
                throw BusinessException.badRequest("行号重复: " + line.lineNo());
            }
            CatalogQuery.SellableSku sku = catalog.findSellable(line.skuId())
                    .orElseThrow(() -> BusinessException.conflict("商品已下架或不可售: " + line.skuId()));
            // offerId / merchantId 是可选的校验位：给了就必须一致，没给就按 catalog 的来。
            // 这两个字段挡的是"用户看到的商品已经被换商家挂售"，不是必填项
            if (line.offerId() != null && !line.offerId().equals(sku.offerId())) {
                throw BusinessException.conflict("商品挂售已变化: " + line.skuId());
            }
            if (line.merchantId() != null && !sku.merchantId().equals(line.merchantId())) {
                throw BusinessException.conflict("商家与商品归属不一致: " + line.skuId());
            }
            lines.add(new ComputedLine(
                    line.lineNo(),
                    sku.offerId(),
                    sku.skuId(),
                    sku.spuId(),
                    sku.merchantId(),
                    sku.shopId(),
                    sku.categoryId(),
                    sku.brandId(),
                    line.quantity(),
                    sku.price().amount(),
                    sku.price().currency(),
                    sku.weightG(),
                    sku.title(),
                    sku.imageUrl(),
                    sku.specValuesJson(),
                    sku.identityKey(),
                    sku.price().amount() * line.quantity(),
                    0L));
        }
        return lines;
    }

    /** 多币种现在只有 CNY；混进第二种就直接拒，不做汇率。 */
    private String singleCurrency(List<ComputedLine> lines) {
        String currency = null;
        for (ComputedLine line : lines) {
            if (currency == null) {
                currency = line.currency();
            } else if (!currency.equals(line.currency())) {
                throw BusinessException.badRequest("一单只能有一种币种");
            }
        }
        return currency == null ? "CNY" : currency;
    }

    /**
     * 第 2、3 层：按优先级串行执行，每条规则减完立刻摊到行上。
     *
     * <p>串行而不是并行：券后的钱再打折才符合直觉，并行会减到负数。
     *
     * <p>两处必须显式：
     *
     * <ul>
     *   <li>{@code base_mode} 可配——满减看原价、券看余额，这是配置不是代码分支
     *   <li>{@code amount} 截断到 {@code base}——券比商品金额大时截断并记 {@code truncated}，不许出现负数行
     * </ul>
     */
    private Map<Integer, Long> applyRules(List<ComputedLine> lines, List<RuleOutcome> outcomes) {
        Map<Integer, Long> discountByLine = new HashMap<>();
        for (ComputedLine line : lines) {
            discountByLine.put(line.lineNo(), 0L);
        }

        List<UUID> categoryIds =
                lines.stream().map(ComputedLine::categoryId).distinct().toList();
        List<AppliedRule> rules = new ArrayList<>(promotions.effectiveRules(categoryIds, null));
        // 数值小 = 优先级高；平局按 ruleId 升序，保证稳定
        rules.sort(Comparator.comparingInt(AppliedRule::priority).thenComparing(AppliedRule::ruleId));

        Set<String> appliedGroups = new HashSet<>();
        for (AppliedRule rule : rules) {
            List<ComputedLine> scope = scopeOf(rule, lines);
            if (scope.isEmpty()) {
                continue;
            }

            long base = scope.stream()
                    .mapToLong(line -> rule.baseMode() == AppliedRule.BaseMode.ORIGINAL
                            ? line.subtotal()
                            : line.subtotal() - discountByLine.getOrDefault(line.lineNo(), 0L))
                    .sum();

            // 门槛先过、再判互斥：先按门槛筛掉不成立的，再在剩下的里按组取一条。
            // 反过来会让"第一条门槛不够"把整组都废掉，白丢能用的优惠
            if (rule.threshold() != null && base < rule.threshold()) {
                outcomes.add(new RuleOutcome(rule, "skipped", base, null, 0L, null));
                continue;
            }
            if (rule.mutexGroup() != null && appliedGroups.contains(rule.mutexGroup())) {
                outcomes.add(new RuleOutcome(rule, "skipped", base, null, 0L, null));
                continue;
            }

            long requested = requestedAmount(rule, base);
            long granted = Math.min(requested, base);
            if (granted <= 0) {
                outcomes.add(new RuleOutcome(rule, "skipped", base, requested, 0L, null));
                continue;
            }

            // 权重是 subtotal，不是余额：分摊算法本身与优惠类型、执行顺序无关
            List<Allocation.Item> items = new ArrayList<>(scope.size());
            for (ComputedLine line : scope) {
                items.add(new Allocation.Item(line.lineNo(), line.subtotal()));
            }
            Map<Integer, Long> allocation = Allocation.allocate(granted, items);
            allocation.forEach((lineNo, amount) -> discountByLine.merge(lineNo, amount, Long::sum));

            outcomes.add(new RuleOutcome(
                    rule, granted < requested ? "truncated" : "applied", base, requested, granted, allocation));

            if (rule.mutexGroup() != null) {
                appliedGroups.add(rule.mutexGroup());
            }
        }
        return discountByLine;
    }

    /**
     * 规则作用到哪些行。
     *
     * <p>{@code LINE} 表示"这条规则自己就是一行"，所以只在整单一行时生效；多行时跳过并在证据里留痕，
     * 而不是悄悄摊到全车。
     */
    private List<ComputedLine> scopeOf(AppliedRule rule, List<ComputedLine> lines) {
        return switch (rule.scope()) {
            case LINE -> lines.size() == 1 ? lines : List.of();
            case SELLER_ORDER, ORDER_GROUP -> lines;
        };
    }

    /** 按比例减是 {@code base × rateBp / 10000}，定额减直接取值。全整数，立刻落整。 */
    private long requestedAmount(AppliedRule rule, long base) {
        if (rule.fixedAmount() != null) {
            return rule.fixedAmount();
        }
        int rateBp = rule.rateBp() == null ? 0 : rule.rateBp();
        return base * rateBp / 10_000;
    }

    /**
     * 第 4 层：运费。<b>在分摊之后</b>，因为"满 99 包邮"的门槛要看折后金额。
     *
     * <p>门槛只看本商家行的折后金额：商品优惠不能抵扣运费，两条互不相通的钱。
     */
    private List<MerchantShipping> computeShipping(List<ComputedLine> lines, PricingRequest.Address address) {
        // 按店铺分组而不是按商家：模板归店铺，一个商家开两家店时是两套模板、两笔运费
        Map<UUID, List<ComputedLine>> byShop = new LinkedHashMap<>();
        for (ComputedLine line : lines) {
            byShop.computeIfAbsent(line.shopId(), key -> new ArrayList<>()).add(line);
        }

        List<MerchantShipping> result = new ArrayList<>(byShop.size());
        for (Map.Entry<UUID, List<ComputedLine>> entry : byShop.entrySet()) {
            UUID shopId = entry.getKey();
            List<ComputedLine> shopLines = entry.getValue();
            UUID merchantId = shopLines.getFirst().merchantId();
            long discountedGoods =
                    shopLines.stream().mapToLong(ComputedLine::payable).sum();

            ShippingTemplateStore.TemplateRow template = templates
                    .findActiveByShop(shopId)
                    .orElseThrow(() -> BusinessException.badRequest("店铺没有启用的运费模板: " + shopId));

            if (template.freeOver() != null && discountedGoods >= template.freeOver()) {
                result.add(new MerchantShipping(merchantId, template.id(), template.chargeBy(), null, 0L, true));
                continue;
            }

            boolean byWeight = "weight".equals(template.chargeBy());
            long weightG = shopLines.stream()
                    .mapToLong(line -> line.weightG() == null ? 0L : (long) line.weightG() * line.quantity())
                    .sum();
            int pieces = shopLines.stream().mapToInt(ComputedLine::quantity).sum();
            long fee = template.feeFor(address == null ? null : address.districtCode(), byWeight ? weightG : pieces);

            result.add(new MerchantShipping(
                    merchantId, template.id(), template.chargeBy(), byWeight ? weightG : null, fee, false));
        }
        return result;
    }
}
