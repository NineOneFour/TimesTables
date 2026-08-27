import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  // Next writes AGENTS.md/CLAUDE.md on dev startup unless this is off.
  agentRules: false,
}

export default nextConfig
