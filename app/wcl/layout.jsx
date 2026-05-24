"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import styles from "./wcl.module.css";

// Gate is currently disabled – /wcl/ is a sub-module of /offi-stuff/ and
// relies on that page's password gate. To re-enable a standalone gate (e.g.
// when moving WCL back to the landing page), uncomment the block below and
// swap the return statement.
//
// import { useRef } from "react";
// const STORAGE_KEY = "offi-auth";
// const STORAGE_VALUE = "1";
// ... (full gate implementation preserved in git history)

export default function WclLayout({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const pathname = usePathname();

  if (!mounted) return null;

  function sidebarClass(href) {
    const active = pathname === href || pathname === href.replace(/\/$/, "");
    return `${styles.sidebarLink} ${active ? styles.sidebarLinkActive : ""}`;
  }

  return (
    <div className={styles.shell}>
      <nav className={styles.topnav}>
        <a className={styles.brand} href="/">Whatever</a>
        <div className={styles.navLinks}>
          <a className={styles.navLink} href="/boosting/">Boosting</a>
          <a className={styles.navLink} href="/royale/">Whatever Royale</a>
          <a className={`${styles.navLink} ${styles.navLinkActive}`} href="/offi-stuff/">Offizeug</a>
        </div>
      </nav>

      <aside className={styles.sidebar}>
        <a className={styles.sidebarLink} href="/offi-stuff/kalender/">Kalender</a>
        <a className={styles.sidebarLink} href="/offi-stuff/member/">Member</a>
        <div className={styles.sidebarDivider} />
        <a className={sidebarClass("/wcl/")} href="/wcl/">WCL Analyse</a>
        <a className={sidebarClass("/wcl/templates/")} href="/wcl/templates/">Query Templates</a>
        <a className={sidebarClass("/wcl/spells/")} href="/wcl/spells/">Spell Filter</a>
      </aside>
      <main className={styles.main}>
        {children}
      </main>

      {/* Wowhead tooltip widget – purely visual, loads last */}
      <Script id="wowhead-cfg" strategy="afterInteractive">
        {`const whTooltips = { colorLinks: false, iconizeLinks: false, renameLinks: false };`}
      </Script>
      <Script src="https://wow.zamimg.com/js/tooltips.js" strategy="lazyOnload" />
    </div>
  );
}
