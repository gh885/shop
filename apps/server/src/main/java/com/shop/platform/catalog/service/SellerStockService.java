package com.shop.platform.catalog.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.catalog.dto.AdjustStockRequest;
import com.shop.platform.catalog.dto.SellerStockView;
import com.shop.platform.catalog.mapper.SkuMapper;
import com.shop.platform.catalog.mapper.SpuMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.inventory.api.AdjustRequest;
import com.shop.platform.inventory.api.InventoryCommand;
import com.shop.platform.inventory.api.InventoryQuery;
import com.shop.platform.inventory.api.InventoryQuery.StockAccount;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 商家改自己商品的库存。
 *
 * <p><b>为什么这个服务长在 catalog，不长在 inventory。</b> 判断「这个 SKU 归不归你」需要知道
 * SKU 属于哪个 SPU、SPU 属于哪个商家——那是 catalog 的事实。让 inventory 去问，就得让
 * {@code inventory → catalog :: api}，而 {@code catalog} 已经依赖 {@code inventory :: api}
 * （商品列表的库存列），两条边一合就是环，{@code ModularityTest} 当场红。
 *
 * <p>所以分工是：<b>归属在 catalog 判，账在 inventory 记。</b> 这个类只做两件事——
 * 校验这批 SKU 确实属于这个商家的这个商品，然后把数字交出去。
 *
 * <h2>为什么整批一次交出去，不是逐 SKU 一个 api</h2>
 *
 * <p>商家改库存的动作天然是「一整张 SKU 表格」。逐 SKU 调意味着：N 次跨模块往返、N 个事务边界、
 * 中途失败就留下一半改了另一半没改的账。批量接口配上 {@code requestId} 幂等键，
 * 重试整批重放是空操作——这正是「一次导 5000 行」那条未决问题需要的形状。
 */
@Component
public class SellerStockService {

    /** 一次调整的行数上限。5000 行是商家导出的常见规模，再往上就该限流并分批了。 */
    private static final int MAX_LINES = 5000;

    private final SpuMapper products;
    private final SkuMapper skus;
    private final InventoryCommand inventoryCommands;
    private final InventoryQuery inventoryQueries;
    private final AuditCommand audit;

    public SellerStockService(
            SpuMapper products,
            SkuMapper skus,
            InventoryCommand inventoryCommands,
            InventoryQuery inventoryQueries,
            AuditCommand audit) {
        this.products = Objects.requireNonNull(products, "products");
        this.skus = Objects.requireNonNull(skus, "skus");
        this.inventoryCommands = Objects.requireNonNull(inventoryCommands, "inventoryCommands");
        this.inventoryQueries = Objects.requireNonNull(inventoryQueries, "inventoryQueries");
        this.audit = Objects.requireNonNull(audit, "audit");
    }

    /**
     * 库存页。
     *
     * <p>把「这个商品有哪些 SKU」和「这些 SKU 有多少货」分两次问：catalog 知道自己有哪些 SKU，
     * inventory 知道每个 SKU 有多少——各管各的，谁也不用读对方的表。
     *
     * <p>没建过库存行的 SKU 也返回（{@code unbounded = true}），因为那是商家必须看见的状态：
     * 他得先填一次数，才谈得上卖。
     */
    @Transactional(readOnly = true)
    public SellerStockView view(UUID spuId, CurrentOperator operator) {
        UUID merchantId = requireSeller(operator);
        requireOwnedSpu(spuId, merchantId);

        List<UUID> skuIds = skus.skuIds(spuId);
        Map<UUID, StockAccount> accounts = inventoryQueries.stockAccounts(skuIds);
        List<SellerStockView.SkuStock> rows = new ArrayList<>(skuIds.size());
        for (UUID skuId : skuIds) {
            StockAccount account = accounts.get(skuId);
            rows.add(
                    account == null
                            ? new SellerStockView.SkuStock(skuId, 0, 0, 0, 0, true)
                            : new SellerStockView.SkuStock(
                                    skuId,
                                    account.onHand(),
                                    account.availableToPromise(),
                                    account.reserved(),
                                    account.safety(),
                                    false));
        }
        return new SellerStockView(spuId, rows);
    }

