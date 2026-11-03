package com.shop.platform.promotion.controller;

import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.promotion.dto.RuleRequest;
import com.shop.platform.promotion.service.PromotionAdminService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台侧促销规则入口。
 *
 * <p>路径前缀 {@code /api/admin}：三端各自独立入口是既定做法，不合成"看身份分流"的接口。
 *
 * <p>权限点是 {@code promotion_rule:*}，不是 {@code coupon:*}——券发给某一个人，满减改所有人的价，
 * 能发券不代表能改价。平台员工的身份由 {@code platform()} 工厂当场认定，不是判完权限再补一道。
 */
@RestController
@RequestMapping("/api/admin/rules")
public class AdminRuleController {

    private final PromotionAdminService rules;
    private final Authorizer authorizer;

    public AdminRuleController(PromotionAdminService rules, Authorizer authorizer) {
        this.rules = rules;
        this.authorizer = authorizer;
    }

    /** @param status 可空；空 = 全部状态。取值 {@code draft} / {@code active} / {@code archived} */
    @GetMapping
    public List<PromotionAdminService.RuleView> listRules(@RequestParam(required = false) String status) {
        authorizer.platform(Permission.PROMOTION_RULE_CONFIGURE);
        return rules.list(status);
    }

    @GetMapping("/{id}")
    public PromotionAdminService.RuleView getRule(@PathVariable UUID id) {
        authorizer.platform(Permission.PROMOTION_RULE_CONFIGURE);
        return rules.get(id);
    }

    /** 新建。落成 draft，不影响算价。 */
    @PostMapping
    public PromotionAdminService.RuleView createRule(@Valid @RequestBody RuleRequest request) {
        AccessScope.Platform scope = authorizer.platform(Permission.PROMOTION_RULE_CONFIGURE);
        return rules.create(scope.subjectId(), request);
    }

    /** 改内容。active 的规则改一次 {@code version} +1，报价单靠它区分"当时是哪一版"。 */
    @PutMapping("/{id}")
    public PromotionAdminService.RuleView updateRule(@PathVariable UUID id, @Valid @RequestBody RuleRequest request) {
        AccessScope.Platform scope = authorizer.platform(Permission.PROMOTION_RULE_CONFIGURE);
        return rules.update(scope.subjectId(), id, request);
    }

    @PostMapping("/{id}/activate")
    public PromotionAdminService.RuleView activateRule(@PathVariable UUID id) {
        AccessScope.Platform scope = authorizer.platform(Permission.PROMOTION_RULE_ACTIVATE);
        return rules.activate(scope.subjectId(), id);
    }

    @PostMapping("/{id}/archive")
    public PromotionAdminService.RuleView archiveRule(@PathVariable UUID id) {
        AccessScope.Platform scope = authorizer.platform(Permission.PROMOTION_RULE_ACTIVATE);
        return rules.archive(scope.subjectId(), id);
    }
}
