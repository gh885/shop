package com.shop.platform.shop.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.infra.region.RegionRegistry;
import com.shop.platform.shop.dto.ShippingTemplateRequest;
import com.shop.platform.shop.dto.ShippingTemplateRequest.RegionalRule;
import com.shop.platform.shop.dto.ShippingTemplateRequest.ShippingFeeTier;
import com.shop.platform.shop.mapper.ShippingExclusion;
import com.shop.platform.shop.mapper.ShippingExclusionMapper;
import com.shop.platform.shop.mapper.ShippingRule;
import com.shop.platform.shop.mapper.ShippingRuleMapper;
import com.shop.platform.shop.mapper.ShippingRuleRegion;
import com.shop.platform.shop.mapper.ShippingRuleRegionMapper;
import com.shop.platform.shop.mapper.ShippingTemplate;
import com.shop.platform.shop.mapper.ShippingTemplateMapper;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 运费模板管理 —— 每店一份模板（商品级绑定留给将来，见 V53），覆盖式保存，整批重建规则与区域。
 *
 * <p>为什么是覆盖式而不是逐条 CRUD：模板是一个<b>整体承诺</b>（默认规则 + 地区差异 + 不配送），
 * 改一条规则的关系（区域挂了几个前缀）无法用「改一行」表达。整批重建把「保存后模板是什么样」
 * 收敛成一次事务，卖家看到的与计费用的永远是同一份。
 *
 * <p>约束：每店至多一个模板（uk_shipping_templates_shop），默认规则必存一条（淘宝：默认运费必填），
 * 区域前缀必须落在国标区划码空间，同一地区不得配两条计费规则。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShippingTemplateService {

    private final ShippingTemplateMapper templateMapper;

    private final ShippingRuleMapper ruleMapper;

    private final ShippingRuleRegionMapper ruleRegionMapper;

    private final ShippingExclusionMapper exclusionMapper;

    private final RegionRegistry regionRegistry;

    /** 本店模板（含规则与区域）：未设置 404，卖家侧进设置页时据此新建 */
    public ShippingPricing require(UUID shopId) {
        return findPricing(shopId).orElseThrow(() -> BusinessException.notFound("运费模板未设置"));
    }

    /** 本店模板：未设置返回 empty —— 计费侧据此回退「恒包邮」（老店铺的向后兼容口径） */
    public Optional<ShippingPricing> findPricing(UUID shopId) {
        return templateMapper.selectByShop(shopId).map(this::assemble);
    }

    /** 覆盖式保存：模板本体 + 规则 + 区域 + 不配送地区，或全成或全败 */
    @Transactional
    public ShippingPricing save(UUID shopId, ShippingTemplateRequest req) {
        // 1. 校验：区域前缀必须是国标区划码前缀，同一地区不得配两条规则（同长度前缀会让「最长胜」变成掷骰子）
        List<RegionalRule> regionRules = req.regionRules() == null ? List.of() : req.regionRules();
        List<String> excludedRegions = req.excludedRegions() == null ? List.of() : req.excludedRegions();
        validateRegions(regionRules, excludedRegions);

        // 2. 模板本体：本店已有则原地更新（每店至多一份），没有则新建
        ShippingTemplate template = upsertTemplate(shopId, req);

        // 3. 规则整批重建：先删区域再删规则 —— 规则 ID 每次都是新的，旧区域留着就是悬挂引用
        rebuildRules(template.getId(), req.defaultRule(), regionRules);

        // 4. 不配送地区整批重建
        exclusionMapper.deleteByTemplate(template.getId());
        excludedRegions.stream()
                .distinct()
                .forEach(prefix -> exclusionMapper.insert(ShippingExclusion.builder()
                        .templateId(template.getId())
                        .regionPrefix(prefix)
                        .build()));

        // 5. 回读装配：返回整份而不是拼一个内存态，保证「保存后的样子」与「计费用的样子」同源
        log.info(
                "[SHIPPING] 保存运费模板, shopId={}, templateId={}, 包邮={}, 地区规则={}, 不配送={}",
                shopId,
                template.getId(),
                template.getFreeShipping(),
                1 + regionRules.size(),
                excludedRegions.size());
        return require(shopId);
    }

    // 内部：装配
    /** 四张表装配成计费口径：默认规则必在（缺了就是数据损坏，宁可响亮失败也不静默按包邮算） */
    private ShippingPricing assemble(ShippingTemplate template) {
        List<ShippingRule> rules = ruleMapper.selectByTemplate(template.getId());
        ShippingRule defaultRule = rules.stream()
                .filter(rule -> Boolean.TRUE.equals(rule.getIsDefault()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("运费模板缺少默认规则: " + template.getId()));
        List<ShippingRule> regionalRules = rules.stream()
                .filter(rule -> !Boolean.TRUE.equals(rule.getIsDefault()))
                .toList();
        Map<UUID, List<String>> prefixesByRule =
                ruleRegionMapper
                        .selectByRuleIds(
                                regionalRules.stream().map(ShippingRule::getId).toList())
                        .stream()
                        .collect(Collectors.groupingBy(
                                ShippingRuleRegion::getRuleId,
                                Collectors.mapping(ShippingRuleRegion::getRegionPrefix, Collectors.toList())));
        return new ShippingPricing(
                template,
                defaultRule,
                regionalRules.stream()
                        .map(rule -> new ShippingPricing.RegionRule(
                                rule, prefixesByRule.getOrDefault(rule.getId(), List.of())))
                        .toList(),
                exclusionMapper.selectByTemplate(template.getId()).stream()
                        .map(ShippingExclusion::getRegionPrefix)
                        .toList());
    }

    // 内部：写入
    /** 模板本体更新或新建：整店包邮时抹掉满件/满额门槛（那两列在包邮下是死配置，落库即噪音） */
    private ShippingTemplate upsertTemplate(UUID shopId, ShippingTemplateRequest req) {
        boolean free = Boolean.TRUE.equals(req.freeShipping());
        ShippingTemplate template = templateMapper.selectByShop(shopId).orElse(null);
        boolean created = template == null;
        if (created) {
            template = ShippingTemplate.builder().shopId(shopId).build();
        }
        template.setFreeShipping(free);
        template.setFreeOverQuantity(free ? null : req.freeOverQuantity());
        template.setFreeOverAmount(free ? null : fen(req.freeOverAmount()));
        template.setCurrency(req.currency());
        if (created) {
            // 并发首次保存由 uk_shipping_templates_shop 兜底：撞键转 409 人话，不让它落进兜底 500
            // （局部别名：template 在上面的分支里被重新赋值过，直接捕获不是 effectively final）
            ShippingTemplate fresh = template;
            DuplicateKeys.conflictOnDuplicate(() -> templateMapper.insert(fresh), "运费模板已被另一次保存创建，请刷新后重试");
        } else {
            templateMapper.overwriteFreeShippingRules(
                    template.getId(),
                    free,
                    template.getFreeOverQuantity(),
                    template.getFreeOverAmount(),
                    template.getCurrency(),
                    OffsetDateTime.now());
        }
        return template;
    }

    /** 规则重建：先清旧规则与旧区域，再写默认规则（必有一条）+ 各指定地区规则 */
    private void rebuildRules(UUID templateId, ShippingFeeTier defaultRule, List<RegionalRule> regionRules) {
        ruleRegionMapper.deleteByRuleIds(ruleMapper.selectByTemplate(templateId).stream()
                .map(ShippingRule::getId)
                .toList());
        ruleMapper.deleteByTemplate(templateId);
        insertRule(templateId, true, tierOf(defaultRule));
        for (RegionalRule regional : regionRules) {
            List<String> prefixes =
                    regional.regionPrefixes().stream().distinct().sorted().toList();
            UUID ruleId = insertRule(templateId, false, tierOf(regional));
            prefixes.forEach(prefix -> ruleRegionMapper.insert(ShippingRuleRegion.builder()
                    .ruleId(ruleId)
                    .regionPrefix(prefix)
                    .build()));
        }
    }

    private UUID insertRule(UUID templateId, boolean isDefault, FeeTier tier) {
        ShippingRule rule = ShippingRule.builder()
                .templateId(templateId)
                .isDefault(isDefault)
                .firstQuantity(tier.firstQuantity())
                .firstFee(tier.firstFee().amount())
                .addQuantity(tier.addQuantity())
                .addFee(tier.addFee().amount())
                // 币种与费用同批落：一行的两个金额共用一个币种（入参已各自收口到平台币种）
                .currency(tier.firstFee().currency())
                .build();
        ruleMapper.insert(rule);
        return rule.getId();
    }

    /** 校验区域入参：前缀必须是国标区划码前缀，同一地区不得配两条计费规则，也不得同时设为不配送 */
    private void validateRegions(List<RegionalRule> regionRules, List<String> excludedRegions) {
        Set<String> charged = new HashSet<>();
        for (RegionalRule regional : regionRules) {
            for (String prefix : regional.regionPrefixes()) {
                regionRegistry.requirePrefix(prefix);
                Validate.isTrue(charged.add(prefix), "同一地区只能配置一条运费规则");
            }
        }
        for (String prefix : excludedRegions) {
            regionRegistry.requirePrefix(prefix);
            // 更细粒度的不配送是合法用法（广东计费、深圳不配送），故只挡完全相同的那个前缀
            Validate.isTrue(!charged.contains(prefix), "该地区已配置运费规则，不能再设为不配送");
        }
    }

    /** 两种入参（默认规则 / 指定地区规则）归一成一档运费，共用同一段落库逻辑 */
    private record FeeTier(int firstQuantity, Money firstFee, int addQuantity, Money addFee) {}

    private static FeeTier tierOf(ShippingFeeTier tier) {
        return new FeeTier(tier.firstQuantity(), tier.firstFee(), tier.addQuantity(), tier.addFee());
    }

    private static FeeTier tierOf(RegionalRule rule) {
        return new FeeTier(rule.firstQuantity(), rule.firstFee(), rule.addQuantity(), rule.addFee());
    }

    /** 可空金额 → 分值：未设条件是 NULL，不是 0（0 元门槛意味着「满 0 元包邮」，两回事） */
    private static Long fen(Money amount) {
        return amount == null ? null : amount.amount();
    }
}
