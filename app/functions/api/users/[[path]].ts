// /api/users/* (직원 계정, 관리자 전용). 권한 확인은 api/_middleware.ts. 기능은 3-2e 에서 만든다.
import { fail, type Env } from '../../../server/http';

export const onRequest: PagesFunction<Env> = async () => fail(501, '직원 계정 기능은 3-2e 에서 만들 예정입니다.');
