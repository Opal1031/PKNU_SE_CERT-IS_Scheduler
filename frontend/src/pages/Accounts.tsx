// 설정 화면의 계정 영역. 내 비밀번호 변경(MyAccount)과 임원진 전용 계정 관리(AccountAdmin)를 맡는다.
// 계정 관리: 가입 승인, 계정 발급, 아이디·이름·역할·로그인 허용 변경, 비밀번호 초기화.
import { Fragment, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { changePassword, createAccount, listAccounts, resetPassword, updateAccount, USERNAME_PATTERN } from '../api';
import type { ApiUser, Role } from '../api';
import { Field, Select } from '../ui';

// 역할 표시 이름과 역할 선택 상자 항목
const ROLE_LABEL: Record<Role, string> = { officer: '임원진', member: '일반 부원' };
const ROLES: [Role, string][] = [
  ['member', ROLE_LABEL.member],
  ['officer', ROLE_LABEL.officer]
];

// 처리 결과 문구를 사용자에게 알리는 콜백
type Notify = (message: string) => void;

// 제출 중 표시와 오류 문구를 폼마다 같은 방식으로 다룬다. 실패하면 비밀번호 입력은 비운다.
function useSubmit(action: (data: FormData, form: HTMLFormElement) => Promise<void>) {
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError('');
    setPending(true);
    try {
      await action(new FormData(form), form);
    } catch (failure) {
      setError((failure as Error).message);
      form.querySelectorAll<HTMLInputElement>('input[type=password]').forEach(input => {
        input.value = '';
      });
    } finally {
      setPending(false);
    }
  }
  return { error, pending, submit };
}

// 폼 값을 문자열로 꺼낸다(없으면 빈 문자열).
const text = (data: FormData, key: string) => String(data.get(key) ?? '');

/** 설정 화면의 '내 계정' 영역. 이름·아이디·역할을 보여 주고 비밀번호를 바꾼다. */
export function MyAccount({ account, notify }: { account: ApiUser; notify: Notify }) {
  // 새 비밀번호 확인이 맞고 현재 비밀번호와 다를 때만 서버에 변경을 요청한다.
  const { error, pending, submit } = useSubmit(async (data, form) => {
    const current = text(data, 'currentPassword'),
      next = text(data, 'newPassword');
    if (next !== text(data, 'confirmPassword')) throw new Error('새 비밀번호와 확인 값이 달라요.');
    if (next === current) throw new Error('현재 비밀번호와 다른 비밀번호를 입력해주세요.');
    await changePassword(current, next);
    form.reset();
    notify('비밀번호를 변경했어요.');
  });
  return (
    <section className="settings-block" aria-labelledby="my-account-title">
      <h2 id="my-account-title">내 계정</h2>
      <p className="note-line">
        {account.name} · {account.username} · {ROLE_LABEL[account.role]}
      </p>
      <form className="account-form" aria-label="비밀번호 변경" onSubmit={submit}>
        {/* 비밀번호 관리자가 어느 계정의 비밀번호인지 알 수 있게 아이디를 함께 둔다. */}
        <input type="text" name="username" autoComplete="username" value={account.username} readOnly hidden />
        <Field
          label="현재 비밀번호"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
        <Field
          label="새 비밀번호 (8자 이상)"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
        />
        <Field
          label="새 비밀번호 확인"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary small" type="submit" disabled={pending}>
          {pending ? '변경 중' : '비밀번호 변경'}
        </button>
      </form>
    </section>
  );
}

