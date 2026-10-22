@ApplicationModule(
        displayName = "Trade [core]",
        allowedDependencies = {
            "catalog :: api",
            "pricing :: api",
            "inventory :: api",
            "trust :: api",
            "payment :: api",
            "payment :: events"
        })
package com.shop.platform.trade;

import org.springframework.modulith.ApplicationModule;
