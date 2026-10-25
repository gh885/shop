package com.shop.platform.clearing.controller;

import com.shop.platform.clearing.mapper.LedgerAccountMapper;
import com.shop.platform.clearing.mapper.SettlementQueryMapper;
import com.shop.platform.clearing.service.SettlementQueryService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.Permission;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 商家侧的结算查询入口。
 *
 * <p>三个问题，三个端点：我現在有多少钱、每笔钱卡在哪、什么时候打了多少。
 *
 * <p><b>看不到别人的账</b>靠两件事：{@code merchantId} 只从令牌里取（不接受请求参数），
 * 以及 SQL 只按这一个条件过滤。任何"前端传 merchantId"的写法都等于把归属判断交给了调用方。
 *
 * <p>权限点用 {@code FINANCE_READ}（查看资金流水），它本来就是为这一页准备的；
 * 不复用 {@code SHOP_READ}：能看经营数据不等于能看资金账户。
 */
@RestController
@RequestMapping("/api/seller/settlement")
public class SellerSettlementController {

    /** 列表默认 20 条。结算明细一个商家可能上万条，默认值取"一屏看完"的量。 */
    private static final int DEFAULT_LIMIT = 20;

    private final SettlementQueryService settlement;
    private final Authorizer authorizer;

    public SellerSettlementController(SettlementQueryService settlement, Authorizer authorizer) {
        this.settlement = settlement;
        this.authorizer = authorizer;
    }

    /**
     * 余额。按币种 + 账户类型返回，<b>不做求和</b>。
     *
     * <p>合起来给一个数会让商家以为全部都能提：{@code pending} 里的钱要等确认收货，
     * {@code held} 里的钱压着一笔售后。
     */
    @GetMapping("/ledgerAccounts")
    public List<LedgerAccountMapper.Balance> ledgerAccounts() {
        authorizer.check(Permission.FINANCE_READ);
        return settlement.balances(seller().merchantId());
    }

    /** @param status 可空；{@code pending} / {@code released} / {@code settled} */
    @GetMapping("/items")
    public List<SettlementQueryService.ItemView> items(
            @RequestParam(required = false) String status, @RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit) {
        authorizer.check(Permission.FINANCE_READ);
        return settlement.items(seller().merchantId(), status, limit);
    }

    @GetMapping("/batches")
    public List<SettlementQueryMapper.BatchView> batches(@RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit) {
        authorizer.check(Permission.FINANCE_READ);
        return settlement.batches(seller().merchantId(), limit);
    }

    /**
     * 只放卖家身份进来。
     *
     * <p>买家就算拿到了 {@code finance:read} 也没有商家归属，没有"我的账"可言。
     */
    private CurrentOperator seller() {
        CurrentOperator operator = authorizer.current();
        if (!CurrentOperator.TYPE_SELLER.equals(operator.operatorType()) || operator.merchantId() == null) {
            throw BusinessException.forbidden("SELLER_ONLY", "只有卖家可以查看结算");
        }
        return operator;
    }
}
