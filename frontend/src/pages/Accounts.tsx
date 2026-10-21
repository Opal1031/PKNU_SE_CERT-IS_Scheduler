import { Fragment, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { changePassword, createAccount, listAccounts, resetPassword, updateAccount } from '../api';
import type { ApiUser, Role } from '../api';
import { Field, Select } from '../ui';

const ROLE_LABEL: Record<Role, string> = { officer: '임원진', member: '일반 부원' };
const ROLES: [Role, string][] = [['member', ROLE_LABEL.member], ['officer', ROLE_LABEL.officer]];
// 서버 규칙과 같게 맞춘다: 아이디 영문·숫자·_.- 3~50자, 비밀번호 8~128자, 이름 1~50자.
const USERNAME_PATTERN = '[A-Za-z0-9_.\\-]{3,50}';

type Notify = (message: string) => void;

// 제출 중 표시와 오류 문구를 폼마다 같은 방식으로 다룬다. 실패하면 비밀번호 입력은 비운다.
function useSubmit(action: (data: FormData, form: HTMLFormElement) => Promise<void>) {
  const [error, setError] = useState(''), [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(''); setPending(true);
    try { await action(new FormData(form), form); }
    catch (failure) {
      setError((failure as Error).message);
      form.querySelectorAll<HTMLInputElement>('input[type=password]').forEach(input => { input.value = ''; });
    }
    finally { setPending(false); }
  }
  return { error, pending, submit };
}

const text = (data: FormData, key: string) => String(data.get(key) ?? '');

export function MyAccount({ account, notify }: { account: ApiUser; notify: Notify }) {
  const { error, pending, submit } = useSubmit(async (data, form) => {
    const current = text(data, 'currentPassword'), next = text(data, 'newPassword');
    if (next !== text(data, 'confirmPassword')) throw new Error('새 비밀번호와 확인 값이 달라요.');
    if (next === current) throw new Error('현재 비밀번호와 다른 비밀번호를 입력해주세요.');
    await changePassword(current, next);
    form.reset(); notify('비밀번호를 변경했어요.');
  });
  return <section className="settings-block" aria-labelledby="my-account-title">
    <h2 id="my-account-title">내 계정</h2>
    <p className="note-line">{account.name} · {account.username} · {ROLE_LABEL[account.role]}</p>
    <form className="account-form" aria-label="비밀번호 변경" onSubmit={submit}>
      {/* 비밀번호 관리자가 어느 계정의 비밀번호인지 알 수 있게 아이디를 함께 둔다. */}
      <input type="text" name="username" autoComplete="username" value={account.username} readOnly hidden />
      <Field label="현재 비밀번호" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} />
      <Field label="새 비밀번호 (8자 이상)" name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      <Field label="새 비밀번호 확인" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary small" type="submit" disabled={pending}>{pending ? '변경 중' : '비밀번호 변경'}</button>
    </form>
  </section>;
}

export function AccountAdmin({ me, notify, onSelfChange }: { me: ApiUser; notify: Notify; onSelfChange: () => void }) {
  const [accounts, setAccounts] = useState<ApiUser[] | null>(null), [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false), [editing, setEditing] = useState<number | null>(null);
  useEffect(() => { listAccounts().then(setAccounts).catch((error: Error) => setLoadError(error.message)); }, []);
  function saved(account: ApiUser) {
    setAccounts(list => list?.map(item => item.id === account.id ? account : item) ?? null);
    if (account.id === me.id) onSelfChange();
  }
  return <section className="settings-block" aria-labelledby="account-admin-title">
    <div className="settings-row">
      <div>
        <h2 id="account-admin-title">계정 관리</h2>
        <p>임원진만 볼 수 있어요. 회원가입 대신 여기서 부원 계정을 발급하고 역할·비밀번호를 관리해요.</p>
      </div>
      <button className="button small" aria-expanded={creating} onClick={() => setCreating(open => !open)}>{creating ? '발급 닫기' : '계정 발급'}</button>
    </div>
    {creating && <CreateAccount onCreated={account => {
      setAccounts(list => [...(list ?? []), account]); setCreating(false);
      notify(`${account.name}(${account.username}) 계정을 발급했어요. 초기 비밀번호를 본인에게 전달해주세요.`);
    }} />}
    {loadError && <p className="form-error" role="alert">{loadError}</p>}
    {!accounts && !loadError && <p className="note-line">계정 목록을 불러오고 있어요.</p>}
    {accounts && <div className="table-wrap">
      <table className="data-table account-table">
        <thead><tr><th>이름</th><th>아이디</th><th>역할</th><th>상태</th><th><span className="sr-only">관리</span></th></tr></thead>
        <tbody>{accounts.map(account => <Fragment key={account.id}>
          <tr>
            <td>{account.name}{account.id === me.id && <span className="tag mine">나</span>}</td>
            <td>{account.username}</td>
            <td>{ROLE_LABEL[account.role]}</td>
            <td><span className={`tag ${account.isActive ? '' : 'external'}`}>{account.isActive ? '사용 중' : '비활성'}</span></td>
            <td><button className="button small" aria-expanded={editing === account.id} onClick={() => setEditing(editing === account.id ? null : account.id)}>{editing === account.id ? '닫기' : '관리'}</button></td>
          </tr>
          {editing === account.id && <tr className="account-edit-row"><td colSpan={5}>
            <EditAccount account={account} self={account.id === me.id} notify={notify} onSaved={saved} />
          </td></tr>}
        </Fragment>)}</tbody>
      </table>
    </div>}
  </section>;
}