    /**
     * 改库存。
     *
     * <p><b>全量覆盖语义</b>：请求里给了的 SKU 改成给定值，没给的不动。与 {@code PUT /skus}
     * 的「没给的一律停售」不同——这里"没给"是"不关心"，因为商家可能只想改一个 SKU 的数字。
     *
     * <p>校验全在一处：<b>SKU 属于这个商家这个商品</b>。漏掉它，任何一个商家只要拿到别人的
     * skuId 就能改别人的库存——而库存是钱。
     *
     * @throws com.shop.platform.common.BusinessException SKU 不属于这个商品（404，不给越权确认）、
     *     数量为负（400）
     */
    @Transactional
    public SellerStockView adjust(UUID spuId, AdjustStockRequest request, CurrentOperator operator) {
        UUID merchantId = requireSeller(operator);
        requireOwnedSpu(spuId, merchantId);

        if (request == null || request.requestId() == null) {
            throw BusinessException.badRequest("缺少 requestId：批量改库存必须带幂等键，否则重试会重复记账");
        }
        if (request.lines().size() > MAX_LINES) {
            throw BusinessException.badRequest(
                    "一次最多改 " + MAX_LINES + " 个 SKU，本次 " + request.lines().size());
        }

        Set<UUID> owned = new HashSet<>(skus.skuIds(spuId));
        Set<UUID> seen = new HashSet<>();
        List<AdjustRequest.Line> lines = new ArrayList<>(request.lines().size());
        int index = 0;
        for (AdjustStockRequest.Line line : request.lines()) {
            index++;
            if (line.skuId() == null || !owned.contains(line.skuId())) {
                // 按 (spuId, skuId) 双键判，与 updateSku 同一条规矩：
                // 只按 skuId 就把"这个 sku 是不是这个 spu 的"交给别处去比对，那是越权的起点
                throw BusinessException.notFound("SKU 不属于这个商品: " + line.skuId());
            }
            if (!seen.add(line.skuId())) {
                throw BusinessException.badRequest("同一个 SKU 出现了两次: " + line.skuId());
            }
            int onHand = line.onHand() == null ? 0 : line.onHand();
            int safety = line.safety() == null ? 0 : line.safety();
            if (onHand < 0 || safety < 0) {
                throw BusinessException.badRequest("实物库存和安全库存都不能为负: " + line.skuId());
            }
            lines.add(new AdjustRequest.Line(line.skuId(), index, onHand, safety));
        }

        if (!lines.isEmpty()) {
            inventoryCommands.adjustAll(new AdjustRequest(request.requestId(), merchantId, lines));
            audit.record(AuditEntry.byMerchant(
                    "catalog.product.stock_adjusted",
                    "spu",
                    spuId.toString(),
                    merchantId,
                    Map.of(
                            "skuCount", FieldChange.to(lines.size()),
                            "requestId", FieldChange.to(request.requestId().toString()))));
        }
        // 回读而不是把入参回声：可售是反推出来的，商家要看见的是账上真实的结果
        return view(spuId, operator);
    }

    /**
     * 商品归不归这个商家。查不到与不是他的一律 404——403 等于确认"这个 spuId 存在但不是你的"。
     *
     * <p>用 {@code findEditable}（它带 {@code merchant_id} 条件）而不是读了再比：
     * 让归属进 SQL 就少一处会漏写的比对。
     */
    private void requireOwnedSpu(UUID spuId, UUID merchantId) {
        if (products.findEditable(spuId)
                .filter(row -> row.merchantId().equals(merchantId))
                .isEmpty()) {
            throw BusinessException.notFound("商品不存在: " + spuId);
        }
    }

    private UUID requireSeller(CurrentOperator operator) {
        if (!CurrentOperator.TYPE_SELLER.equals(operator.operatorType()) || operator.merchantId() == null) {
            throw BusinessException.forbidden("SELLER_ONLY", "只有卖家可以操作商品");
        }
        return operator.merchantId();
    }
}
