import { join } from 'node:path';

import {
  buildDiffPathspecs,
  filterCommitsByMessageRegexes,
  parseDiffSummary,
  type CommitInfo,
} from '../src/git/gitDiff';

describe('buildDiffPathspecs', () => {
  const repoRoot = join(__dirname, 'fixture-repo-root');

  it('returns whole repo when no filter', () => {
    expect(buildDiffPathspecs(repoRoot)).toEqual(['.']);
  });

  it('returns whole repo with exclude pathspecs', () => {
    expect(buildDiffPathspecs(repoRoot, { excludeFolders: ['node_modules', 'dist'] })).toEqual([
      '.',
      ':(exclude)node_modules',
      ':(exclude)dist',
    ]);
  });

  it('uses include folders without dot when specified', () => {
    expect(
      buildDiffPathspecs(repoRoot, {
        includeFolders: ['src', 'packages/lib'],
        excludeFolders: ['src/generated'],
      })
    ).toEqual(['src', 'packages/lib', ':(exclude)src/generated']);
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(buildDiffPathspecs(repoRoot, { includeFolders: ['src\\app'] })).toEqual(['src/app']);
  });

  it('throws when path escapes the repository', () => {
    expect(() => buildDiffPathspecs(repoRoot, { includeFolders: ['../outside'] })).toThrow(/escapes repository root/);
  });

  it('throws on invalid include regex path via parent segments', () => {
    expect(() => buildDiffPathspecs(repoRoot, { includeFolders: ['foo/../../etc'] })).toThrow(/escapes repository root/);
  });

  it('treats root-like include as empty and still applies excludes', () => {
    expect(buildDiffPathspecs(repoRoot, { includeFolders: ['/'], excludeFolders: ['tmp'] })).toEqual(['.', ':(exclude)tmp']);
  });
});

describe('filterCommitsByMessageRegexes', () => {
  const commits: CommitInfo[] = [
    { hash: 'a1', message: 'feat: add login' },
    { hash: 'b2', message: 'chore: bump deps' },
    { hash: 'c3', message: 'fix: handle edge case' },
  ];

  it('returns all commits when no patterns', () => {
    expect(filterCommitsByMessageRegexes(commits)).toEqual(commits);
    expect(filterCommitsByMessageRegexes(commits, [], [])).toEqual(commits);
  });

  it('applies exclude before include', () => {
    const out = filterCommitsByMessageRegexes(commits, ['feat:', 'fix:'], ['chore:']);
    expect(out.map((c) => c.hash)).toEqual(['a1', 'c3']);
  });

  it('requires OR match across include patterns', () => {
    const out = filterCommitsByMessageRegexes(commits, ['^feat:', '^fix:']);
    expect(out).toHaveLength(2);
    expect(out[0]?.hash).toBe('a1');
    expect(out[1]?.hash).toBe('c3');
  });

  it('drops commits matching exclude only', () => {
    const out = filterCommitsByMessageRegexes(commits, undefined, ['chore:']);
    expect(out.map((c) => c.hash)).toEqual(['a1', 'c3']);
  });

  it('is case-insensitive for regex', () => {
    const out = filterCommitsByMessageRegexes([{ hash: 'x', message: 'FEAT: caps' }], ['feat:']);
    expect(out).toHaveLength(1);
  });

  it('throws on invalid include pattern', () => {
    expect(() => filterCommitsByMessageRegexes(commits, ['('], [])).toThrow(/include pattern\[0\]/);
  });

  it('throws on invalid exclude pattern', () => {
    expect(() => filterCommitsByMessageRegexes(commits, [], ['('])).toThrow(/exclude pattern\[0\]/);
  });
});

describe('parseDiffSummary', () => {
  it('parses modified file line', () => {
    const summary = parseDiffSummary('M\t10\t2\tsrc/foo.ts');
    expect(summary.totalFiles).toBe(1);
    expect(summary.totalAdditions).toBe(10);
    expect(summary.totalDeletions).toBe(2);
    expect(summary.files[0]).toMatchObject({
      path: 'src/foo.ts',
      status: 'modified',
      additions: 10,
      deletions: 2,
    });
  });

  it('merges duplicate paths', () => {
    const summary = parseDiffSummary(['M\t1\t1\tpath/a.ts', 'M\t2\t0\tpath/a.ts'].join('\n'));
    expect(summary.totalFiles).toBe(1);
    expect(summary.files[0]?.additions).toBe(3);
    expect(summary.files[0]?.deletions).toBe(1);
  });

  it('parses rename with old and new path', () => {
    const summary = parseDiffSummary('R100\t5\t5\told/name.ts\tnew/name.ts');
    expect(summary.files[0]).toMatchObject({
      path: 'new/name.ts',
      status: 'renamed',
      oldPath: 'old/name.ts',
    });
  });

  it('ignores malformed lines', () => {
    const summary = parseDiffSummary('not-a-summary-line\n\nM\t1\t1\tok.ts');
    expect(summary.totalFiles).toBe(1);
  });

  it('parses added, deleted, copied, type-changed, and dash counts', () => {
    const raw = ['A\t1\t0\tnew.ts', 'D\t0\t5\tdel.ts', 'C100\t1\t1\to\tc.ts', 'T\t0\t0\tt.ext', 'M\t-\t3\tdash.ts'].join('\n');
    const s = parseDiffSummary(raw);
    expect(s.files.find((f) => f.path === 'new.ts')?.status).toBe('added');
    expect(s.files.find((f) => f.path === 'del.ts')?.status).toBe('deleted');
    expect(s.files.find((f) => f.path === 'c.ts')?.status).toBe('copied');
    expect(s.files.find((f) => f.path === 't.ext')?.status).toBe('type-changed');
    expect(s.files.find((f) => f.path === 'dash.ts')).toMatchObject({ additions: 0, deletions: 3 });
  });

  it('maps unknown status token to unknown', () => {
    const s = parseDiffSummary('X\t1\t1\tweird.bin');
    expect(s.files[0]?.status).toBe('unknown');
  });

  it('skips lines with too many tab fields', () => {
    const s = parseDiffSummary('M\t1\t1\ta\tb\tc\textra');
    expect(s.totalFiles).toBe(0);
  });

  it('merges conflicting statuses on the same path toward higher-precedence status', () => {
    const s = parseDiffSummary(['M\t1\t1\tshared.ts', 'D\t0\t1\tshared.ts'].join('\n'));
    expect(s.files[0]?.status).toBe('deleted');
  });
});
