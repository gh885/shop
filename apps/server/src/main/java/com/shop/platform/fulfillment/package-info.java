@ApplicationModule(
        displayName = "Fulfillment [core]",
        allowedDependencies = {"trade :: api", "trade :: events", "trust :: api"})
package com.shop.platform.fulfillment;

import org.springframework.modulith.ApplicationModule;
