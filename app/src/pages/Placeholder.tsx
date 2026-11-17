// 아직 만들지 않은 메뉴의 자리 화면
import { pathOf, type Lang } from '../nav';
import { linkClick } from '../router';

export default function Placeholder({
  title,
  group,
  message,
  lang,
  denied,
}: {
  title: string;
  group?: string;
  message: string;
  lang: Lang;
  denied?: boolean;
}) {
  const home = pathOf(lang, '');
  return (
    <>
      <div className="page-head">
        {group && <div className="crumb">{group}</div>}
        <h1 className="page-title">{title}</h1>
      </div>
      <section className={`card placeholder${denied ? ' denied' : ''}`}>
        <p>{message}</p>
        <a className="btn-outline" href={home} onClick={linkClick(home)}>
          대시보드로 가기
        </a>
      </section>
    </>
  );
}
