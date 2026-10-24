package com.shop.platform.clearing.service;

import com.shop.platform.clearing.api.ClearingCommand;
import com.shop.platform.clearing.mapper.FreezeStore;
import com.shop.platform.clearing.mapper.SettlementStore;
import com.shop.platform.clearing.model.MerchantShare;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 售后冻结。一笔未终态的售后，把可能要退的钱从商家可用余额里划走。
 *
 * <p>没有这一层，"确认收货 + T+7"就是唯一保护——买家第 6 天申请售后，第 8 天结算照样把钱打走，
 * 退款只能回头向商家要。
 *
 * <p><b>冻的是商家净额，不是退款总额</b>：佣金那部分是平台的，不该占商家的额度。
 */
@Service
public class FreezeService implements ClearingCommand {

    private final FreezeStore freezes;
    private final SettlementStore items;
    private final PostingService posting;

    public FreezeService(FreezeStore freezes, SettlementStore items, PostingService posting) {
        this.freezes = Objects.requireNonNull(freezes, "freezes");
        this.items = Objects.requireNonNull(items, "items");
        this.posting = Objects.requireNonNull(posting, "posting");
    }

    @Override
    @Transactional
    public void freeze(UUID caseId, UUID sellerOrderId, long refundAmount, String currency) {
        SettlementStore.ItemDetail item = items.findItem(sellerOrderId)
                .orElseThrow(() -> new IllegalStateException("冻结找不到待结算明细: " + sellerOrderId));

        // 和冲销用同一个换算：冻的金额必须等于之后要冲的金额，差一分钱余额就会少一分
        long merchantShare =
                MerchantShare.increment(item.refundedAmount(), refundAmount, item.netAmount(), item.payableAmount());
        if (merchantShare <= 0) {
            return;
        }

        // 钱现在在哪：还没解冻就在 pending，已经解冻（或已结算）就从 available 冻
        String source = "pending".equals(item.status()) ? "pending" : "available";
        freezes.insert(caseId, sellerOrderId, item.merchantId(), currency, merchantShare, source);
        posting.freeze(caseId, item.merchantId(), currency, merchantShare, source, "freeze:" + caseId);
    }

    @Override
    @Transactional
    public void unfreeze(UUID caseId) {
        FreezeStore.FreezeRow row = freezes.find(caseId).orElse(null);
        if (row == null || !"frozen".equals(row.status())) {
            return;
        }
        // 先关状态再记账：关不上说明别人先动了（比如退款已经把它冲掉），这时候不能再记一次
        if (!freezes.close(caseId, "released")) {
            return;
        }
        // 回款看钱**现在**的家，不是冻结时记的 source：从 pending 冻的、但订单在冻结期间完成了，
        // 解冻已经按"扣掉冻结"划过账——钱现在的家是 available，回 pending 就挂死在那里
        // （pending 只有订单完成那一条出口，而这单已经出来过了）。
        String destination = "pending".equals(row.source())
                        && items.findItem(row.sellerOrderId())
                                .filter(item -> "pending".equals(item.status()))
                                .isPresent()
                ? "pending"
                : "available";
        posting.unfreeze(caseId, row.merchantId(), row.currency(), row.amount(), destination, "unfreeze:" + caseId);
    }
}
