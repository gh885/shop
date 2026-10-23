package com.shop.platform.seller.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.seller.dto.ShippingTemplateRequest;
import com.shop.platform.seller.service.ShippingTemplateService;
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
 * 运费模板的商家入口。
 *
 * <p>四个动作分成两类，路径上就看得出来：改内容（{@code POST} / {@code PUT}）与改状态
 * （{@code .../activate}、{@code .../archive}）。合成一个 {@code PUT} 带 {@code status} 字段也能做，
 * 但那样"启用"就不再是一个能被审计、能被前端单独置灰的动作。
 *
 * <p>判权两道：{@code SHIPPING_MANAGE} 权限点决定"能不能改运费"，
 * 商家归属与店铺数据范围在 service 里判——功能权限对了但忘了归属，商家就能改别人店的运费。
 */
@RestController
@RequestMapping("/api/seller/shipping-templates")
public class SellerShippingTemplateController {

    private final ShippingTemplateService templates;
    private final Authorizer authorizer;

    public SellerShippingTemplateController(ShippingTemplateService templates, Authorizer authorizer) {
        this.templates = templates;
        this.authorizer = authorizer;
    }

    /** 列表。{@code shopId} 可空——商家开两家店时先看全部，再按店筛。 */
    @GetMapping
    public List<ShippingTemplateService.TemplateView> list(@RequestParam(required = false) UUID shopId) {
        authorizer.check(Permission.SHIPPING_MANAGE);
        return templates.list(seller().merchantId(), shopId);
    }

    @GetMapping("/{id}")
    public ShippingTemplateService.TemplateView get(@PathVariable UUID id) {
        authorizer.check(Permission.SHIPPING_MANAGE);
        CurrentOperator operator = seller();
        return templates.get(operator.merchantId(), operator.shopIds(), id);
    }

    /** 新建。落成 draft，不会立刻影响算价——启用是下一个动作。 */
    @PostMapping
    public ShippingTemplateService.TemplateView create(@Valid @RequestBody ShippingTemplateRequest request) {
        authorizer.check(Permission.SHIPPING_MANAGE);
        CurrentOperator operator = seller();
        return templates.create(operator.merchantId(), operator.shopIds(), request);
    }

    @PutMapping("/{id}")
    public ShippingTemplateService.TemplateView update(
            @PathVariable UUID id, @Valid @RequestBody ShippingTemplateRequest request) {
        authorizer.check(Permission.SHIPPING_MANAGE);
        CurrentOperator operator = seller();
        return templates.update(operator.merchantId(), operator.shopIds(), id, request);
    }

    @PostMapping("/{id}/activate")
    public ShippingTemplateService.TemplateView activate(@PathVariable UUID id) {
        authorizer.check(Permission.SHIPPING_MANAGE);
        CurrentOperator operator = seller();
        return templates.activate(operator.merchantId(), operator.shopIds(), id);
    }

    @PostMapping("/{id}/archive")
    public ShippingTemplateService.TemplateView archive(@PathVariable UUID id) {
        authorizer.check(Permission.SHIPPING_MANAGE);
        CurrentOperator operator = seller();
        return templates.archive(operator.merchantId(), operator.shopIds(), id);
    }

    /**
     * 只放卖家身份进来。
     *
     * <p>买家或平台员工就算拿到了 {@code shipping:manage} 也不行：这个入口的语义是"我改我自己店的运费"，
     * 没有商家归属就没有"我自己"。
     */
    private CurrentOperator seller() {
        CurrentOperator operator = authorizer.current();
        if (!CurrentOperator.TYPE_SELLER.equals(operator.operatorType()) || operator.merchantId() == null) {
            throw BusinessException.forbidden("SELLER_ONLY", "只有卖家可以管理运费模板");
        }
        return operator;
    }
}
