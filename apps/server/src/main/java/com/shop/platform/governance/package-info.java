@ApplicationModule(
        displayName = "Governance [core]",
        allowedDependencies = {"seller :: api", "seller :: events", "audit :: api"})
package com.shop.platform.governance;

import org.springframework.modulith.ApplicationModule;
