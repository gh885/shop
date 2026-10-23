package com.shop.platform.seller.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.seller.api.FreightRule;
import com.shop.platform.seller.dto.ShippingTemplateRequest;
import com.shop.platform.seller.mapper.ShippingTemplateStore;
import com.shop.platform.seller.mapper.ShippingTemplateStore.TemplateRow;
import com.shop.platform.seller.model.ShippingTemplateStatus;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;

/**
 * 运费模板的写侧。建、改、启用、归档。
 *
 * <p>三道判断，各管一件事：
 *
 * <ul>
 *   <li><b>归属</b>：模板属于商家（{@code shop.merchant_id}）和店铺（数据范围）。两者分开判，
 *       因为它们是两个维度——商家对了不代表这个子账号能碰这家店
 *   <li><b>状态</b>：归档的只读。这条放在库的 where 里兜底，不靠内存里的 if
 *   <li><b>形状</b>：必须有且只有一条默认地区项，地区编码不能重复。重叠会让"最具体优先"退化成
 *       看运气，所以宁可在写入时拒掉
 * </ul>
 *
 * <p>算钱不在这里。这个类只管"这套规则长什么样"，"这一单收多少"是 pricing 的事。
 */
@Component
public class ShippingTemplateService {

    private final ShippingTemplateStore store;
    private final AuditCommand audit;

    public ShippingTemplateService(ShippingTemplateStore store, AuditCommand audit) {
        this.store = Objects.requireNonNull(store, "store");
        this.audit = Objects.requireNonNull(audit, "audit");
    }

    /** 新建的模板一律是 draft：启用是一个独立动作，启用那一刻才影响算价。 */
    @Transactional
    public TemplateView create(UUID merchantId, Set<UUID> shopIds, ShippingTemplateRequest request) {
        UUID shopId = Objects.requireNonNull(request.shopId(), "shopId");
        requireShop(shopIds, shopId);

        List<FreightRule.Region> regions = toRegions(request);
        UUID id = store.insert(
                shopId,
                request.name().trim(),
                chargeBy(request),
                request.freeOver(),
                regions,
                ShippingTemplateStatus.DRAFT);

        audit.record(AuditEntry.byMerchant(
                "seller.shipping_template.saved",
                "shipping_template",
                id.toString(),
                merchantId,
                Map.of("name", FieldChange.to(request.name().trim()))));

        return view(store.find(id).orElseThrow());
    }

    /**
     * 编辑。draft 和 active 都能改——改 active 会立刻影响下一次算价，这正是商家要的效果
     * （标错了一块钱，不该被逼着新建一套再把旧的停掉）。
     */
    @Transactional
    public TemplateView update(UUID merchantId, Set<UUID> shopIds, UUID id, ShippingTemplateRequest request) {
        TemplateRow row = require(merchantId, shopIds, id);
        if (row.status().isReadOnly()) {
            throw archived();
        }

        List<FreightRule.Region> regions = toRegions(request);
        if (store.updateContent(id, request.name().trim(), chargeBy(request), request.freeOver(), regions) == 0) {
            // 读完之后被别的请求归档了。where 子句挡下的，不是 if 挡下的
            throw archived();
        }

        audit.record(AuditEntry.byMerchant(
                "seller.shipping_template.saved",
                "shipping_template",
                id.toString(),
                merchantId,
                Map.of(
                        "name", FieldChange.of(row.name(), request.name().trim()),
                        "chargeBy",
                                FieldChange.of(
                                        row.chargeBy().dbValue(),
                                        chargeBy(request).dbValue()))));

        return view(store.find(id).orElseThrow());
    }

    /**
     * 启用。同店原来的 active 先归档，同一个事务里做完。
     *
     * <p>顺序不能反：{@code uq_shipping_template_active} 是部分唯一索引，
     * 先启新的会撞键。中途失败两句都不生效，不会留下"一套都没启用"的店。
     */
    @Transactional
    public TemplateView activate(UUID merchantId, Set<UUID> shopIds, UUID id) {
        TemplateRow row = require(merchantId, shopIds, id);
        if (row.status().isReadOnly()) {
            throw archived();
        }

        store.archiveActiveOfShop(row.shopId(), id);
        if (store.setStatus(id, ShippingTemplateStatus.ACTIVE) == 0) {
            throw archived();
        }

        audit.record(AuditEntry.byMerchant(
                "seller.shipping_template.status_changed",
                "shipping_template",
                id.toString(),
                merchantId,
                Map.of("status", FieldChange.of(row.status().dbValue(), ShippingTemplateStatus.ACTIVE.dbValue()))));

        return view(store.find(id).orElseThrow());
    }

