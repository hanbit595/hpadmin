// 미리보기 자리 (단계 3 에서 홈페이지 CSS·마크업으로 그림)
import type { Board, Lang } from '../../shared/boards';
import type { AssetCtx } from '../assets';
import type { Form } from './PostEditor';

export default function Preview(_props: { lang: Lang; board: Board; subject: string; form: Form; body: string; ctx: AssetCtx }) {
  return (
    <div className="pv">
      <p className="muted">실제 모양 미리보기는 3-2c 단계 3에서 만듭니다.</p>
    </div>
  );
}
