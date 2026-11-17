// GET /api/deploy/status : hopage 최근 Actions 실행 1건 + main 최근 커밋 5건. 로그인 필요, 읽기 전용.
import { GitHubError, REPO, ghJson } from '../../../server/github';
import { fail, json, type Env } from '../../../server/http';
import { getSession } from '../../../server/session';

interface Run {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  head_sha: string;
}

interface Job {
  name: string;
  conclusion: string | null;
  steps?: { name: string; conclusion: string | null }[];
}

interface Commit {
  sha: string;
  commit: { message: string; author: { date: string } | null; committer: { date: string } | null };
}

const CONCLUSION_KO: Record<string, string> = {
  failure: '빌드 또는 배포 중 오류',
  cancelled: '실행이 취소됨',
  timed_out: '시간 초과',
  action_required: '확인이 필요함',
  startup_failure: '실행을 시작하지 못함',
  stale: '오래되어 중단됨',
  skipped: '건너뜀',
  neutral: '결과 없음',
};

async function failReason(env: Env, run: Run): Promise<string> {
  const base = CONCLUSION_KO[run.conclusion ?? ''] ?? `결과: ${run.conclusion ?? '알 수 없음'}`;
  if (run.conclusion !== 'failure') return base;
  try {
    const jobs = await ghJson<{ jobs: Job[] }>(env, `/repos/${REPO}/actions/runs/${run.id}/jobs`, { kind: 'actions' });
    for (const job of jobs.jobs) {
      const step = job.steps?.find((s) => s.conclusion === 'failure');
      if (step) return `${base} — 실패 단계: ${step.name}`;
    }
  } catch {
    // 이유를 더 읽지 못해도 기본 안내만 보여 준다
  }
  return base;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');

  const [runResult, commitResult] = await Promise.allSettled([
    ghJson<{ workflow_runs: Run[] }>(env, `/repos/${REPO}/actions/runs?branch=main&per_page=1`, { kind: 'actions' }),
    ghJson<Commit[]>(env, `/repos/${REPO}/commits?sha=main&per_page=5`),
  ]);

  const errText = (r: PromiseRejectedResult) => (r.reason instanceof GitHubError ? r.reason.message : '확인하지 못했습니다.');

  let deploy: Record<string, unknown>;
  if (runResult.status === 'fulfilled') {
    const run = runResult.value.workflow_runs[0];
    if (!run) deploy = { state: 'none', label: '실행 기록 없음' };
    else {
      const state = run.status !== 'completed' ? 'running' : run.conclusion === 'success' ? 'success' : 'failure';
      deploy = {
        state,
        label: state === 'running' ? '반영 중' : state === 'success' ? '반영 완료' : '반영 실패',
        reason: state === 'failure' ? await failReason(env, run) : '',
        startedAt: run.created_at,
        updatedAt: run.updated_at,
        commit: run.head_sha.slice(0, 7),
        url: run.html_url,
      };
    }
  } else deploy = { state: 'error', label: '확인 실패', reason: errText(runResult) };

  const commits =
    commitResult.status === 'fulfilled'
      ? {
          ok: true,
          items: commitResult.value.map((c) => ({
            sha: c.sha.slice(0, 7),
            message: c.commit.message.split('\n')[0].slice(0, 200),
            date: c.commit.author?.date ?? c.commit.committer?.date ?? '',
          })),
        }
      : { ok: false, error: errText(commitResult), items: [] };

  return json({ ok: true, deploy, commits });
};
