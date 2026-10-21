@ApplicationModule(
        displayName = "Pricing [core]",
        allowedDependencies = {"catalog :: api", "promotion :: api"})
package com.shop.platform.pricing;

import org.springframework.modulith.ApplicationModule;
