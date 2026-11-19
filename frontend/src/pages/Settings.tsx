// 설정 화면. 계정(비밀번호 변경·임원진 계정 관리)과 이 브라우저에 저장하는 화면 설정을 모은다.
import type { ApiUser } from '../api';
import { Heading } from '../ui';
import type { ViewProps } from '../ui';
import { AccountAdmin, MyAccount } from './Accounts';

/** 설정 화면. refreshAccount는 내 계정 정보가 바뀌었을 때 서버 값을 다시 받아온다. */
// account: 로그인한 서버 계정 정보
export function Settings({
  setPrefs,
  notify,
  account,
  refreshAccount
}: ViewProps & { account: ApiUser | null; refreshAccount: () => void }) {
  return (
    <>
      <Heading title="설정" />
      {/* 내 계정, 임원진이면 계정 관리까지 */}
      {account && <MyAccount account={account} notify={notify} />}
      {account?.officer && <AccountAdmin me={account} notify={notify} onSelfChange={refreshAccount} />}
      {/* 이 브라우저에 저장한 화면 설정 */}
      <section className="settings-block">
        <div className="settings-row">
          <div>
            <h2>화면 설정</h2>
            <p>채팅 폭과 최근 방, 접기 상태를 이 브라우저에 보관함</p>
          </div>
          <button className="button small" onClick={() => setPrefs({ chatWidth: 300, collapsed: false })}>
            초기화
          </button>
        </div>
      </section>
    </>
  );
}
