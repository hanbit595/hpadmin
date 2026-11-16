// 정의되지 않은 /api/* 주소
import { fail, type Env } from '../../server/http';

export const onRequest: PagesFunction<Env> = async () => fail(404, '없는 요청 주소입니다.');
