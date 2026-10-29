package com.shop.platform.seller.mapper;

import com.shop.platform.seller.api.OnboardingCommand;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** 入驻审核结论回写的实现：卖家侧只翻申请单状态，审核判定与审计归 governance。 */
@Component
public class OnboardingCommandImpl implements OnboardingCommand {

    private final MerchantOnboardingMapper onboarding;

    public OnboardingCommandImpl(MerchantOnboardingMapper onboarding) {
        this.onboarding = Objects.requireNonNull(onboarding, "onboarding");
    }

    @Override
    public void approve(UUID merchantId) {
        onboarding.decideOnboarding(merchantId, "approved", null);
    }

    @Override
    public void reject(UUID merchantId, String reason) {
        onboarding.decideOnboarding(merchantId, "rejected", reason);
    }
}
