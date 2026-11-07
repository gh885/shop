package com.shop.platform.catalog.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.catalog.dto.SameProductView;
import com.shop.platform.catalog.dto.SameProductView.Offer;
import com.shop.platform.catalog.dto.SameProductView.Quote;
import com.shop.platform.catalog.dto.SameProductView.SpecPrices;
import com.shop.platform.catalog.dto.StandardSpuView;
import com.shop.platform.catalog.mapper.StandardPriceReadMapper;
import com.shop.platform.catalog.mapper.StandardPriceReadMapper.PriceOfferRow;
import com.shop.platform.catalog.mapper.StandardSpuMapper;
import com.shop.platform.catalog.mapper.StandardSpuMapper.StandardSpuRow;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.money.Money;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 标准品的运营与消费。
 *
 * <p>两半：
 *
 * <ul>
 *   <li><b>运营侧</b>（{@link #merge} / {@link #list} / {@link #bind}）：错配收口、人工挂靠
 *   <li><b>消费侧</b>（{@link #sameProduct}）：同款聚合与按规格比价。
 *       这是 {@code standard_spu_id} 的第一个真实读方——在此之前那一列只写不读，
 *       标准品对系统行为零影响
 * </ul>
 *
 * <h2>合并的语义</h2>
 *
 * <p>「A 并入 B」做三件事，同一个事务：
 *
 * <ol>
 *   <li>挂 A 的商家 SPU 全部改指 B（一条 UPDATE，不逐行读改写）
 *   <li>A 记下 {@code merged_into = B}（条件更新，0 行 = 已被别人并走）
 *   <li><b>不物理删 A</b>——历史「当时挂的是哪个标准品」要能查回去，合并错了也要能反着搬
 * </ol>
 *
 * <p><b>为什么合并是必要的而不是洁癖。</b> 自动匹配只做精确匹配（型号 / 款号 / 参数哈希全等），
 * 而现实里同一个东西会有多种写法：{@code A3294} 和 {@code A-3294} 是两个键，就会长出两个标准品。
 * 没有合并，这两个永远各自为政，同款聚合把它们当成两个不同的东西——而那正是标准品要解决的问题。
 */
@Component
public class StandardProductService {

    /** 一个规格下最多给几家报价。一个热门型号可能有上百家，详情页只需要最便宜的几家。 */
    private static final int QUOTES_PER_SPEC = 5;

    /** 同款商品最多列多少个。超过这个数就不是「同款」了，是「同类」。 */
    private static final int OFFERS_MAX = 50;

    /** 运营列表一次最多拉多少条。 */
    private static final int LIST_LIMIT = 100;

    private final StandardSpuMapper standards;
    private final StandardPriceReadMapper prices;
    private final AuditCommand audit;

    public StandardProductService(StandardSpuMapper standards, StandardPriceReadMapper prices, AuditCommand audit) {
        this.standards = Objects.requireNonNull(standards, "standards");
        this.prices = Objects.requireNonNull(prices, "prices");
        this.audit = Objects.requireNonNull(audit, "audit");
    }

    // ── 运营侧 ──

    /** 运营列表。默认含已合并的——合并错了要能顺着 {@code mergedInto} 查回去。 */
    @Transactional(readOnly = true)
    public List<StandardSpuView> list(UUID categoryId, String keyword, boolean includeMerged) {
        return standards.list(categoryId, keyword, includeMerged, LIST_LIMIT).stream()
                .map(StandardProductService::toView)
                .toList();
    }

    /** 卖家挂靠候选：只出可用的（已合并的不出现）。 */
    @Transactional(readOnly = true)
    public List<StandardSpuView.Candidate> candidates(UUID categoryId, String keyword) {
        return standards.list(categoryId, keyword, false, LIST_LIMIT).stream()
                .map(row -> new StandardSpuView.Candidate(row.spuId(), row.title(), row.modelNo(), row.boundCount()))
                .toList();
    }

    /**
     * 合并：{@code sourceId} 并入 {@code targetId}。
     *
     * <p><b>两个都必须是「还没被合并」的标准品。</b> 允许合并到一个已合并的目标上，
     * 就会造出 A→B→C 的链，而所有消费方都得解链（现在解链逻辑只在一处，
     * 但每多一处读 {@code standard_spu_id} 就多一处要记得解）。
     * 所以这里先顺着链找到终点，再要求「终点就是入参本身」——即目标必须已经是终点。
     *
     * <p><b>顺序是「先改指、再标记」。</b> 反过来的话，中间那个瞬间会有商家 SPU 指向一个
     * 已标记合并的行，而那时事务还没提交——虽然外部看不见，但如果有触发器或约束
     * 去校验「已合并的行不该被挂靠」，就会在事务内误报。
     */
    @Transactional
    public StandardSpuView merge(UUID sourceId, UUID targetId, UUID operatorId) {
        if (sourceId.equals(targetId)) {
            throw BusinessException.badRequest("不能把标准品并入自己");
        }
        StandardSpuRow source = requireStandard(sourceId);
        StandardSpuRow target = requireStandard(targetId);
        if (!source.categoryId().equals(target.categoryId())) {
            throw BusinessException.badRequest(ErrorCodes.STANDARD_CATEGORY_MISMATCH, "只能合并同类目的标准品，两个标准品分属不同类目");
        }

        UUID sourceFinal = resolveTerminal(sourceId);
        UUID targetFinal = resolveTerminal(targetId);
        if (!sourceFinal.equals(sourceId)) {
            throw BusinessException.conflict("STANDARD_ALREADY_MERGED", "源标准品已被合并到 " + sourceFinal + "，请直接操作它");
        }
        if (!targetFinal.equals(targetId)) {
            throw BusinessException.conflict("STANDARD_ALREADY_MERGED", "目标标准品已被合并到 " + targetFinal + "，请直接合并到它");
        }

        int repointed = standards.repointBound(sourceId, targetId);
        if (standards.markMerged(sourceId, targetId) == 0) {
            // 条件更新 0 行：并发下另一个运营刚把它并走了。0 行是判决，不是异常
            throw BusinessException.conflict("STANDARD_MERGE_CONFLICT", "标准品刚被别的请求合并过，请刷新后重试");
        }
        audit.record(AuditEntry.byStaff(
                "catalog.standard.merged",
                "spu",
                sourceId.toString(),
                operatorId,
                source.mergedInto() == null ? null : source.mergedInto(),
                Map.of(
                        "mergedInto", FieldChange.to(targetId),
                        "repointedProducts", FieldChange.to(repointed),
                        "sourceTitle", FieldChange.to(source.title()),
                        "targetTitle", FieldChange.to(target.title()))));
        return standards.find(targetId).map(StandardProductService::toView).orElseThrow();
    }

    /**
     * 卖家手动挂靠 / 取消挂靠（{@code standardSpuId} 传 null 即取消）。
     *
     * <p><b>只校验「这个商品是本商家的」与「目标标准品可用」，不校验两者类目一致。</b>
     * 商家挂错类目是常事，用类目做硬闸会让正确的挂靠也挂不上；而挂靠是卖家自己的聚合声明，
     * 平台事后可以改，不值得在入口处硬拦。
     *
     * <p>取消挂靠（传 null）不校验目标存在——取消一个已经被合并掉的标准品是合法操作，
     * 而且恰恰是最该允许的：那条标准品已经不用了。
     */
    @Transactional
    public void bind(UUID spuId, UUID merchantId, UUID standardSpuId) {
        if (standardSpuId != null) {
            requireStandard(standardSpuId);
            UUID terminal = resolveTerminal(standardSpuId);
            if (!terminal.equals(standardSpuId)) {
                throw BusinessException.conflict("STANDARD_ALREADY_MERGED", "标准品已被合并到 " + terminal + "，请挂靠它");
            }
        }
        if (standards.bind(spuId, merchantId, standardSpuId) == 0) {
            throw BusinessException.notFound("商品不存在或不属于当前商家: " + spuId);
        }
        audit.record(AuditEntry.byMerchant(
                "catalog.standard.bound",
                "spu",
                spuId.toString(),
                merchantId,
                Map.of(
                        "standardSpuId",
                        standardSpuId == null ? FieldChange.from(null) : FieldChange.to(standardSpuId))));
    }

    /** 卖家视角：本店有多少商品挂在这个标准品上（挂靠前先看是不是已经挂过同一批货）。 */
    @Transactional(readOnly = true)
    public long countBound(UUID merchantId, UUID standardSpuId) {
        return prices.countBoundByMerchant(standardSpuId, merchantId);
    }

    // ── 消费侧 ──

    /**
     * 同款聚合与比价。<b>这是标准品存在的全部理由。</b>
     *
     * <p>入参可以是任何标准品 id，包括已被合并的——内部会顺着 {@code merged_into} 找到终点。
     * 调用方不需要自己解链，也不需要知道「这条被并走了」。
     *
     * <p>返回空结果（{@code offers} 与 {@code pricesBySpec} 都空）是正常的：标准品建出来了，
     * 但挂在它上面的商品现在都不在卖。那不是错误，是「这个型号暂时没人卖」。
     *
     * @throws BusinessException 404 只在这个 id 根本不是标准品时抛
     */
    @Transactional(readOnly = true)
    public SameProductView sameProduct(UUID standardSpuId) {
        UUID terminal = resolveTerminal(standardSpuId);
        StandardSpuRow standard =
                standards.find(terminal).orElseThrow(() -> BusinessException.notFound("标准品不存在: " + standardSpuId));

        List<Offer> offers = prices.findSameProductOffers(terminal).stream()
                .limit(OFFERS_MAX)
                .map(row -> new Offer(
                        row.spuId(),
                        row.title(),
                        row.merchantId(),
                        row.shopId(),
                        row.imageUrl(),
                        row.minPriceAmount() == null ? null : new Money(row.minPriceAmount(), row.minPriceCurrency()),
                        row.skuCount()))
                .toList();

        return new SameProductView(terminal, standard.title(), offers, groupBySpec(prices.findPriceOffers(terminal)));
    }

    /**
     * 把扁平的报价行按 {@code identity_key} 分组。
     *
     * <p>SQL 已经按 {@code identity_key, price_amount} 排好序，所以这里只需要顺序扫描 +
     * 每组截前 {@link #QUOTES_PER_SPEC} 条。<b>在内存里分组而不是在 SQL 里 {@code GROUP BY}</b>：
     * 分组后还要每组取前 N 条，SQL 里得用窗口函数，而结果集本来就不大
     * （一个标准品的 active SKU 数量级是几十到几百）。
     *
     * <p>用 {@link LinkedHashMap} 保留 SQL 的排序——买家看到的规格顺序应当稳定，
     * 每次刷新换一个顺序会让人以为数据在变。
     */
    private static List<SpecPrices> groupBySpec(List<PriceOfferRow> rows) {
        Map<String, List<PriceOfferRow>> bySpec = new LinkedHashMap<>();
        for (PriceOfferRow row : rows) {
            bySpec.computeIfAbsent(row.identityKey(), key -> new ArrayList<>()).add(row);
        }
        List<SpecPrices> result = new ArrayList<>(bySpec.size());
        for (Map.Entry<String, List<PriceOfferRow>> entry : bySpec.entrySet()) {
            List<PriceOfferRow> group = entry.getValue();
            List<Quote> quotes = group.stream()
                    .limit(QUOTES_PER_SPEC)
                    .map(row -> new Quote(
                            row.skuId(),
                            row.spuId(),
                            row.title(),
                            row.merchantId(),
                            row.shopId(),
                            new Money(row.priceAmount(), row.priceCurrency())))
                    .toList();
            PriceOfferRow cheapest = group.getFirst();
            result.add(new SpecPrices(
                    entry.getKey(),
                    cheapest.specValues(),
                    new Money(cheapest.priceAmount(), cheapest.priceCurrency()),
                    quotes));
        }
        return result;
    }

    // ── 私有 ──

    private StandardSpuRow requireStandard(UUID spuId) {
        return standards.find(spuId).orElseThrow(() -> BusinessException.notFound("标准品不存在: " + spuId));
    }

    /**
     * 顺着 {@code merged_into} 找到终点。
     *
     * <p>查不到（行不存在）时原样返回入参——错误留给调用方按自己的语义报，
     * 而不是在这里统一抛 404（{@link #bind} 里对 null 的处理就不需要这个查询）。
     */
    private UUID resolveTerminal(UUID spuId) {
        return standards.findMergeTarget(spuId).orElse(spuId);
    }

    private static StandardSpuView toView(StandardSpuRow row) {
        return new StandardSpuView(
                row.spuId(),
                row.title(),
                row.categoryId(),
                row.brandId(),
                row.modelNo(),
                row.identityKind(),
                row.matchKey(),
                row.mergedInto(),
                row.createdAt(),
                row.boundCount());
    }
}
