package com.shop.platform.staff.controller;

import com.shop.platform.staff.dto.StaffLoginRequest;
import com.shop.platform.staff.service.StaffLoginService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 平台员工登录。第三套身份域，入口与卖家、买家各自独立。 */
@RestController
@RequestMapping("/api/staff")
public class StaffLoginController {

    private final StaffLoginService loginService;

    public StaffLoginController(StaffLoginService loginService) {
        this.loginService = loginService;
    }

    @PostMapping("/login")
    public StaffLoginService.LoginResult login(@Valid @RequestBody StaffLoginRequest request) {
        return loginService.login(request.loginName(), request.password());
    }
}
