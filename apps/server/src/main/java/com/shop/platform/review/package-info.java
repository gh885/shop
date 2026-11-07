@ApplicationModule(
        displayName = "Review [ugc]",
        allowedDependencies = {"trade :: api", "trade :: events", "governance :: api", "account :: api", "audit :: api"
        })
package com.shop.platform.review;

import org.springframework.modulith.ApplicationModule;
