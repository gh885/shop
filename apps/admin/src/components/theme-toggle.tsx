import { Button } from '@shop/ui-web';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useState } from 'react';

// 主题持久化 key，与 index.html 首屏初始化脚本保持一致
const THEME_KEY = 'shop_admin_theme';

/** 亮暗切换：写 <html data-theme> 驱动 color-scheme（ui-web 语义层经 light-dark() 切色），localStorage 持久化 */
export function ThemeToggle() {
    const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');

    const toggle = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.dataset.theme = next ? 'dark' : 'light';
        localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    };

    return (
        <Button
            variant="ghost"
            size="icon-sm"
            title={dark ? '切换到亮色' : '切换到暗色'}
            onClick={toggle}
        >
            {dark ? <SunIcon /> : <MoonIcon />}
        </Button>
    );
}
