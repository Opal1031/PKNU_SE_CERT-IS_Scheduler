import { useEffect, useState } from 'react';
import type { Room } from './model';
import { getDraft, iso, saveDocument, setDraft, stamp, name, writable } from './model';
import { Empty, IconButton, Markdown } from './ui';
import type { ViewProps } from './ui';

export default function DocumentPage({ model: m, session: s, prefs: p, setPrefs, notify, open, selected: r, quoteSignal }: ViewProps & { selected: Room; quoteSignal: number }) {
  const [draft, updateDraft] = useState(() => getDraft(s.userId, r.id));
  const [dialog, setDialog] = useState<'compare' | 'discard' | null>(null);
  const meta = m.documentMeta[r.id], saved = m.documents[r.id], body = draft?.body ?? saved;
  const edit = writable(m.workspaces.find(w => w.id === r.workspaceId), s), dirty = body !== saved;
  const conflict = !!draft && draft.baseVersion !== meta.version;
  useEffect(() => { if (quoteSignal) updateDraft(getDraft(s.userId, r.id)); }, [quoteSignal, r.id, s.userId]);
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setDialog(null); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, []);
  function change(value: string) {
    const next = value === saved ? undefined : { body: value, baseVersion: draft?.baseVersion ?? meta.version, at: iso() };
    updateDraft(next); try { setDraft(s.userId, r.id, next); } catch (error) { notify(`${(error as Error).message} · 초안 내용을 복사해 보관해야 함`); }
  }
  function clear() { setDraft(s.userId, r.id); updateDraft(undefined); setDialog(null); }
  function save() {
    try { saveDocument(r.id, body, draft?.baseVersion ?? meta.version, s); clear(); notify('회의록 저장됨'); }
    catch (error) { notify((error as Error).message); if (draft) setDialog('compare'); }
  }
  function exportFile() {
    const link = document.createElement('a'), blob = URL.createObjectURL(new Blob([edit ? body : saved], { type: 'text/markdown;charset=utf-8' }));
    link.href = blob; link.download = `${r.name}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(blob), 1000);
  }
  return <>
    <div className="document-top"><div><h2>{r.name}</h2><p className="note-line">v{meta.version} · {name(meta.updatedBy)} · {stamp(meta.updatedAt)}{!edit && ' · 읽기 전용'}</p></div><div className="button-row"><IconButton title="회의록 선택" icon="document" onClick={() => open({ kind: 'document-pick', workspaceId: r.workspaceId })} /><IconButton title="변경 이력" icon="history" onClick={() => open({ kind: 'document-history', id: r.id })} /><IconButton title="Markdown 내보내기" icon="download" onClick={exportFile} />{edit && <button className="button primary small" disabled={!dirty} onClick={save}>저장</button>}</div></div>
    {edit && <div className="toolbar"><div className="pill-tabs">{[['split', '나란히'], ['edit', '편집'], ['preview', '미리보기']].map(([value, label]) => <button key={value} className={p.docMode === value ? 'active' : ''} onClick={() => setPrefs({ docMode: value })}>{label}</button>)}</div><div className="button-row"><button className="button quiet small" onClick={() => change(`${body}\n\n## 회의 정보\n- 일시: ${new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })}\n- 참석자: \n\n## 논의\n\n## 결정\n\n## 실행 항목\n- [ ] 담당자: / 업무: / 마감: \n`)}>양식 추가</button>{dirty && <button className="button quiet small" onClick={() => setDialog('discard')}>초안 폐기</button>}</div></div>}
    <div className={`document-layout ${!edit || p.docMode === 'preview' ? 'preview-only' : p.docMode === 'edit' ? 'edit-only' : ''}`}>
      {edit && p.docMode !== 'preview' && <div className="editor-pane"><div className="pane-label">Markdown · 초안은 별도로 복원됨</div><textarea className="markdown-input" aria-label="회의록 편집" value={body} onChange={e => change(e.target.value)} /></div>}
      {(!edit || p.docMode !== 'edit') && <div className="preview-pane"><div className="pane-label">미리보기</div><Markdown body={edit ? body : saved} /></div>}
    </div>
    <p className="save-state" role="status">{!edit ? '조회 전용 문서임' : conflict ? <>저장본이 변경됨. <button className="button small" onClick={() => setDialog('compare')}>최신본과 비교</button></> : dirty ? '저장되지 않은 초안 있음 · 보기 전환과 채팅 전송은 문서를 저장하지 않음' : '저장본과 동일함'}</p>
    {dialog && <dialog open className="main-dialog" aria-labelledby="doc-modal-title"><header className="modal-heading"><h2 id="doc-modal-title">{dialog === 'compare' ? '최신 저장본과 초안 비교' : '초안 폐기'}</h2><IconButton title="닫기" icon="close" onClick={() => setDialog(null)} /></header><div className="modal-body">{dialog === 'compare' ? <><p className="note-line">내용 확인 후 최신본 사용 또는 초안 유지 선택하면 됨. 자동 덮어쓰기하지 않음</p><div className="compare-grid"><div><h3>최신 저장본 · v{meta.version}</h3><pre>{saved}</pre></div><div><h3>내 초안</h3><pre>{body}</pre></div></div></> : <p>저장본을 다시 표시하며 이 초안은 삭제됨</p>}</div><footer className="modal-footer"><button className="button" onClick={() => { try { clear(); } catch (error) { notify((error as Error).message); } }}>{dialog === 'compare' ? '최신본 사용' : '폐기'}</button>{dialog === 'compare' && <button className="button primary" onClick={() => { try { const next = { body, baseVersion: meta.version, at: iso() }; setDraft(s.userId, r.id, next); updateDraft(next); setDialog(null); } catch (error) { notify((error as Error).message); } }}>초안 유지 · 최신 버전 기준</button>}<button className="button" onClick={() => setDialog(null)}>닫기</button></footer></dialog>}
  </>;
}
export function DocumentMissing({ workspaceId, open }: { workspaceId: Room['workspaceId']; open: ViewProps['open'] }) { return <Empty>해당 회의록을 찾을 수 없음. <button className="button small" onClick={() => open({ kind: 'document-pick', workspaceId })}>다른 문서 선택</button></Empty>; }

