import styles from "./page.module.css";

const modules = [
  {
    href: "/boosting/",
    name: "Boosting",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    ),
  },
  {
    href: "/royale/",
    name: "Whatever Royale",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/>
        <path d="M5 21h14"/>
      </svg>
    ),
  },
  {
    href: "/offi-stuff/",
    name: "Offizeug",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  // WCL ist Submodul von Offizeug – kein eigener Landing-Page-Eintrag.
  // Zum Reaktivieren: Objekt hier wieder einfügen (href: "/wcl/", name: "Warcraftlogs", …).
];

const ChevronRight = () => (
  <svg className={styles.arrow} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6"/>
  </svg>
);

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.landing}>
        <h1 className={styles.title}>Whatever</h1>
        <div className={styles.modules}>
          {modules.map((m) => (
            <a key={m.href} className={styles.card} href={m.href}>
              <div className={styles.icon}>{m.icon}</div>
              <div className={styles.name}>{m.name}</div>
              <ChevronRight />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
