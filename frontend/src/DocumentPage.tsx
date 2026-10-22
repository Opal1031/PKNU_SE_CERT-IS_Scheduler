// 회의록 문서 화면. 방마다 있는 Markdown 회의록을 편집·미리보기·저장하고,
// 초안은 저장본과 따로 브라우저에 보관해 버전이 어긋나면 비교 후 고르게 한다.
import { useEffect, useState } from 'react';
import type { Room } from './model';
import { getDraft, iso, saveDocument, setDraft, stamp, name, workspace, writable } from './model';
import { Empty, IconButton, Markdown } from './ui';
import type { ViewProps } from './ui';

/** 회의록 편집 페이지. 선택한 방의 회의록을 초안 단위로 편집하고 저장·내보내기한다. */
export default function DocumentPage({
  model: m,
  session: s,
  prefs: p,
  setPrefs,
  notify,
  open,
  selected: r,
  quoteSignal
}: ViewProps & { selected: Room; quoteSignal: number }) {
  // 사용자·방별 초안과 열려 있는 확인 창(비교/폐기)
  const [draft, updateDraft] = useState(() => getDraft(s.userId, r.id));
  const [dialog, setDialog] = useState<'compare' | 'discard' | null>(null);

  // 저장본·버전 정보와 화면에 보일 본문(초안이 있으면 초안 내용)
  const meta = m.documentMeta[r.id],
    saved = m.documents[r.id],
    body = draft?.body ?? saved;
  // 이전 자료의 숫자 ID와 URL·양식의 문자열 ID를 공통 조회 규칙으로 비교한다.
  const edit = writable(workspace(m, r.workspaceId), s),
    dirty = body !== saved;
  // 초안을 시작한 버전과 현재 저장본 버전이 다르면 충돌로 본다.
  const conflict = !!draft && draft.baseVersion !== meta.version;

  // 채팅 인용 등으로 초안이 바뀌었다는 신호를 받으면 저장된 초안을 다시 읽는다.
  useEffect(() => {
    if (quoteSignal) updateDraft(getDraft(s.userId, r.id));
  }, [quoteSignal, r.id, s.userId]);
  // Esc 키로 확인 창 닫기
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDialog(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  // 편집 내용을 초안으로 반영. 저장본과 같아지면 초안을 지운다.
  function change(value: string) {
    // 초안은 저장본과 별도로 보관하고 편집을 시작한 버전을 유지한다.
    const next =
      value === saved ? undefined : { body: value, baseVersion: draft?.baseVersion ?? meta.version, at: iso() };
    updateDraft(next);
    try {
      setDraft(s.userId, r.id, next);
    } catch (error) {
      notify(`${(error as Error).message} · 초안 내용을 복사해 보관해야 함`);
    }
  }
  // 초안을 지우고 확인 창 닫기
  function clear() {
    setDraft(s.userId, r.id);
    updateDraft(undefined);
    setDialog(null);
  }
  // 초안을 시작한 버전 기준으로 저장. 실패하면 알리고, 초안이 있으면 비교 창을 연다.
  function save() {
    try {
      saveDocument(r.id, body, draft?.baseVersion ?? meta.version, s);
      clear();
      notify('회의록 저장됨');
    } catch (error) {
      notify((error as Error).message);
      if (draft) setDialog('compare');
    }
  }
  // 현재 본문(읽기 전용이면 저장본)을 .md 파일로 내려받기
  function exportFile() {
    const link = document.createElement('a'),
      blob = URL.createObjectURL(new Blob([edit ? body : saved], { type: 'text/markdown;charset=utf-8' }));
    link.href = blob;
    link.download = `${r.name}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(blob), 1000);
  }
  return (
    <>
      {/* 상단: 제목·버전 정보와 회의록 선택·변경 이력·내보내기·저장 버튼 */}
      <div className="document-top">
        <div>
          <h2>{r.name}</h2>
          <p className="note-line">
            v{meta.version} · {name(meta.updatedBy)} · {stamp(meta.updatedAt)}
            {!edit && ' · 읽기 전용'}
          </p>
        </div>
        <div className="button-row">
          <IconButton
            title="회의록 선택"
            icon="document"
            onClick={() => open({ kind: 'document-pick', workspaceId: r.workspaceId })}
          />
          <IconButton title="변경 이력" icon="history" onClick={() => open({ kind: 'document-history', id: r.id })} />
          <IconButton title="Markdown 내보내기" icon="download" onClick={exportFile} />
          {edit && (
            <button className="button primary small" disabled={!dirty} onClick={save}>
              저장
            </button>
          )}
        </div>
      </div>
      {/* 편집 도구: 보기 방식 전환, 회의 양식 추가, 초안 폐기 */}
      {edit && (
        <div className="toolbar">
          <div className="pill-tabs">
            {[
              ['split', '나란히'],
              ['edit', '편집'],
              ['preview', '미리보기']
            ].map(([value, label]) => (
              <button
                key={value}
                className={p.docMode === value ? 'active' : ''}
                onClick={() => setPrefs({ docMode: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="button-row">
            <button
              className="button quiet small"
              onClick={() =>
                change(
                  `${body}\n\n## 회의 정보\n- 일시: ${new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })}\n- 참석자: \n\n## 논의\n\n## 결정\n\n## 실행 항목\n- [ ] 담당자: / 업무: / 마감: \n`
                )
              }
            >
              양식 추가
            </button>
            {dirty && (
              <button className="button quiet small" onClick={() => setDialog('discard')}>
                초안 폐기
              </button>
            )}
          </div>
        </div>
      )}
      {/* 편집기와 미리보기. 읽기 전용이면 저장본 미리보기만 표시 */}
      <div
        className={`document-layout ${!edit || p.docMode === 'preview' ? 'preview-only' : p.docMode === 'edit' ? 'edit-only' : ''}`}
      >
        {edit && p.docMode !== 'preview' && (
          <div className="editor-pane">
            <div className="pane-label">Markdown · 초안은 별도로 복원됨</div>
            <textarea
              className="markdown-input"
              aria-label="회의록 편집"
              value={body}
              onChange={e => change(e.target.value)}
            />
          </div>
        )}
        {(!edit || p.docMode !== 'edit') && (
          <div className="preview-pane">
            <div className="pane-label">미리보기</div>
            <Markdown body={edit ? body : saved} />
          </div>
        )}
      </div>
      {/* 저장 상태 안내: 읽기 전용, 저장본 변경(충돌), 미저장 초안, 저장본과 동일 */}
      <p className="save-state" role="status">
        {!edit ? (
          '조회 전용 문서임'
        ) : conflict ? (
          <>
            저장본이 변경됨.{' '}
            <button className="button small" onClick={() => setDialog('compare')}>
              최신본과 비교
            </button>
          </>
        ) : dirty ? (
          '저장되지 않은 초안 있음 · 보기 전환과 채팅 전송은 문서를 저장하지 않음'
        ) : (
          '저장본과 동일함'
        )}
      </p>
      {/* 확인 창: 최신 저장본과 초안 비교, 또는 초안 폐기 */}
      {dialog && (
        <dialog open className="main-dialog" aria-labelledby="doc-modal-title">
          <header className="modal-heading">
            <h2 id="doc-modal-title">{dialog === 'compare' ? '최신 저장본과 초안 비교' : '초안 폐기'}</h2>
            <IconButton title="닫기" icon="close" onClick={() => setDialog(null)} />
          </header>
          <div className="modal-body">
            {dialog === 'compare' ? (
              <>
                <p className="note-line">내용 확인 후 최신본 사용 또는 초안 유지 선택하면 됨. 자동 덮어쓰기하지 않음</p>
                <div className="compare-grid">
                  <div>
                    <h3>최신 저장본 · v{meta.version}</h3>
                    <pre>{saved}</pre>
                  </div>
                  <div>
                    <h3>내 초안</h3>
                    <pre>{body}</pre>
                  </div>
                </div>
              </>
            ) : (
              <p>저장본을 다시 표시하며 이 초안은 삭제됨</p>
            )}
          </div>
          <footer className="modal-footer">
            {/* 초안을 버리고 저장본으로 되돌림 */}
            <button
              className="button"
              onClick={() => {
                try {
                  clear();
                } catch (error) {
                  notify((error as Error).message);
                }
              }}
            >
              {dialog === 'compare' ? '최신본 사용' : '폐기'}
            </button>
            {/* 초안 내용은 그대로 두고 기준 버전만 최신 저장본으로 갱신 */}
            {dialog === 'compare' && (
              <button
                className="button primary"
                onClick={() => {
                  try {
                    const next = { body, baseVersion: meta.version, at: iso() };
                    setDraft(s.userId, r.id, next);
                    updateDraft(next);
                    setDialog(null);
                  } catch (error) {
                    notify((error as Error).message);
                  }
                }}
              >
                초안 유지 · 최신 버전 기준
              </button>
            )}
            <button className="button" onClick={() => setDialog(null)}>
              닫기
            </button>
          </footer>
        </dialog>
      )}
    </>
  );
}

/** 주소의 회의록을 찾지 못했을 때의 안내와 다른 문서 선택 버튼 */
export function DocumentMissing({ workspaceId, open }: { workspaceId: Room['workspaceId']; open: ViewProps['open'] }) {
  return (
    <Empty>
      해당 회의록을 찾을 수 없음.{' '}
      <button className="button small" onClick={() => open({ kind: 'document-pick', workspaceId })}>
        다른 문서 선택
      </button>
    </Empty>
  );
}
