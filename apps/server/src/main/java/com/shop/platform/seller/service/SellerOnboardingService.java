package com.shop.platform.seller.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.PasswordPolicy;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.security.RateLimiter;
import com.shop.platform.seller.events.MerchantRegistered;
import com.shop.platform.seller.events.MerchantResubmitted;
import com.shop.platform.seller.events.ShopClosed;
import com.shop.platform.seller.mapper.MerchantOnboardingMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 入驻与店铺生命周期。身份在这里即时成立——注册一个事务里写
 * merchant + 主账号 operator + 默认 shop，账号能登录、能建草稿；
 * 「能不能卖」是另一回事，审核状态机住 governance.seller_profile，
 * 注册只发 {@link MerchantRegistered} 让治理侧进队列。
 *
 * <p>登录名冲突用唯一索引兜底而不是先查后插：预检通过到插入之间窗口照样能撞，
 * 唯一索引是唯一可靠的裁决者。
 */
@Component
public class SellerOnboardingService {

    private static final Logger log = LoggerFactory.getLogger(SellerOnboardingService.class);

    private static final String RATE_REGISTER_IP = "rl:ip:seller-register:";
    private static final int RATE_REGISTER_MAX = 5;
    private static final Duration RATE_REGISTER_WINDOW = Duration.ofHours(1);

    private final MerchantOnboardingMapper mapper;
    private final AuditCommand audit;
    private final ApplicationEventPublisher events;
    private final PasswordEncoder passwordEncoder;
    private final RateLimiter rateLimiter;

    public SellerOnboardingService(
            MerchantOnboardingMapper mapper,
            AuditCommand audit,
            ApplicationEventPublisher events,
            PasswordEncoder passwordEncoder,
            RateLimiter rateLimiter) {
        this.mapper = Objects.requireNonNull(mapper, "mapper");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.events = Objects.requireNonNull(events, "events");
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder, "passwordEncoder");
        this.rateLimiter = Objects.requireNonNull(rateLimiter, "rateLimiter");
    }

    @Transactional
    public Registration register(String name, String loginName, String password, String clientIp) {
        if (rateLimiter.exceeded(RATE_REGISTER_IP + clientIp, RATE_REGISTER_MAX, RATE_REGISTER_WINDOW)) {
            throw BusinessException.rateLimited("注册请求太频繁，请稍后再试");
        }
        PasswordPolicy.require(password, loginName);

        UUID merchantId = Ids.newId();
        UUID operatorId = Ids.newId();
        UUID shopId = Ids.newId();
        try {
            mapper.insertMerchant(merchantId, name);
            mapper.insertPrimaryOperator(operatorId, merchantId, loginName, passwordEncoder.encode(password), name);
            mapper.insertShop(shopId, merchantId, name);
            mapper.insertOnboarding(merchantId);
        } catch (DuplicateKeyException e) {
            // 三条 insert 只有 login_name 撞唯一索引这一种可能，不用区分来源
            throw BusinessException.conflict(ErrorCodes.LOGIN_NAME_TAKEN, "这个登录名已被使用，请换一个");
        }
        audit.record(AuditEntry.byMerchant(
                "seller.merchant.registered",
                "merchant",
                merchantId.toString(),
                merchantId,
                Map.of(
                        "name",
                        FieldChange.to(name),
                        "login_name",
                        FieldChange.to(loginName),
                        "shop_id",
                        FieldChange.to(shopId.toString()))));
        events.publishEvent(new MerchantRegistered(Ids.newId(), merchantId, name, shopId, Instant.now()));
        log.info("[SELLER] 商家注册成功, merchantId={}", merchantId);
        return new Registration(merchantId, operatorId, shopId);
    }

    /** 改店名。店铺不存在或已关店时拒绝——closed 是终态。 */
    @Transactional
    public void renameShop(UUID merchantId, UUID operatorId, String newName) {
        MerchantOnboardingMapper.ShopRow shop = requireActiveShop(merchantId);
        if (mapper.renameShop(shop.id(), newName) == 0) {
            throw BusinessException.conflict("SELLER_STATUS_CONFLICT", "店铺当前不可改名");
        }
        audit.record(AuditEntry.byMerchant(
                "seller.shop.renamed",
                "shop",
                shop.id().toString(),
                merchantId,
                Map.of("name", FieldChange.of(shop.name(), newName))));
    }

    /**
     * 关店：终态 CAS，不设重开路径。在途订单不拦——已成立的交易事实照常履约，
     * 拦不住也不该拦；挡的是「关店后还有新东西可卖」，那由 ShopClosed 级联下架解决。
     */
    @Transactional
    public void closeShop(UUID merchantId, UUID operatorId, String reason) {
        MerchantOnboardingMapper.ShopRow shop = requireActiveShop(merchantId);
        if (mapper.closeShop(shop.id()) == 0) {
            throw BusinessException.conflict("SELLER_STATUS_CONFLICT", "店铺当前不可关闭");
        }
        audit.record(AuditEntry.byMerchant(
                "seller.shop.closed",
                "shop",
                shop.id().toString(),
                merchantId,
                Map.of(
                        "status",
                        FieldChange.of("active", "closed"),
                        "reason",
                        FieldChange.to(reason == null ? "" : reason))));
        events.publishEvent(new ShopClosed(Ids.newId(), merchantId, shop.id(), operatorId, Instant.now()));
        log.info("[SELLER] 店铺已关闭, merchantId={}, shopId={}", merchantId, shop.id());
    }

    /** 被拒后重提。投影先翻回 pending（闸门），governance 消费事件做权威侧的 CAS。 */
    @Transactional
    public void resubmit(UUID merchantId) {
        if (!"rejected".equals(mapper.onboardingStatus(merchantId).orElse(null))) {
            throw BusinessException.conflict("SELLER_STATUS_CONFLICT", "当前状态不可重新提交审核");
        }
        if (mapper.resubmitOnboarding(merchantId) == 0) {
            throw BusinessException.conflict("SELLER_STATUS_CONFLICT", "当前状态不可重新提交审核");
        }
        audit.record(AuditEntry.byMerchant(
                "seller.merchant.resubmitted",
                "merchant",
                merchantId.toString(),
                merchantId,
                Map.of("status", FieldChange.of("rejected", "pending"))));
        events.publishEvent(new MerchantResubmitted(Ids.newId(), merchantId, Instant.now()));
    }

    private MerchantOnboardingMapper.ShopRow requireActiveShop(UUID merchantId) {
        return mapper.findActiveShop(merchantId).orElseThrow(() -> BusinessException.notFound("没有启用中的店铺"));
    }

    /** 注册出参：operatorId 供控制器立即签发会话，shopId 供事件与审计。 */
    public record Registration(UUID merchantId, UUID operatorId, UUID shopId) {}
}