    /**
     * 归档。允许归档正在用的那套——那等于"这家店暂时不发货"，算价会返回
     * {@code SHIPPING_TEMPLATE_MISSING}，而不是拿一套已经不存在的规则继续报价。
     */
    @Transactional
    public TemplateView archive(UUID merchantId, Set<UUID> shopIds, UUID id) {
        TemplateRow row = require(merchantId, shopIds, id);
        if (row.status().isReadOnly()) {
            throw archived();
        }

        if (store.setStatus(id, ShippingTemplateStatus.ARCHIVED) == 0) {
            throw archived();
        }

        audit.record(AuditEntry.byMerchant(
                "seller.shipping_template.status_changed",
                "shipping_template",
                id.toString(),
                merchantId,
                Map.of("status", FieldChange.of(row.status().dbValue(), ShippingTemplateStatus.ARCHIVED.dbValue()))));

        return view(store.find(id).orElseThrow());
    }

    // —— 读 ——

    public List<TemplateView> list(UUID merchantId, UUID shopId) {
        List<TemplateRow> rows =
                shopId == null ? store.listByMerchant(merchantId) : store.listByShop(merchantId, shopId);
        return rows.stream().map(ShippingTemplateService::view).toList();
    }

    public TemplateView get(UUID merchantId, Set<UUID> shopIds, UUID id) {
        return view(require(merchantId, shopIds, id));
    }

    // —— 内部 ——

    /**
     * 按 id 取一条并验归属。
     *
     * <p>不属于这个商家的一律 404，不回 403：403 等于告诉对方"这个 id 存在，只是不给你看"，
     * 那就把别人的模板 id 变成了一个可枚举的信息。
     */
    private TemplateRow require(UUID merchantId, Set<UUID> shopIds, UUID id) {
        TemplateRow row = store.find(id).orElseThrow(() -> BusinessException.notFound("运费模板不存在: " + id));
        if (!row.merchantId().equals(merchantId)) {
            throw BusinessException.notFound("运费模板不存在: " + id);
        }
        requireShop(shopIds, row.shopId());
        return row;
    }

    private static void requireShop(Set<UUID> shopIds, UUID shopId) {
        if (!shopIds.contains(shopId)) {
            throw BusinessException.forbidden("SHOP_NOT_OPERABLE", "无权操作店铺: " + shopId);
        }
    }

    private static BusinessException archived() {
        return BusinessException.conflict(ErrorCodes.CONFIG_ARCHIVED, "已归档的运费模板不能再改，需要调整请新建一套");
    }

    private static FreightRule.ChargeBy chargeBy(ShippingTemplateRequest request) {
        try {
            return FreightRule.ChargeBy.valueOf(request.chargeBy().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw BusinessException.badRequest("不支持的计费方式: " + request.chargeBy());
        }
    }

    /**
     * 请求体 → 值对象，顺带做形状校验。
     *
     * <p>{@code FreightRule.Region} 的构造器已经挡了单个地区的非法值（首件/续件为 0、负运费），
     * 这里只补它看不到的那两条：默认项的数量、地区编码的重复。
     */
    private static List<FreightRule.Region> toRegions(ShippingTemplateRequest request) {
        List<FreightRule.Region> regions = new ArrayList<>(request.regions().size());
        for (ShippingTemplateRequest.RegionRequest region : request.regions()) {
            regions.add(new FreightRule.Region(
                    region.areaCodes(),
                    region.first(),
                    region.firstFee(),
                    region.additional(),
                    region.additionalFee()));
        }

        long defaults = regions.stream().filter(FreightRule.Region::isDefault).count();
        if (defaults != 1) {
            // 0 条 = 没配过的地区算不出运费；2 条以上 = 取哪一条没有定义
            throw BusinessException.badRequest("运费模板必须有且只有一条默认地区项（areaCodes 为空），当前有 " + defaults + " 条");
        }

        Set<String> seen = new HashSet<>();
        for (FreightRule.Region region : regions) {
            for (String code : region.areaCodes()) {
                if (!seen.add(code)) {
                    // 同一地区配两次，"取最具体的"就退化成"取先命中的"，而顺序不是契约
                    throw BusinessException.badRequest("地区编码重复配置: " + code);
                }
            }
        }
        return regions;
    }

    private static TemplateView view(TemplateRow row) {
        return new TemplateView(
                row.id(),
                row.shopId(),
                row.shopName(),
                row.name(),
                row.chargeBy().dbValue(),
                row.freeOver(),
                parse(row.regionsJson()),
                row.status().dbValue(),
                row.createdAt(),
                row.updatedAt());
    }

    /**
     * 库里那串 JSON 转成值对象。
     *
     * <p>解析失败不抛 500：列表里一条坏数据不该把整页打掉。返回空列表，让 {@code regions}
     * 是空的事实露出来——商家看得见"这套模板的费率丢了"，比看到一整页错误有用。
     */
    private static List<FreightRule.Region> parse(String json) {
        try {
            return JsonColumns.read(json, new TypeReference<ArrayList<FreightRule.Region>>() {});
        } catch (RuntimeException e) {
            return List.of();
        }
    }

    /**
     * 给商家后台看的形状。
     *
     * @param freeOver 分；{@code null} = 不包邮
     * @param status   {@code draft} / {@code active} / {@code archived}
     */
    public record TemplateView(
            UUID id,
            UUID shopId,
            String shopName,
            String name,
            String chargeBy,
            Long freeOver,
            List<FreightRule.Region> regions,
            String status,
            Instant createdAt,
            Instant updatedAt) {}
}
