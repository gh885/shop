@ApplicationModule(
        displayName = "Pricing [core]",
        allowedDependencies = {"catalog :: api", "promotion :: api", "seller :: api"})
package com.shop.platform.pricing;

import org.springframework.modulith.ApplicationModule;
