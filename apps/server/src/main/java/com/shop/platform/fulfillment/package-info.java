@ApplicationModule(
        displayName = "Fulfillment [core]",
        allowedDependencies = {"trade :: api", "trade :: events", "governance :: api", "inventory :: api"})
package com.shop.platform.fulfillment;

import org.springframework.modulith.ApplicationModule;
