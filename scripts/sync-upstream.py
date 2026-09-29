"""Merge LibreTV updates while retaining this site's Cloudflare deployment."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTECTED = [
    '.github/workflows/update-deploy.yml',
    'scripts/sync-upstream.py',
    'open-next.config.ts',
    'wrangler.jsonc',
    'public/_headers',
    '.gitignore',
    'package.json',
    'package-lock.json',
    'src/lib/ssrf.ts',
    'src/lib/source-list.ts',
    'src/lib/auth.ts',
    'src/lib/api-guard.ts',
    'src/lib/client-api.ts',
    'src/lib/client-api.test.ts',
    'src/app/api/auth/route.ts',
    'src/app/api/status/route.ts',
    'src/app/api/search/route.ts',
    'src/app/api/search/route.test.ts',
    'src/app/page.tsx',
    'src/components/auth.tsx',
    'src/components/source-manager.tsx',
    'src/components/video-card.tsx',
    'src/components/video-card.test.ts',
    'src/components/settings-shared.tsx',
    'src/lib/store.ts',
    'src/lib/store.test.ts',
    'src/lib/tvbox-parser.test.ts',
]


def git(*args, check=True):
    return subprocess.run(['git', *args], cwd=ROOT, check=check,
                          capture_output=True, text=True)


def main():
    if git('status', '--porcelain').stdout.strip():
        raise RuntimeError('Upstream sync requires a clean checkout')
    original = git('rev-parse', 'HEAD').stdout.strip()
    git('fetch', '--no-tags', 'https://github.com/LibreSpark/LibreTV.git', 'main')
    if git('merge-base', '--is-ancestor', 'FETCH_HEAD', 'HEAD', check=False).returncode == 0:
        print('Upstream already integrated')
        return
    protected = {name: git('show', f'{original}:{name}').stdout for name in PROTECTED}
    merged = git('merge', '--no-edit', '-X', 'ours', 'FETCH_HEAD', check=False)
    if merged.returncode:
        git('merge', '--abort', check=False)
        raise RuntimeError(f'Upstream merge failed; current release remains active: {merged.stderr}')
    for name, content in protected.items():
        (ROOT / name).parent.mkdir(parents=True, exist_ok=True)
        (ROOT / name).write_text(content, encoding='utf-8')
    for workflow in (ROOT / '.github' / 'workflows').glob('*'):
        if workflow.name != 'update-deploy.yml' and workflow.is_file():
            workflow.unlink()
    git('add', *PROTECTED)
    git('add', '-A', '.github/workflows')
    if git('diff', '--cached', '--quiet', check=False).returncode:
        git('commit', '-m', 'chore: retain Cloudflare deployment after upstream sync')
    print('Upstream integrated with local deployment preserved')


if __name__ == '__main__':
    main()
