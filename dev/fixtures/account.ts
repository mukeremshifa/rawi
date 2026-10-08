import { createHash } from 'node:crypto';
import type { AnswerValue, Question, StudyCourse, StudyTopic, StudyMaterial } from '../../src/shared/domain/types';
import { SEED_COURSE, SEED_TOPICS } from './topics';
import { STATS_COURSE, STATS_TOPICS, STATS_MATERIALS, STATS_QUESTIONS } from './stats';
import { SEED_MATERIALS } from './materials';
import { SEED_QUESTIONS } from './questions';
export const dataset = 'rawi-account-v2';
export function stableId(workspace: string, key: string) {
  const hex = createHash('sha256').update(`${dataset}:${workspace}:${key}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
const arabic: StudyCourse = { id: 'arabic', name: 'القراءة النقدية', description: 'دورة نموذجية مؤرشفة تربط الفكرة الرئيسة بالدليل وحدود الاستنتاج في نصوص قصيرة.', goal: 'تمييز الادعاء عن الدليل وكتابة تفسير واضح تدعمه قراءة دقيقة.', accent: 'teal', createdAt: '2026-10-07T08:00:00.000Z', archived: true };
const arabicTopics: StudyTopic[] = ['الادعاء والدليل', 'السياق وحدود الاستنتاج', 'المقارنة بين تفسيرين'].map((title,i)=>({id:`arabic-${i}`,courseId:'arabic',title,summary:['تحديد ما يقوله الكاتب وما يقدمه لدعم قوله.', 'ربط معنى الفقرة بظروفها وتحديد ما لا يمكن استنتاجه.', 'مقارنة تفسيرين باستخدام دليل مشترك مع بيان الاختلاف.'][i]!,module:i<2?'الوحدة الأولى: قراءة دقيقة':'الوحدة الثانية: كتابة تفسير',order:i,priority:i===0?'high':'normal',relatedTopicIds:[`arabic-${(i+1)%3}`]}));
export const fixtureCourses = [SEED_COURSE, {...STATS_COURSE,name:'Statistics | الإحصاء التطبيقي',description:`${STATS_COURSE.description} أمثلة تطبيقية تربط العينات بالتقدير وعدم اليقين.`},arabic];
export const fixtureTopics = [...SEED_TOPICS,...STATS_TOPICS,...arabicTopics];
export const fixtureMaterials: StudyMaterial[] = [...SEED_MATERIALS.filter(m=>m.passages.length),...STATS_MATERIALS.filter(m=>m.passages.length),{id:'arabic-reading',courseId:'arabic',title:'نص نموذجي: قراءة نتائج استطلاع',kind:'reading',origin:'authored',attribution:'مادة نموذجية خيالية للتدريب.',topicIds:['arabic-0','arabic-1'],addedAt:arabic.createdAt,passages:[{id:'arabic-passage',heading:'الدليل وحدوده',topicIds:['arabic-0','arabic-1'],text:'في استطلاع خيالي شارك ثلاثون طالبا من ناد للقراءة. قال عشرون منهم إنهم يفضلون القراءة مساء. تدعم النتيجة وصف هذه المجموعة، لكنها لا تكفي لتعميم الحكم على جميع الطلاب. اختيار المشاركين يؤثر في معنى النتيجة، كما أن التفضيل المعلن لا يثبت عدد ساعات القراءة الفعلية.'}]}];
export const fixtureQuestions = [...SEED_QUESTIONS,...STATS_QUESTIONS];
export function answer(q: Question, variant: number): AnswerValue {
  if (variant === 3) return {kind:'none'};
  switch(q.format) {
    case 'flashcard': return {kind:'self-rating',rating:variant===0?'good':variant===1?'hard':'again'};
    case 'multiple-choice': return {kind:'choice',indices:variant===0?[q.correctIndices![0]!]:[(q.correctIndices![0]!+1)%q.options!.length]};
    case 'multiple-select': return {kind:'choice',indices:variant===0?q.correctIndices!:variant===1?q.correctIndices!.slice(0,1):q.options!.map((_,i)=>i).filter(i=>!q.correctIndices!.includes(i))};
    case 'matching': return {kind:'matching',assignments:Object.fromEntries(q.pairs!.map((p,i)=>[p.left,variant===0||i===0?p.right:q.pairs![(i+1)%q.pairs!.length]!.right]))};
    case 'ordering': return {kind:'ordering',sequence:variant===0?q.sequence!:[...q.sequence!].reverse()};
    case 'fill-blank': return {kind:'blanks',values:q.blanks!.map((b,i)=>variant===0||i===0?b[0]!:'uncertain')};
    default: return {kind:'text',text:q.courseId==='arabic'?'تصف النتيجة المجموعة المشاركة ولا تثبت أنها تمثل جميع الطلاب.':variant===0?`The evidence supports a qualified conclusion. ${q.explanation.slice(0,450)}`:'I can identify the main claim, but I need to explain the causal link and compare it with an alternative using a specific detail from the source.'};
  }
}
