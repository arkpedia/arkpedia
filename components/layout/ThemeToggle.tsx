import { useEffect, useState } from 'react';
import Image from '@/components/content/ContentImage';
import { THEME_COLOR } from '@/lib/nav/themeColor';
import { CLOUD_RESTORED_EVENT } from '@/lib/cloud-account/events';

export default function ThemeToggle({ menu = false }: { menu?: boolean }) {
  const [theme, setTheme] = useState<'dark' | 'light' | null>(null);

  useEffect(() => {
    const read = () => setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    read();
    window.addEventListener(CLOUD_RESTORED_EVENT, read);
    return () => window.removeEventListener(CLOUD_RESTORED_EVENT, read);
  }, []);

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    if (next === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try {
      localStorage.setItem('theme', next);
    } catch {
      // localStorage unavailable (private browsing, etc.) -- theme
      // just won't persist across visits, not worth failing over.
    }
    // Keep browser chrome (mobile URL bar etc.) on the theme's --bg; the boot
    // script in _document does the same for the initial paint.
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[next === 'light' ? 'light' : 'dark']);
  }

  // Avoid a server/client mismatch -- render nothing until mounted,
  // since the real theme can only be known client-side. Disabled so the
  // placeholder isn't a dead control in the tab order for that moment.
  if (!theme) return <button type="button" className={menu ? 'theme-toggle theme-toggle-menu btn-bare site-nav-popitem' : 'theme-toggle'} aria-label="Toggle theme" disabled />;

  return (
    <button
      type="button"
      className={menu ? 'theme-toggle theme-toggle-menu btn-bare site-nav-popitem' : 'theme-toggle'}
      onClick={toggle}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {/* Decorative -- the button's aria-label already names the action, and a
          second name from alt made screen readers announce it twice. */}
      <Image src="/six-star-icons/Suzuran - Base.webp" alt="" width={22} height={22} />
      {menu && <span>{theme === 'light' ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  );
}