/** 임원진 전용 계정 관리. 전체 계정 목록에서 가입 승인, 계정 발급, 계정별 정보 수정을 한다. */
export function AccountAdmin({ me, notify, onSelfChange }: { me: ApiUser; notify: Notify; onSelfChange: () => void }) {
  // 계정 목록(불러오기 전에는 null)과 불러오기 오류
  const [accounts, setAccounts] = useState<ApiUser[] | null>(null),
    [loadError, setLoadError] = useState('');
  // 발급 폼 열림 여부, 관리 패널을 연 계정, 승인 요청 중인 계정
  const [creating, setCreating] = useState(false),
    [editing, setEditing] = useState<number | null>(null),
    [approving, setApproving] = useState<number | null>(null);
  // 화면을 열 때 서버에서 계정 목록을 한 번 불러온다.
  useEffect(() => {
    listAccounts()
      .then(setAccounts)
      .catch((error: Error) => setLoadError(error.message));
  }, []);
  // 서버가 돌려준 계정으로 목록을 갱신하고, 내 계정이 바뀌었으면 onSelfChange로 알린다.
  function saved(account: ApiUser) {
    setAccounts(list => list?.map(item => (item.id === account.id ? account : item)) ?? null);
    if (account.id === me.id) onSelfChange();
  }
  // 가입 승인: 대기 계정의 로그인을 허용한다.
  async function approve(account: ApiUser) {
    setApproving(account.id);
    try {
      saved(await updateAccount(account.id, { isActive: true }));
      notify(`${account.name}(${account.username}) 계정의 로그인을 허용했어요.`);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setApproving(null);
    }
  }
  // 회원가입 신청(로그인 대기) 계정을 먼저 보여 준다. 탈퇴·정지로 막은 계정도 같은 상태라 함께 표시된다.
  const ordered = accounts && [...accounts].sort((a, b) => Number(a.isActive) - Number(b.isActive) || a.id - b.id);
  const waiting = accounts?.filter(account => !account.isActive).length ?? 0;
  return (
    <section className="settings-block" aria-labelledby="account-admin-title">
      {/* 제목과 계정 발급 폼 열기/닫기 */}
      <div className="settings-row">
        <div>
          <h2 id="account-admin-title">계정 관리</h2>
          <p>
            임원진만 볼 수 있어요. 회원가입 신청을 승인하고, 계정을 직접 발급하거나 아이디·역할·비밀번호를 관리해요.
          </p>
        </div>
        <button className="button small" aria-expanded={creating} onClick={() => setCreating(open => !open)}>
          {creating ? '발급 닫기' : '계정 발급'}
        </button>
      </div>
      {creating && (
        <CreateAccount
          onCreated={account => {
            setAccounts(list => [...(list ?? []), account]);
            setCreating(false);
            notify(`${account.name}(${account.username}) 계정을 발급했어요. 초기 비밀번호를 본인에게 전달해주세요.`);
          }}
        />
      )}
      {/* 불러오기 오류, 로그인 대기 계정 수, 불러오는 중 안내 */}
      {loadError && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}
      {waiting > 0 && (
        <p className="note-line" role="status">
          로그인 대기 계정이 {waiting}개 있어요. 회원가입 신청이면 확인 후 승인해주세요.
        </p>
      )}
      {!accounts && !loadError && <p className="note-line">계정 목록을 불러오고 있어요.</p>}
      {/* 계정 표: 행마다 승인·관리 버튼, 관리를 누르면 바로 아래 행에 수정 폼이 열린다. */}
      {ordered && (
        <div className="table-wrap">
          <table className="data-table account-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>아이디</th>
                <th>역할</th>
                <th>상태</th>
                <th>
                  <span className="sr-only">관리</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ordered.map(account => (
                <Fragment key={account.id}>
                  <tr>
                    <td>
                      {account.name}
                      {account.id === me.id && <span className="tag mine">나</span>}
                    </td>
                    <td>{account.username}</td>
                    <td>{ROLE_LABEL[account.role]}</td>
                    <td>
                      <span className={`tag ${account.isActive ? '' : 'external'}`}>
                        {account.isActive ? '사용 중' : '승인 대기·비활성'}
                      </span>
                    </td>
                    <td>
                      <div className="button-row">
                        {!account.isActive && (
                          <button
                            className="button small primary"
                            disabled={approving === account.id}
                            onClick={() => approve(account)}
                          >
                            {approving === account.id ? '승인 중' : '승인'}
                          </button>
                        )}
                        <button
                          className="button small"
                          aria-expanded={editing === account.id}
                          onClick={() => setEditing(editing === account.id ? null : account.id)}
                        >
                          {editing === account.id ? '닫기' : '관리'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editing === account.id && (
                    <tr className="account-edit-row">
                      <td colSpan={5}>
                        <EditAccount account={account} self={account.id === me.id} notify={notify} onSaved={saved} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// 계정 발급 폼. 임원진이 만든 계정은 가입 승인 없이 바로 로그인할 수 있다.
function CreateAccount({ onCreated }: { onCreated: (account: ApiUser) => void }) {
  const { error, pending, submit } = useSubmit(async data => {
    const role = text(data, 'role') === 'officer' ? 'officer' : 'member';
    onCreated(
      await createAccount({
        username: text(data, 'username').trim(),
        name: text(data, 'name').trim(),
        password: text(data, 'password'),
        role
      })
    );
  });
  return (
    <form className="account-create" aria-label="계정 발급" onSubmit={submit}>
      <div className="form-grid">
        <Field
          label="아이디 (영문·숫자·_.- 3~50자)"
          name="username"
          autoComplete="off"
          required
          pattern={USERNAME_PATTERN}
          title="영문·숫자·_.- 3~50자"
          maxLength={50}
        />
        <Field label="이름" name="name" autoComplete="off" required maxLength={50} />
        <Field
          label="초기 비밀번호 (8자 이상)"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
        />
        <Select label="역할" name="role" items={ROLES} defaultValue="member" />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary small" type="submit" disabled={pending}>
        {pending ? '발급 중' : '발급'}
      </button>
    </form>
  );
}

// 계정 한 개의 관리 패널: 정보(아이디·이름·역할·로그인 허용) 변경과 비밀번호 초기화.
// self는 관리 대상이 로그인한 임원진 자신인지 여부.
function EditAccount({
  account,
  self,
  notify,
  onSaved
}: {
  account: ApiUser;
  self: boolean;
  notify: Notify;
  onSaved: (account: ApiUser) => void;
}) {
  // 정보 저장: 기존 값과 달라진 항목만 모아 서버에 보낸다.
  const info = useSubmit(async data => {
    const role: Role = text(data, 'role') === 'officer' ? 'officer' : 'member';
    const changes: Partial<Pick<ApiUser, 'username' | 'name' | 'role' | 'isActive'>> = {};
    const username = text(data, 'username').trim(),
      name = text(data, 'name').trim();
    // 로그인 상태는 계정 번호로 유지되므로 아이디를 바꿔도 이미 로그인한 사용자는 로그아웃되지 않는다.
    if (username !== account.username) changes.username = username;
    if (name !== account.name) changes.name = name;
    // 자기 자신의 역할·활성 여부는 서버가 거절하므로(다른 임원진이 변경) 보내지 않는다.
    if (!self && role !== account.role) changes.role = role;
    if (!self && data.has('active') !== account.isActive) changes.isActive = data.has('active');
    if (!Object.keys(changes).length) {
      notify('바뀐 내용이 없어요.');
      return;
    }
    onSaved(await updateAccount(account.id, changes));
    notify(`${name} 계정 정보를 저장했어요.`);
  });
  // 비밀번호 초기화: 임원진이 정한 새 비밀번호로 바꾼다.
  const reset = useSubmit(async (data, form) => {
    await resetPassword(account.id, text(data, 'newPassword'));
    form.reset();
    notify(`${account.name}님의 비밀번호를 초기화했어요. 새 비밀번호를 본인에게 전달해주세요.`);
  });
  return (
    <div className="account-edit">
      {/* 정보 변경 폼. 자기 계정이면 역할·로그인 허용은 잠근다. */}
      <form aria-label={`${account.name} 계정 정보 변경`} onSubmit={info.submit}>
        <div className="form-grid">
          <Field
            label="아이디 (로그인할 때 사용)"
            name="username"
            defaultValue={account.username}
            autoComplete="off"
            required
            pattern={USERNAME_PATTERN}
            title="영문·숫자·_.- 3~50자"
            maxLength={50}
          />
          <Field label="이름" name="name" defaultValue={account.name} required maxLength={50} />
          <Select label="역할" name="role" items={ROLES} defaultValue={account.role} disabled={self} />
        </div>
        <label className="account-active">
          <input type="checkbox" name="active" defaultChecked={account.isActive} disabled={self} />
          로그인 허용 (끄면 이 계정으로 로그인할 수 없어요)
        </label>
        {self && <p className="note-line">자기 자신의 역할 변경·비활성화는 다른 임원진이 해야 해요.</p>}
        {info.error && (
          <p className="form-error" role="alert">
            {info.error}
          </p>
        )}
        <button className="button small" type="submit" disabled={info.pending}>
          {info.pending ? '저장 중' : '정보 저장'}
        </button>
      </form>
      {/* 비밀번호 초기화 폼(다른 사람 계정에만 표시) */}
      {!self && (
        <form aria-label={`${account.name} 비밀번호 초기화`} onSubmit={reset.submit}>
          <Field
            label="새 비밀번호 (8자 이상)"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
          />
          {reset.error && (
            <p className="form-error" role="alert">
              {reset.error}
            </p>
          )}
          <button className="button small danger" type="submit" disabled={reset.pending}>
            {reset.pending ? '초기화 중' : '비밀번호 초기화'}
          </button>
        </form>
      )}
    </div>
  );
}
