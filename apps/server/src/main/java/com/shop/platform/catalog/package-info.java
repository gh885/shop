@ApplicationModule(
        displayName = "Catalog [core]",
        allowedDependencies = {"governance :: api", "audit :: api"})
package com.shop.platform.catalog;

import org.springframework.modulith.ApplicationModule;
