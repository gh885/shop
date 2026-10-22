@ApplicationModule(
        displayName = "Catalog [core]",
        allowedDependencies = {"trust :: api", "audit :: api"})
package com.shop.platform.catalog;

import org.springframework.modulith.ApplicationModule;
