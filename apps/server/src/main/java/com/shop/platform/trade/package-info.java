@ApplicationModule(
        displayName = "Trade [core]",
        allowedDependencies = {
            "account :: api",
            "catalog :: api",
            "pricing :: api",
            "inventory :: api",
            "governance :: api",
            "payment :: api",
            "payment :: events"
        })
package com.shop.platform.trade;

import org.springframework.modulith.ApplicationModule;
