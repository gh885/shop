package com.shop.platform.promotion.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.promotion.dto.PromotionRuleRequest;
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
 * <p>权限点是 {@code PROMOTION_MANAGE}，不是 {@code COUPON_OPS}——券发给某一个人，满减改所有人的价，
 * 能发券不代表能改价。再加一道"必须是 staff"：平台活动不是商家自己配的东西，
 * 有权限点但身份不对同样进不来。
 */
@RestController
@RequestMapping("/api/admin/promotion-rules")
public class AdminPromotionRuleController {

    private final PromotionAdminService rules;
    private final Authorizer authorizer;

    public AdminPromotionRuleController(PromotionAdminService rules, Authorizer authorizer) {
        this.rules = rules;
        this.authorizer = authorizer;
    }

    /** @param status 可空；空 = 全部状态。取值 {@code draft} / {@code active} / {@code archived} */
    @GetMapping
    public List<PromotionAdminService.RuleView> list(@RequestParam(required = false) String status) {
        authorizer.check(Permission.PROMOTION_MANAGE);
        return rules.list(status);
    }

    @GetMapping("/{id}")
    public PromotionAdminService.RuleView get(@PathVariable UUID id) {
        authorizer.check(Permission.PROMOTION_MANAGE);
        return rules.get(id);
    }

    /** 新建。落成 draft，不影响算价。 */
    @PostMapping
    public PromotionAdminService.RuleView create(@Valid @RequestBody PromotionRuleRequest request) {
        authorizer.check(Permission.PROMOTION_MANAGE);
        return rules.create(staff().operatorId(), request);
    }

    /** 改内容。active 的规则改一次 {@code version} +1，报价单靠它区分"当时是哪一版"。 */
    @PutMapping("/{id}")
    public PromotionAdminService.RuleView update(
            @PathVariable UUID id, @Valid @RequestBody PromotionRuleRequest request) {
        authorizer.check(Permission.PROMOTION_MANAGE);
        return rules.update(staff().operatorId(), id, request);
    }

    @PostMapping("/{id}/activate")
    public PromotionAdminService.RuleView activate(@PathVariable UUID id) {
        authorizer.check(Permission.PROMOTION_MANAGE);
        return rules.activate(staff().operatorId(), id);
    }

    @PostMapping("/{id}/archive")
    public PromotionAdminService.RuleView archive(@PathVariable UUID id) {
        authorizer.check(Permission.PROMOTION_MANAGE);
        return rules.archive(staff().operatorId(), id);
    }

    private CurrentOperator staff() {
        CurrentOperator operator = authorizer.current();
        if (!CurrentOperator.TYPE_STAFF.equals(operator.operatorType())) {
            throw BusinessException.forbidden("STAFF_ONLY", "只有平台员工可以配置促销规则");
        }
        return operator;
    }
}
