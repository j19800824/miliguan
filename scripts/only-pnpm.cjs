const userAgent = process.env.npm_config_user_agent || '';
const execPath = process.env.npm_execpath || '';

if (!userAgent.includes('pnpm') && !execPath.includes('pnpm')) {
  console.error('\n请使用 pnpm 管理依赖：pnpm install\n');
  process.exit(1);
}
