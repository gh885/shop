package com.shop.platform.clearing.service;

import com.shop.platform.clearing.mapper.AccountStore;
import com.shop.platform.clearing.mapper.SettlementQueryStore;
import com.shop.platform.clearing.model.MerchantShare;
import com.shop.platform.common.BusinessException;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 商家侧的结算查询。
 *
 * <p>三层只读：余额（现在有多少钱）、明细（每个子单卡在哪一步）、批次（什么时候打了多少）。
 * 全部 {@code readOnly}——这个类里出现任何写操作都是 bug。
 *
 * <p><b>不在这里判归属。</b> 归属由 controller 从令牌里拿 {@code merchantId} 决定，
 * 这里只认传进来的那个 id。把两者混在一起，漏一个分支就是"商家 A 看到商家 B 的账"。
 */
@Service
@Transactional(readOnly = true)
public class SettlementQueryService {

    /** 明细只有三种状态，与 {@code ck_item_status} 一一对应。 */
    private static final Set<String> ITEM_STATUSES = Set.of("pending", "released", "settled");

    private final AccountStore accounts;
    private final SettlementQueryStore settlements;

    public SettlementQueryService(AccountStore accounts, SettlementQueryStore settlements) {
        this.accounts = Objects.requireNonNull(accounts, "accounts");
        this.settlements = Objects.requireNonNull(settlements, "settlements");
    }

    /**
     * 余额，按币种 + 账户类型。
     *
     * <p>三个账户类型各有各的意思：{@code pending} 是"钱收了但还不能动"，{@code available} 是"可以提"，
     * {@code frozen} 是"有售后在进行"。合成一个总数会让商家以为全部都能提。
     */
    public List<AccountStore.Balance> balances(UUID merchantId) {
        return accounts.balances("merchant", merchantId);
    }

    /**
     * 待结算明细。
     *
     * @param status 可空 = 全部；非法值报 400 而不是返回空列表——筛选条件写错时，
     *               "没有数据"和"你选错了"是两件事
     */
    public List<ItemView> items(UUID merchantId, String status, int limit) {
        return settlements.items(merchantId, normalizeStatus(status), Math.clamp(limit, 1, 100)).stream()
                .map(SettlementQueryService::view)
                .toList();
    }

    /**
     * 补上"这一单还能结多少"。
     *
     * <p>不把这个减法放在 SQL 里：{@code refundedAmount} 是买家退款（{@code payable} 口径），
     * 换算成商家承担额只有 {@link MerchantShare} 一份实现。SQL 里再写一遍，两处迟早对不上，
     * 而这里对不上的后果是少打或多打钱。
     */
    private static ItemView view(SettlementQueryStore.ItemRow row) {
        long merchantShare = MerchantShare.of(row.refundedAmount(), row.netAmount(), row.payableAmount());
        return new ItemView(
                row.sellerOrderId(),
                row.currency(),
                row.goodsAmount(),
                row.payableAmount(),
                row.commissionAmount(),
                row.netAmount(),
                row.refundedAmount(),
                merchantShare,
                row.netAmount() - merchantShare,
                row.status(),
                row.releasedAt(),
                row.settledAt(),
                row.batchId(),
                row.createdAt());
    }

    public List<SettlementQueryStore.BatchView> batches(UUID merchantId, int limit) {
        return settlements.batches(merchantId, Math.clamp(limit, 1, 100));
    }

    /**
     * 一个子单的结算明细。
     *
     * @param refundedAmount   买家累计退款（{@code payable} 口径），和 trade / payment 的退款额是同一个数
     * @param merchantRefunded 其中商家承担的部分；买家退款里的佣金那部分由平台承担
     * @param settleableAmount 这一单还能结多少 = {@code netAmount - merchantRefunded}，可以为负（退款超过本单净额）
     */
    public record ItemView(
            UUID sellerOrderId,
            String currency,
            long goodsAmount,
            long payableAmount,
            long commissionAmount,
            long netAmount,
            long refundedAmount,
            long merchantRefunded,
            long settleableAmount,
            String status,
            Instant releasedAt,
            Instant settledAt,
            UUID batchId,
            Instant createdAt) {}

    private static String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        String normalized = status.trim().toLowerCase(Locale.ROOT);
        if (!ITEM_STATUSES.contains(normalized)) {
            throw BusinessException.badRequest("不支持的结算状态: " + status);
        }
        return normalized;
    }
}
