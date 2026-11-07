package com.shop.platform.review.service;

import com.shop.platform.account.api.AccountQuery;
import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.governance.api.ForbiddenWordQuery;
import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.review.ReviewProperties;
import com.shop.platform.review.dto.ReviewDtos.AppendReviewRequest;
import com.shop.platform.review.dto.ReviewDtos.ReviewView;
import com.shop.platform.review.dto.ReviewDtos.SubmitReviewRequest;
import com.shop.platform.review.mapper.ReviewMapper;
import com.shop.platform.review.mapper.ReviewRow;
import com.shop.platform.trade.api.TradeQuery;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 评价的写路径：提交、追评、商家回复、平台处置。
 *
 * <p>写全是 CAS，0 行是判决——「评了又评」「评完窗口才到」「回复了又回复」的竞态都在
 * where 里收口，这里只负责把 0 行翻译成能用的错误码。提交前的预查（404 / 过期 / 全额退）
 * 是为了把话术分开，真正的并发防线仍然是那一条 UPDATE。
 *
 * <p>买家提交与追评不记审计：评价行本身就是这笔写操作的留痕（带 buyer_id 与时间），
 * 再记审计是重复记账——与地址、订单的口径一致。商家回复与平台处置记审计，动的是公开面。
 */
@Service
public class ReviewService {

    private final ReviewMapper reviews;
    private final TradeQuery trade;
    private final AccountQuery accounts;
    private final ForbiddenWordQuery forbiddenWords;
    private final AuditCommand audit;
    private final ReviewProperties props;

    public ReviewService(
            ReviewMapper reviews,
            TradeQuery trade,
            AccountQuery accounts,
            ForbiddenWordQuery forbiddenWords,
            AuditCommand audit,
            ReviewProperties props) {
        this.reviews = Objects.requireNonNull(reviews, "reviews");
        this.trade = Objects.requireNonNull(trade, "trade");
        this.accounts = Objects.requireNonNull(accounts, "accounts");
        this.forbiddenWords = Objects.requireNonNull(forbiddenWords, "forbiddenWords");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.props = Objects.requireNonNull(props, "props");
    }

    /**
     * 提交评价。公开文本先过违禁词；全额退款行不可评（淘宝口径：钱货两清的单没有使用体验可言）。
     *
     * <p>违禁词命中带 {@code field=content}——前端就地标红正文框，不弹全局 toast。
     */
    @Transactional
    public ReviewView publish(UUID reviewId, UUID buyerId, SubmitReviewRequest request) {
        ReviewRow row = reviews.findForBuyer(reviewId, buyerId).orElseThrow(() -> BusinessException.notFound("评价不存在"));
        if (!ReviewRow.STATUS_PENDING.equals(row.status())) {
            throw BusinessException.conflict(ErrorCodes.REVIEW_ALREADY_REVIEWED, "这个商品你已经评价过了");
        }
        if (row.reviewableUntil().isBefore(Instant.now())) {
            throw BusinessException.badRequest(ErrorCodes.REVIEW_WINDOW_EXPIRED, "评价窗口已关闭");
        }
        ensureNotFullyRefunded(row);
        ensurePublishable(request.content());

        String imagesJson = JsonColumns.write(request.images() == null ? List.of() : request.images());
        int updated = reviews.publish(
                reviewId,
                buyerId,
                request.overall(),
                request.descScore(),
                request.serviceScore(),
                request.logisticsScore(),
                blankToNull(request.content()),
                imagesJson,
                request.anonymous());
        if (updated == 0) {
            // 并发双击或窗口刚好越过：按预查的行状态给结论
            ReviewRow latest =
                    reviews.findForBuyer(reviewId, buyerId).orElseThrow(() -> BusinessException.notFound("评价不存在"));
            if (!ReviewRow.STATUS_PENDING.equals(latest.status())) {
                throw BusinessException.conflict(ErrorCodes.REVIEW_ALREADY_REVIEWED, "这个商品你已经评价过了");
            }
            throw BusinessException.badRequest(ErrorCodes.REVIEW_WINDOW_EXPIRED, "评价窗口已关闭");
        }

        // 昵称快照：公开列表要展示「谁评的」，取值失败不挡评价——空名兜底由脱敏层管
        String name = accounts.find(buyerId)
                .map(state -> state.displayName() == null ? "" : state.displayName())
                .orElse("");
        reviews.saveBuyerName(reviewId, name);
        return ReviewViews.toView(
                reviews.findForBuyer(reviewId, buyerId).orElseThrow(() -> BusinessException.notFound("评价不存在")), true);
    }

