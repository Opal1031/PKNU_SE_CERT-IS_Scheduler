import { Fragment, useEffect, useRef, useState } from 'react';
import { canView, name, url } from './model';
import { answerLabels, rankSurvey, surveyQuestions } from './recommend';
import type { SurveyAnswer } from './recommend';
import { Heading, Icon } from './ui';
import type { ViewProps } from './ui';

export default function Survey({ model: m, session: s, prefs: p, setPrefs, open }: ViewProps) {
  const answers = p.aiSurveys[s.userId] || [];
  const [step, setStep] = useState(answers.length), [selected, setSelected] = useState<SurveyAnswer | undefined>(undefined);
  const current = useRef<HTMLElement>(null), result = useRef<HTMLElement>(null), messages = useRef<HTMLDivElement>(null);
  const done = step === surveyQuestions.length, choice = selected === undefined ? answers[step] : selected;
  const ranking = done ? rankSurvey(answers) : [], recommended = ranking.filter(field => field.rank === 1 && field.score > 0);
  const activities = m.workspaces.filter(w => !['완료', '보관'].includes(w.status) && ranking.some(field => field.name === w.field && field.score > 0)).sort((a, b) => ranking.find(field => field.name === a.field)!.rank - ranking.find(field => field.name === b.field)!.rank);
  useEffect(() => { (done ? result.current : current.current)?.focus({ preventScroll: true }); if (messages.current) messages.current.scrollTop = messages.current.scrollHeight; }, [step]);
  function move(index: number) { setStep(index); setSelected(undefined); }
  function submit(event: React.FormEvent) {
    event.preventDefault(); if (choice === undefined) return;
    const next = [...answers]; next[step] = choice;
    setPrefs({ aiSurveys: { ...p.aiSurveys, [s.userId]: next } }); move(step + 1);
  }
  function restart() { setPrefs({ aiSurveys: { ...p.aiSurveys, [s.userId]: [] } }); move(0); }
  return <div className="survey-page"><Heading title={done ? 'AI 설문 결과' : 'AI 설문'}>{done ? <><button className="button quiet small" onClick={() => move(surveyQuestions.length - 1)}>답변 수정하기</button><button className="button small" onClick={restart}>다시 시작</button></> : <span className="tag">나의 탐구 스타일 찾기</span>}</Heading>
    {!done && <div className="survey-layout"><section className="survey-chat" aria-label="AI 설문 대화">
      <header className="survey-header"><span className="survey-avatar"><Icon name="ai" /></span><div><strong>CERT-IS 길잡이</strong><small>일상 속 취향으로 찾아보는 공부 방향</small></div><span className="survey-count">{Math.min(step + 1, surveyQuestions.length)} / {surveyQuestions.length}</span></header>
      <progress className="survey-progress" aria-label="설문 진행률" value={done ? surveyQuestions.length : step} max={surveyQuestions.length} />
      <div className="survey-messages" ref={messages} role="region" aria-label="질문 대화 내역" tabIndex={0}>
        <article className="message"><div className="message-name">CERT-IS 길잡이</div><div className="message-text"><strong>나와 맞는 탐구 스타일은?</strong><p>안녕하세요! 평소의 나와 얼마나 비슷한지 골라 주세요. 잘하는지를 평가하는 시험이 아니므로 정답을 찾을 필요는 없어요. 경험이 없다면 해보고 싶은 정도로 답해 주세요.</p><p>15개의 이야기를 나누고, 어울리는 분야와 활동을 함께 찾아볼게요.</p></div></article>
        {surveyQuestions.slice(0, done ? step : step + 1).map((question, i) => <Fragment key={i}>
          <article ref={i === step ? current : undefined} tabIndex={i === step ? -1 : undefined} aria-labelledby={`survey-question-${i}`} className={`message survey-question ${i === step ? 'current' : ''}`}><div className="message-name">CERT-IS 길잡이 <span>질문 {i + 1}</span></div><div className="message-text"><p className="survey-prompt">{['먼저, 이런 모습은 어떤가요?', '이번에는 이 이야기에 답해 주세요.', '평소의 나를 떠올려 볼까요?'][i % 3]}</p><h2 id={`survey-question-${i}`}>{question.text}</h2></div></article>
          {i < step && <article className="message own"><div className="message-name">{name(s.userId)}<button className="button quiet small" aria-label={`${i + 1}번 답변 수정`} onClick={() => move(i)}>수정</button></div><div className="message-text">{answers[i] === null ? '잘 모르겠다' : answerLabels[answers[i]!]}</div></article>}
        </Fragment>)}
      </div>
    </section><form className="survey-composer" aria-label="설문 답변" onSubmit={submit}><fieldset className="survey-scale"><legend>평소의 나와 얼마나 비슷한가요?</legend><div className="survey-circles">{answerLabels.map((label, i) => <label className={`survey-option option-${i}`} key={label} title={label}><input type="radio" name={`answer-${step}`} value={i} aria-label={label} checked={choice === i} onChange={() => setSelected(i)} /><span className="survey-circle" aria-hidden="true">{choice === i && <span>✓</span>}</span><span className="survey-option-label">{label}</span></label>)}</div><div className="survey-scale-ends"><span>전혀 그렇지 않다</span><span>매우 그렇다</span></div><p className="survey-selection" role="status">{choice === undefined ? '가장 가까운 동그라미를 골라 주세요.' : choice === null ? '잘 모르겠다' : answerLabels[choice]}</p><label className="survey-unknown"><input type="radio" name={`answer-${step}`} checked={choice === null} onChange={() => setSelected(null)} />잘 모르겠다</label></fieldset><div className="survey-actions"><button className="button quiet" type="button" disabled={step === 0} onClick={() => move(step - 1)}><Icon name="left" />이전 질문</button><button className="button primary" disabled={choice === undefined}>{step === surveyQuestions.length - 1 ? '추천 결과 보기' : '다음 질문'}<Icon name="right" /></button></div><small className="survey-storage">응답은 이 브라우저에 사용자별로 저장돼요.</small></form></div>}
    {done && <section className="survey-results" ref={result} tabIndex={-1} aria-labelledby="survey-results-title">
      <h2 id="survey-results-title">{recommended.length ? '이런 분야부터 탐구해 볼까요?' : '아직 취향이 뚜렷하지 않아요.'}</h2>
      <p className="note-line">{answers.filter(answer => answer !== null).length}개 응답 반영 · 잘 모르겠다 {answers.filter(answer => answer === null).length}개 제외 · 같은 점수는 공동 순위예요.</p>
      {ranking.length ? <div className="home-dashboard survey-result-layout">
        <section className="home-panel survey-result-card survey-field-panel" aria-labelledby="survey-fields-title"><h3 id="survey-fields-title">추천 분야</h3><ol className="survey-ranking" aria-label="추천 분야 순위" tabIndex={0}>{ranking.map(field => <li key={field.id} className={field.rank === 1 && field.score > 0 ? 'top' : ''}><span className="survey-rank">{ranking.filter(other => other.score === field.score).length > 1 ? '공동 ' : ''}{field.rank}위</span><strong className="survey-field-name">{field.name}</strong><p>{field.description}</p><meter min={0} max={36} value={field.score} aria-label={`${field.name} 응답 점수`} /><strong className="survey-score">{field.score}<small>점</small></strong></li>)}</ol></section>
        <aside className="home-side survey-result-side" aria-label="추천 활동과 직무">
          <section className="home-panel survey-result-card" aria-labelledby="survey-activities-title"><h3 id="survey-activities-title">추천 스터디 / 프로젝트</h3><p className="note-line">등록된 활동을 분야 순위대로 모았어요.</p><div className="survey-activities" role="region" aria-label="추천 활동 목록" tabIndex={0}>{activities.map(w => <div key={w.id}><span className={`workspace-initial ${w.type}`}>{w.initial}</span><div><strong>{w.name}</strong><small>{w.type === 'study' ? '스터디' : '프로젝트'} · {w.field}</small></div>{canView(w, s) ? <a className="button small" href={url(w)} aria-label={`${w.name} 활동 열기`} title="활동 열기"><span className="survey-activity-action">활동 열기</span><Icon name="right" /></a> : <button className="button small" aria-label={`${w.name} 활동 보기`} title="활동 보기" onClick={() => open({ kind: 'workspace-info', workspaceId: w.id })}><span className="survey-activity-action">활동 보기</span><Icon name="right" /></button>}</div>)}{!activities.length && <p className="note-line">현재 응답에 맞는 등록된 활동이 없어요.</p>}</div></section>
          <section className="home-panel survey-result-card" aria-labelledby="survey-jobs-title"><h3 id="survey-jobs-title">추천 직무</h3><p className="note-line">최고 순위 분야에 연결한 직무예요.</p><div className="survey-job-list" role="region" aria-label="추천 직무 목록" tabIndex={0}><div className="button-row">{recommended.map(field => <span key={field.id} className="tag">{field.job}</span>)}</div>{!recommended.length && <p className="note-line">긍정 응답이 없어 특정 직무를 추천하기 어려워요.</p>}</div></section>
        </aside>
      </div> : <p className="home-panel survey-no-results">모든 질문에 ‘잘 모르겠다’로 답해 계산할 응답이 없어요. 관심이 가는 질문부터 답변을 수정해 주세요.</p>}
      <p className="survey-disclaimer">응답 기반 관심 방향이며 실력·적성 판정이 아니에요. 다섯 분야가 보안 분야 전체를 대표하지는 않아요.</p>
    </section>}
  </div>;
}
