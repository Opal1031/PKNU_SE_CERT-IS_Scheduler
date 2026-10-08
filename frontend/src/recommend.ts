export type SurveyAnswer = number | null;
export const answerLabels = ['전혀 그렇지 않다', '별로 그렇지 않다', '보통이다', '대체로 그렇다', '매우 그렇다'];
export const surveyFields = [
  { id: 'W', name: '웹 보안', description: '사이트와 앱에서 이용 과정의 빈틈을 찾는 분야', job: '웹 보안 직무' },
  { id: 'R', name: '리버싱', description: '완성된 프로그램을 살펴 내부 작동 방식을 알아내는 분야', job: '리버싱 직무' },
  { id: 'S', name: '시스템 보안', description: '프로그램의 작은 오류가 어떤 결과를 만드는지 실험하는 분야', job: '포너블 직무' },
  { id: 'F', name: '디지털 포렌식', description: '남아 있는 기록과 흔적으로 지난 일을 재구성하는 분야', job: '디지털 포렌식 직무' },
  { id: 'C', name: '암호학', description: '수학적 규칙으로 정보를 보호하는 방법을 연구하는 분야', job: '암호학 직무' }
] as const;
// docs/recommend/architecture.md의 문항 순서와 W/R/S/F/C 가중치를 유지한다.
export const surveyQuestions = [
  { text: '자주 쓰는 앱이나 사이트에서 평소에 쓰지 않는 메뉴도 눌러보는 편이다.', weights: [2, 1, 0, 0, 0] },
  { text: '물건을 사용할 때, 겉으로 보이는 기능보다 안에서 어떻게 움직이는지가 궁금하다.', weights: [0, 2, 1, 0, 0] },
  { text: '게임이나 퍼즐에서 정석대로 풀기보다 여러 방법을 시도하는 것이 재미있다.', weights: [0, 0, 2, 1, 0] },
  { text: '물건을 잃어버리면 마지막으로 본 시간과 이동 경로를 되짚어 보는 편이다.', weights: [0, 0, 0, 2, 1] },
  { text: '숫자나 기호가 일정한 규칙으로 배열된 문제를 보면 규칙을 찾고 싶다.', weights: [1, 0, 0, 0, 2] },
  { text: '같은 장소라도 이용하는 사람에 따라 들어갈 수 있는 곳과 할 수 있는 일이 달라지는 이유가 궁금하다.', weights: [2, 0, 0, 0, 1] },
  { text: '설명서가 없는 물건도 관찰하면서 사용 방법을 알아내는 과정이 재미있다.', weights: [1, 2, 0, 0, 0] },
  { text: '무언가 제대로 작동하지 않으면 조건을 하나씩 바꿔가며 언제 문제가 생기는지 확인하고 싶다.', weights: [0, 1, 2, 0, 0] },
  { text: '서로 다른 사람의 이야기를 들으면 공통점과 어긋나는 부분을 비교하는 편이다.', weights: [0, 0, 1, 2, 0] },
  { text: '새로운 게임의 규칙을 배우면, 그 규칙에서 항상 성립하는 관계를 찾는 것이 재미있다.', weights: [0, 0, 0, 1, 2] },
  { text: '예약이나 주문을 할 때, 선택하는 순서를 바꾸면 결과도 달라질지 궁금할 때가 있다.', weights: [2, 0, 1, 0, 0] },
  { text: '완성된 장난감이나 작품을 보면 어떤 부품과 순서로 만들었는지 추측해 보고 싶다.', weights: [0, 2, 0, 1, 0] },
  { text: '작은 변화 하나가 예상보다 큰 결과를 만드는 실험에 흥미가 있다.', weights: [0, 0, 2, 0, 1] },
  { text: '사진이나 메모를 모아서 어떤 일이 먼저 일어났는지 정리하는 활동이 재미있다.', weights: [1, 0, 0, 2, 0] },
  { text: '퍼즐의 답을 찾은 뒤에도 왜 다른 답은 불가능한지 설명해 보고 싶다.', weights: [0, 1, 0, 0, 2] }
] as const;
export const isSurveyAnswer = (value: unknown): value is SurveyAnswer => value === null || typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4;

export function rankSurvey(answers: SurveyAnswer[]) {
  if (answers.length > surveyQuestions.length || !Array.from(answers).every(isSurveyAnswer)) throw new Error('설문 응답을 확인해주세요.');
  if (!answers.some(answer => answer !== null)) return [];
  const scores = surveyFields.map((field, i) => ({ ...field, score: answers.reduce<number>((sum, answer, q) => sum + (answer ?? 0) * surveyQuestions[q].weights[i], 0) })).sort((a, b) => b.score - a.score);
  return scores.map(field => ({ ...field, rank: scores.findIndex(other => other.score === field.score) + 1 }));
}