    /** 追评一次：只有发布过的评价能追，发布后 90 天内。 */
    @Transactional
    public ReviewView append(UUID reviewId, UUID buyerId, AppendReviewRequest request) {
        ReviewRow row = reviews.findForBuyer(reviewId, buyerId).orElseThrow(() -> BusinessException.notFound("评价不存在"));
        if (!ReviewRow.STATUS_PUBLISHED.equals(row.status()) || row.content2() != null) {
            throw BusinessException.conflict(ErrorCodes.REVIEW_ALREADY_APPENDED, "追评已提交或评价尚未发布");
        }
        ensurePublishable(request.content());

        String imagesJson = JsonColumns.write(request.images() == null ? List.of() : request.images());
        Instant appendedAfter = Instant.now().minus(props.appendWindow());
        int updated = reviews.append(reviewId, buyerId, blankToNull(request.content()), imagesJson, appendedAfter);
        if (updated == 0) {
            throw BusinessException.conflict(ErrorCodes.REVIEW_ALREADY_APPENDED, "追评已提交或已过追评窗口");
        }
        return ReviewViews.toView(
                reviews.findForBuyer(reviewId, buyerId).orElseThrow(() -> BusinessException.notFound("评价不存在")), true);
    }

    /**
     * 商家回复一次。hidden 行不可回复——平台既已处置，商家再回等于把违规内容顶回公开面。
     * 0 行时按行状态分话术：范围外折 404 防枚举，已回复/未发布给 409。
     */
    @Transactional
    public ReviewView reply(UUID reviewId, AccessScope.Seller scope, String content) {
        ensurePublishable(content);

        int updated = reviews.reply(reviewId, content.strip(), scope.shopIds());
        ReviewRow row = reviews.findInternal(reviewId).orElseThrow(() -> BusinessException.notFound("评价不存在"));
        if (updated == 0) {
            boolean inScope = scope.shopIds().contains(row.shopId());
            if (!inScope) {
                throw BusinessException.notFound("评价不存在");
            }
            throw BusinessException.conflict(ErrorCodes.REVIEW_ALREADY_REPLIED, "已回复过，或该评价当前不可回复");
        }
        audit.record(AuditEntry.byMerchant(
                "review.review.replied",
                "review",
                reviewId.toString(),
                scope.merchantId(),
                Map.of("reply_content", FieldChange.to(content.strip()))));
        return ReviewViews.toView(row, false);
    }

    /** 平台隐藏。pending 行不是公开内容，无可隐藏。 */
    @Transactional
    public void hide(UUID reviewId, AccessScope.Platform scope, String reason) {
        int updated = reviews.hide(reviewId);
        ReviewRow row = reviews.findInternal(reviewId).orElseThrow(() -> BusinessException.notFound("评价不存在"));
        if (updated == 0) {
            if (ReviewRow.STATUS_HIDDEN.equals(row.status())) {
                return; // 幂等：重复点「隐藏」不算错
            }
            throw BusinessException.conflict("待评价还没有公开内容，无需隐藏");
        }
        audit.record(AuditEntry.byStaff(
                "review.review.hidden",
                "review",
                reviewId.toString(),
                scope.staffId(),
                row.merchantId(),
                Map.of(
                        "status", FieldChange.of(ReviewRow.STATUS_PUBLISHED, ReviewRow.STATUS_HIDDEN),
                        "reason", FieldChange.to(reason == null ? "" : reason))));
    }

    /** 平台恢复（撤销隐藏）。 */
    @Transactional
    public void restore(UUID reviewId, AccessScope.Platform scope) {
        int updated = reviews.restore(reviewId);
        ReviewRow row = reviews.findInternal(reviewId).orElseThrow(() -> BusinessException.notFound("评价不存在"));
        if (updated == 0) {
            if (ReviewRow.STATUS_PUBLISHED.equals(row.status())) {
                return; // 幂等
            }
            throw BusinessException.conflict("只有已隐藏的评价可以恢复");
        }
        audit.record(AuditEntry.byStaff(
                "review.review.restored",
                "review",
                reviewId.toString(),
                scope.staffId(),
                row.merchantId(),
                Map.of("status", FieldChange.of(ReviewRow.STATUS_HIDDEN, ReviewRow.STATUS_PUBLISHED))));
    }

    /**
     * 全额退款的行不可评：{@code findRefundable} 只认 paid / partially_refunded 的组，
     * 查空 = 组已全额退款（行必存在——它的 id 就在本评价行上）；查到但件数退满同样拦。
     */
    private void ensureNotFullyRefunded(ReviewRow row) {
        boolean fullyRefunded = trade.findRefundable(row.orderLineId())
                .map(line -> line.refundedQty() >= line.quantity())
                .orElse(true);
        if (fullyRefunded) {
            throw BusinessException.conflict(ErrorCodes.REVIEW_LINE_REFUNDED, "已全额退款的商品不能评价");
        }
    }

    /** 公开文本的违禁词闸。评价 / 追评 / 商家回复三个口都过这里。 */
    private void ensurePublishable(String content) {
        if (content == null || content.isBlank()) {
            return;
        }
        forbiddenWords.firstHit(content).ifPresent(hit -> {
            throw BusinessException.badRequest(
                    ErrorCodes.FORBIDDEN_WORD_HIT,
                    "内容命中违禁词",
                    List.of(Map.of("field", "content", "message", "评价内容命中违禁词", "value", hit)));
        });
    }

    private static String blankToNull(String text) {
        return text == null || text.isBlank() ? null : text.strip();
    }
}
