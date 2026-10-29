@ApplicationModule(
        displayName = "Catalog [core]",
        allowedDependencies = {
            "governance :: api",
            "governance :: events",
            "seller :: events",
            "audit :: api",
            "inventory :: api"
        })
package com.shop.platform.catalog;

import org.springframework.modulith.ApplicationModule;
