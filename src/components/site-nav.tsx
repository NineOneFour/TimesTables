import Link from 'next/link'
import styles from './site-nav.module.css'

const LINKS = [
  { href: '/table', label: 'Times table' },
  { href: '/trends', label: 'Trends' },
  { href: '/settings', label: 'Settings' },
]

/** Chrome for the analysis screens. Never rendered during a run. */
export default function SiteNav({ current }: { current?: string }) {
  return (
    <nav className={styles.bar}>
      <Link className={styles.brand} href="/">
        Multiplication Practice
      </Link>
      <div className={styles.links}>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`${styles.link} ${current === link.href ? styles.current : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