function CreateAccount({ onCreated }: { onCreated: (account: ApiUser) => void }) {
  const { error, pending, submit } = useSubmit(async data => {
    const role = text(data, 'role') === 'officer' ? 'officer' : 'member';
    onCreated(await createAccount({ username: text(data, 'username').trim(), name: text(data, 'name').trim(), password: text(data, 'password'), role }));
  });
  return <form className="account-create" aria-label="계정 발급" onSubmit={submit}>
    <div className="form-grid">
      <Field label="아이디 (영문·숫자·_.- 3~50자)" name="username" autoComplete="off" required pattern={USERNAME_PATTERN} title="영문·숫자·_.- 3~50자" maxLength={50} />
      <Field label="이름" name="name" autoComplete="off" required maxLength={50} />
      <Field label="초기 비밀번호 (8자 이상)" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      <Select label="역할" name="role" items={ROLES} defaultValue="member" />
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary small" type="submit" disabled={pending}>{pending ? '발급 중' : '발급'}</button>
  </form>;
}

function EditAccount({ account, self, notify, onSaved }: { account: ApiUser; self: boolean; notify: Notify; onSaved: (account: ApiUser) => void }) {
  const info = useSubmit(async data => {
    const role: Role = text(data, 'role') === 'officer' ? 'officer' : 'member';
    const changes: Partial<Pick<ApiUser, 'name' | 'role' | 'isActive'>> = {}, name = text(data, 'name').trim();
    if (name !== account.name) changes.name = name;
    // 자기 자신의 역할·활성 여부는 서버가 거절하므로(다른 임원진이 변경) 보내지 않는다.
    if (!self && role !== account.role) changes.role = role;
    if (!self && data.has('active') !== account.isActive) changes.isActive = data.has('active');
    if (!Object.keys(changes).length) { notify('바뀐 내용이 없어요.'); return; }
    onSaved(await updateAccount(account.id, changes)); notify(`${name} 계정 정보를 저장했어요.`);
  });
  const reset = useSubmit(async (data, form) => {
    await resetPassword(account.id, text(data, 'newPassword'));
    form.reset(); notify(`${account.name}님의 비밀번호를 초기화했어요. 새 비밀번호를 본인에게 전달해주세요.`);
  });
  return <div className="account-edit">
    <form aria-label={`${account.name} 계정 정보 변경`} onSubmit={info.submit}>
      <div className="form-grid">
        <Field label="이름" name="name" defaultValue={account.name} required maxLength={50} />
        <Select label="역할" name="role" items={ROLES} defaultValue={account.role} disabled={self} />
      </div>
      <label className="account-active"><input type="checkbox" name="active" defaultChecked={account.isActive} disabled={self} />로그인 허용 (끄면 이 계정으로 로그인할 수 없어요)</label>
      {self && <p className="note-line">자기 자신의 역할 변경·비활성화는 다른 임원진이 해야 해요.</p>}
      {info.error && <p className="form-error" role="alert">{info.error}</p>}
      <button className="button small" type="submit" disabled={info.pending}>{info.pending ? '저장 중' : '정보 저장'}</button>
    </form>
    {!self && <form aria-label={`${account.name} 비밀번호 초기화`} onSubmit={reset.submit}>
      <Field label="새 비밀번호 (8자 이상)" name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      {reset.error && <p className="form-error" role="alert">{reset.error}</p>}
      <button className="button small danger" type="submit" disabled={reset.pending}>{reset.pending ? '초기화 중' : '비밀번호 초기화'}</button>
    </form>}
  </div>;
}
