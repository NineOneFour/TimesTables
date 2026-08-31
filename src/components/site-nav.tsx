import Link from 'next/link'
import { signOut } from '@/app/actions/auth'
import styles from './site-nav.module.css'

/*
  Chrome for the analysis screens. Never rendered during a run.

  The links differ by role rather than by page: a kid may look at their own
  table, results and trends, but practice setup belongs to the parent. This is
  presentation only — the pages themselves are what enforce it.
*/

/** `kid` scopes every link, so a parent stays on the child they were reading. */
function withKid(href: string, kidId?: number): string {
  if (kidId === undefined) return href
  return `${href}${href.includes('?') ? '&' : '?'}kid=${kidId}`
}

export default function SiteNav({
  role,
  current,
  kidId,
  kidName,
}: {
  role: 'parent' | 'kid'
  current?: string
  kidId?: number
  kidName?: string
}) {
  const links =
    role === 'parent'
      ? [
          { href: '/kids', label: 'Children', scoped: false },
          { href: '/trends', label: 'Trends', scoped: true },
          { href: '/table', label: 'Times table', scoped: true },
          { href: '/settings', label: 'Settings', scoped: true },
        ]
      : [
          { href: '/', label: 'Practice', scoped: false },
          { href: '/trends', label: 'Trends', scoped: false },
          { href: '/table', label: 'Times table', scoped: false },
        ]

  return (
    <nav className={styles.bar}>
      <Link className={styles.brand} href={role === 'parent' ? '/kids' : '/'}>
        Multiplication Practice
      </Link>
      <div className={styles.links}>
        {role === 'parent' && kidName && (
          <span className={styles.who}>{kidName}</span>
        )}
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.scoped ? withKid(link.href, kidId) : link.href}
            className={`${styles.link} ${current === link.href ? styles.current : ''}`}
          >
            {link.label}
          </Link>
        ))}
        <form action={signOut}>
          <button type="submit" className={styles.signOut}>
            Sign out
          </button>
        </form>
      </div>
    </nav>
  )
}
