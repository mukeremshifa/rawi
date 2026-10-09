import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import type { PoolClient } from '@neondatabase/serverless';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getPlatformProxy } from 'wrangler';
import { socketDb, transaction } from '../src/server/db/client';
import * as s from '../src/server/db/schema';
import { bootstrap, createCourse } from '../src/server/services/workspace';
import { createMaterial, publishVersion, readBlocks } from '../src/server/services/materials';
import { runCourseJobs } from '../src/server/services/outline/jobs';
import type { Citation } from '../src/shared/contracts/document';
import { spansText } from '../src/shared/domain/document-text';
import { importBank, createSet, setQuestions } from '../src/server/services/learning';
import { createExam } from '../src/server/services/exams';
import { createSession } from '../src/server/services/tutoring';
import { propose } from '../src/server/services/planning';
import { notifications, markReminder } from '../src/server/services/support';
import { initiate, finalize } from '../src/server/services/uploads';
import { advance } from '../src/server/services/conversion';
import type { BackendBindings } from '../src/server/config';
import { createCourseInput } from '../src/shared/contracts/workspace';
import { questionInput, validResponse, type LearningAttempt, type VersionedQuestion } from '../src/shared/contracts/learning';
import { createMaterialInput } from '../src/shared/contracts/materials';
import { attemptTotals, toQuestionAttempt } from '../src/shared/domain/marking';
import { availabilityInput, assessmentInput, sessionInput, checkInInput, zonedParts } from '../src/shared/contracts/planner';
import { examFields } from '../src/shared/contracts/exams';
import { buildRun } from '../src/shared/domain/exam';
import { addDays, weekStart } from '../src/shared/domain/planner';
import type { PlannedSession, WrittenGrading } from '../src/shared/domain/types';
import { dataset, stableId, fixtureCourses, fixtureTopics, fixtureMaterials, fixtureQuestions, answer } from './fixtures/account';

const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const email = option('--email')?.trim().toLowerCase(), target = option('--target');
if (args.length !== 2 || (!!email === !!target) || target && !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(target)) throw new Error('Pass exactly --email EXISTING_EMAIL or --target EXISTING_DEVELOPMENT_WORKSPACE_ID.');
const config = parseEnv(readFileSync('.dev.vars', 'utf8'));
if (!config.DATABASE_URL || config.R2_ENVIRONMENT !== 'development') throw new Error('The designated .dev.vars development backend is required.');
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== config.DATABASE_URL) throw new Error('The shell database differs from the designated development backend.');
const connection = socketDb(config.DATABASE_URL), db = connection.db;
let proxy: Awaited<ReturnType<typeof getPlatformProxy<BackendBindings>>> | undefined;
let lock: PoolClient | undefined;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const conflicts = new Set<string>();
try {
  const matches = email
    ? await db.select({ id: s.user.id, email: s.user.email }).from(s.user).where(sql`lower(${s.user.email})=${email}`)
    : await db.select({ id: s.user.id, email: s.user.email }).from(s.workspaces).innerJoin(s.user, eq(s.user.id,s.workspaces.ownerUserId)).where(eq(s.workspaces.id,target!));
  if (matches.length !== 1) throw new Error('The target must resolve to exactly one existing account. The owner must sign in once if it does not exist.');
  const owner = matches[0]!;
  const { workspace, preferences } = await bootstrap(db, owner.id);
  const wid = workspace.id, id = (key: string) => stableId(wid,key);
  lock = await db.$client.connect();
  const locked = await lock.query('select pg_try_advisory_lock(hashtext($1)) locked',[`${dataset}:${wid}`]);
  if (!locked.rows[0].locked) throw new Error('A seed for this workspace is already running.');
  const timezone = preferences.timezone || 'Asia/Dubai';
  await db.insert(s.developmentSeeds).values({workspaceId:wid,version:dataset,anchorDate:zonedParts(new Date(),timezone).date,timezone}).onConflictDoNothing();
  const [seed] = await db.select().from(s.developmentSeeds).where(and(eq(s.developmentSeeds.workspaceId,wid),eq(s.developmentSeeds.version,dataset)));
  const date = (offset: number) => addDays(seed!.anchorDate,offset);
  // Convert a local wall clock to an instant, including daylight-saving offsets.
  const instant = (offset: number, minutes=600) => {
    const wall = Date.parse(`${date(offset)}T00:00:00Z`) + minutes*60000;
    let utc = wall;
    for(let i=0;i<3;i++){const p=zonedParts(new Date(utc),seed!.timezone);utc+=wall-(Date.parse(`${p.date}T00:00:00Z`)+p.minutes*60000);}
    return new Date(utc);
  };
  const tables: Record<string, typeof s.courses | typeof s.materials | typeof s.learningRuns | typeof s.learningAttempts | typeof s.learningSets | typeof s.tutorSessions | typeof s.examConfigs | typeof s.uploads | typeof s.planProposals | typeof s.plannedSessions | typeof s.assessments | typeof s.checkIns> = {courses:s.courses,materials:s.materials,learning_runs:s.learningRuns,learning_attempts:s.learningAttempts,learning_sets:s.learningSets,tutor_sessions:s.tutorSessions,exam_configs:s.examConfigs,uploads:s.uploads,plan_proposals:s.planProposals,planned_sessions:s.plannedSessions,assessments:s.assessments,check_ins:s.checkIns};
  async function current(kind: string, entityId: string) {
    const table=tables[kind]; if(!table) return null;
    const rows=await db.select().from(table).where(and(eq(table.workspaceId,wid),eq(table.id,entityId)));
    return rows[0] ?? null;
  }
  async function step<T>(key: string, kind: string, entityId: string, run:()=>Promise<T>):Promise<T> {
    const scope=and(eq(s.developmentSeedRecords.workspaceId,wid),eq(s.developmentSeedRecords.version,dataset),eq(s.developmentSeedRecords.key,key));
    const [prior]=await db.select().from(s.developmentSeedRecords).where(scope);
    const compact=(result: unknown) => kind==='learning_attempts'||kind==='exam_configs'?{id:entityId}:kind==='question_versions'?{ids:(result as {questions:VersionedQuestion[]}).questions.map(q=>q.id)}:result;
    if(prior){
      if(prior.baseline && digest(await current(kind,prior.entityId))!==prior.baseline) conflicts.add(key);
      let result=prior.result;
      if(kind==='learning_attempts') result=(await db.select({snapshot:s.learningAttempts.snapshot}).from(s.learningAttempts).where(and(eq(s.learningAttempts.workspaceId,wid),eq(s.learningAttempts.id,entityId))))[0]?.snapshot;
      if(kind==='exam_configs') result=await current(kind,entityId);
      if(kind==='question_versions'){
        const ids=(prior.result as {ids?:string[];questions?:VersionedQuestion[]}).ids??(prior.result as {questions:VersionedQuestion[]}).questions.map(q=>q.id);
        const rows=await db.select({content:s.questionVersions.content}).from(s.questionVersions).where(and(eq(s.questionVersions.workspaceId,wid),inArray(s.questionVersions.id,ids)));
        result={questions:ids.map(id=>rows.find(r=>r.content.id===id)!.content)};
      }
      if(!result)throw new Error(`Seed record is missing: ${key}.`);
      const packed=compact(result);if(digest(packed)!==digest(prior.result))await db.update(s.developmentSeedRecords).set({result:packed}).where(scope);
      return result as T;
    }
    const result=await run();
    const storedId=kind==='uploads'?(result as {id:string}).id:entityId;
    await db.insert(s.developmentSeedRecords).values({workspaceId:wid,version:dataset,key,entityType:kind,entityId:storedId,baseline:tables[kind]?digest(await current(kind,storedId)):'',result:compact(result)});
    return result;
  }
  // V1 records are retained. V2 is a distinctly named current-schema study lab,
  // never another replay of the legacy import envelope.
  const legacy=await db.select({id:s.workspaceImports.id}).from(s.workspaceImports).where(and(eq(s.workspaceImports.workspaceId,wid),sql`${s.workspaceImports.original}->>'seedProvenance'='rawi-fictional-v1'`));
  for(const c of fixtureCourses){
    // These sample outlines were built by hand, so they arrive as the student's own topics.
    const topics=fixtureTopics.filter(t=>t.courseId===c.id).map(({courseId:_c,...t})=>({...t,id:id(`topic:${t.id}`),module:t.module??'',workspaceId:wid,courseId:id(c.id),origin:'student' as const}));
    await step(`course:${c.id}`,'courses',id(c.id),async()=>{
      await createCourse(db,wid,createCourseInput.parse({id:id(c.id),name:`Sample lab: ${c.name}`,description:`Fictional sample course. ${c.description}`}));
      if(topics.length) await db.insert(s.topics).values(topics).onConflictDoNothing();
      if(c.archived) await db.update(s.courses).set({archived:true}).where(and(eq(s.courses.workspaceId,wid),eq(s.courses.id,id(c.id)),eq(s.courses.revision,1)));
      return {id:id(c.id)};
    });
  }
  // Sections resolve to the blocks of their published version: the section heading and everything up to the next top-level heading.
  const sources = new Map<string,Citation>();
  for(const m of fixtureMaterials){
    const result=await step(`material:${m.id}`,'materials',id(m.id),async()=>{
      const text=m.sections.map(p=>`# ${p.heading}\n\n${p.text}`).join('\n\n');
      const material=await createMaterial(db,wid,id(m.courseId),createMaterialInput.parse({id:id(m.id),title:`Sample: ${m.title}`,kind:'reading',attribution:`Fictional sample material. ${m.attribution??''}`,text,format:'md'}),1048576);
      const versionId=material.currentVersionId!;
      const {blocks}=await readBlocks(db,wid,material.id,versionId,{cursor:-1,limit:10000});
      const tops=blocks.filter(b=>b.type==='heading'&&b.content.level===1);
      const refs=m.sections.map((p,i)=>{
        const heading=tops.find(b=>b.type==='heading'&&spansText(b.content.spans)===p.heading)??tops[i];
        if(!heading)throw new Error(`Seed section heading is missing: ${p.id}.`);
        const start=blocks.indexOf(heading),end=blocks.findIndex((b,j)=>j>start&&b.type==='heading'&&b.content.level===1);
        return {oldId:p.id,materialId:material.id,versionId,blockIds:blocks.slice(start,end<0?undefined:end).slice(0,200).map(b=>b.id)};
      });
      // The authored sections name their topics, so they are linked as the student would link them.
      const links=m.sections.flatMap((p,i)=>p.topicIds.map(t=>({workspaceId:wid,courseId:id(m.courseId),materialId:material.id,versionId,topicId:id(`topic:${t}`),headingBlockId:refs[i]!.blockIds[0]!,headingText:p.heading,origin:'student' as const})));
      if(links.length) await db.insert(s.sectionLinks).values(links).onConflictDoNothing();
      return {id:material.id,refs};
    });
    for(const {oldId,...r} of result.refs) sources.set(`${m.id}:${oldId}`,r);
  }
  const bank: VersionedQuestion[]=[];
  for(const c of fixtureCourses.slice(0,2)){
    const inputs=fixtureQuestions.filter(q=>q.courseId===c.id).map(q=>{
      const {id:_id,courseId:_c,source,provenance:_p,...fields}=q;
      const exact=source?sources.get(`${source.materialId}:${source.sectionId}`):undefined;
      const rubric=fields.rubric?.map(r=>({...r,keywords:r.keywords??[]}));
      const total=rubric?.reduce((n,r)=>n+r.marks,0);
      return questionInput.parse({...fields,topicId:id(`topic:${q.topicId}`),...(rubric?{rubric,marks:total}:{}),source:exact});
    });
    for(let offset=0;offset<inputs.length;offset+=50){const key=`bank:${c.id}:${offset}`;const saved=await step(key,'question_versions',id(key),()=>importBank(db,wid,id(c.id),{operationId:id(key),questions:inputs.slice(offset,offset+50)}));bank.push(...saved.questions);}
  }
  const sets: {id:string;courseId:string;name:string}[]=[];
  for(const c of fixtureCourses.slice(0,2)){
    const pool=bank.filter(q=>q.courseId===id(c.id));
    for(const kind of ['mixed','focused','cards'] as const){
      const chosen=kind==='mixed'?['multiple-choice','multiple-select','matching','ordering','fill-blank','written-recall','source-analysis','essay','flashcard'].flatMap(f=>pool.find(q=>q.format===f)??[]):kind==='cards'?pool.filter(q=>q.format==='flashcard').slice(0,4):pool.filter(q=>q.topicId===pool[0]!.topicId&&q.format!=='flashcard').slice(0,6);
      const key=`set:${c.id}:${kind}`;
      const set=await step(key,'learning_sets',id(key),()=>createSet(db,wid,id(c.id),{id:id(key),name:`Sample ${kind}: ${c.name}`,questionIds:chosen.map(q=>q.id),feedback:kind==='focused'?'end':'immediate',hintsAllowed:true}));sets.push(set);
    }
  }
  await step('availability','planner_state',wid,async()=>{
    const [existing]=await db.select().from(s.plannerState).where(eq(s.plannerState.workspaceId,wid));
    if(existing) return {preserved:true};
    const availability=availabilityInput.parse({windows:[0,1,2,3,4,5,6].map(day=>({id:id(`window:${day}`),day,startMinutes:1080,endMinutes:1200})),exceptions:[{id:id('exception'),date:date(3),windows:[{startMinutes:1140,endMinutes:1200}],note:'Sample: shorter study window after a personal commitment.'}],sessionMinutes:30});
    await db.insert(s.plannerState).values({workspaceId:wid,availability}).onConflictDoNothing();return {preserved:false};
  });
  for(const [i,c] of fixtureCourses.slice(0,2).entries()) await step(`assessment:${c.id}`,'assessments',id(`assessment:${c.id}`),async()=>{
    const content={...assessmentInput.parse({title:`Sample ${i?'statistics quiz':'history comparison paper'}`,type:i?'quiz':'essay',date:date(i?5:12),time:'10:00',durationMinutes:45,topicIds:fixtureTopics.filter(t=>t.courseId===c.id).map(t=>id(`topic:${t.id}`)),notes:'Fictional assessment for planning practice.'}),id:id(`assessment:${c.id}`),courseId:id(c.id),createdAt:instant(-35).toISOString()};
    await db.insert(s.assessments).values({id:content.id,workspaceId:wid,courseId:content.courseId,date:content.date,content}).onConflictDoNothing();return content;
  });
  await step('availability-defaults','planner_state',wid,()=>transaction(db,async tx=>{
    const [existing]=await tx.select().from(s.plannerState).where(eq(s.plannerState.workspaceId,wid)).for('update');
    if(!existing || existing.revision!==1 || existing.availability.windows.length || existing.availability.exceptions.length) return {preserved:true};
    const availability=availabilityInput.parse({windows:[0,1,2,3,4,5,6].map(day=>({id:id(`window:${day}`),day,startMinutes:1080,endMinutes:1200})),exceptions:[{id:id('exception'),date:date(3),windows:[{startMinutes:1140,endMinutes:1200}],note:'Sample: shorter study window after a personal commitment.'}],sessionMinutes:30});
    await tx.update(s.plannerState).set({availability,revision:2}).where(eq(s.plannerState.workspaceId,wid));return {preserved:false};
  }));
  const [availabilityRow]=await db.select().from(s.plannerState).where(eq(s.plannerState.workspaceId,wid));
  const examRows: (typeof s.examConfigs.$inferSelect)[]=[];
  for(const c of fixtureCourses.slice(0,2)) for(const timing of ['overall','per-section','untimed'] as const){
    const key=`exam:${c.id}:${timing}`;
    const config=examFields.parse({name:`Sample ${timing} rehearsal: ${c.name}`,assessmentIds:[id(`assessment:${c.id}`)],sections:[{id:id(`${key}:section1`),title:'Recall and evidence',instructions:'Answer all questions. Check the evidence before deciding.',formats:['multiple-choice','multiple-select','fill-blank'],topicIds:[],count:3,minutes:15},{id:id(`${key}:section2`),title:'Apply and explain',instructions:'Explain your reasoning and distinguish evidence from interpretation.',formats:['ordering','written-recall'],topicIds:[],count:2,minutes:20}],timing,totalMinutes:35,extraTimePercent:0,book:timing==='untimed'?'open':'closed',allowedMaterialIds:timing==='untimed'?[id(fixtureMaterials.find(m=>m.courseId===c.id)!.id)]:[],navigation:timing==='per-section'?'sequential':'free',flaggingEnabled:true,lockSectionsOnFinish:timing==='per-section'});
    examRows.push(await step(key,'exam_configs',id(key),()=>createExam(db,wid,id(c.id),{operationId:id(`create:${key}`),id:id(key),config})));
  }
  const existingSessions=await db.select({content:s.plannedSessions.content}).from(s.plannedSessions).where(eq(s.plannedSessions.workspaceId,wid));
  const planned: PlannedSession[]=[];
  for(let offset=-3;offset<14;offset++){
    const c=fixtureCourses[Math.abs(offset)%2]!, activity=(['read','practice','exam','tutor'] as const)[Math.abs(offset)%4]!;
    const on=date(offset), day=new Date(`${on}T12:00:00Z`).getUTCDay();
    const exception=availabilityRow!.availability.exceptions.find(e=>e.date===on);
    const windows=exception?.windows ?? availabilityRow!.availability.windows.filter(w=>w.day===day);
    const key=`planned:${offset}`;
    const saved=existingSessions.find(s=>s.content.id===id(key));
    let start=saved?.content.startMinutes;
    for(const w of windows) for(let candidate=w.startMinutes;start===undefined&&candidate+30<=w.endMinutes;candidate+=15){
      if(!existingSessions.some(s=>s.content.date===on&&s.content.status!=='skipped'&&candidate<s.content.startMinutes+s.content.durationMinutes&&candidate+30>s.content.startMinutes)) start=candidate;
    }
    if(start===undefined) continue;
    const fields=sessionInput.parse({courseId:id(c.id),date:on,startMinutes:start,durationMinutes:30,title:`Sample: ${activity} ${c.name}`,activity,topicIds:[id(`topic:${fixtureTopics.find(t=>t.courseId===c.id)!.id}`)],assessmentId:id(`assessment:${c.id}`),status:offset===-2?'skipped':'planned',locked:true});
    const content:PlannedSession={...fields,id:id(key),createdAt:instant(-4).toISOString(),link:activity==='read'?{kind:'material',materialId:id(fixtureMaterials.find(m=>m.courseId===c.id)!.id)}:activity==='practice'?{kind:'practice-set',setId:id(`set:${c.id}:mixed`)}:activity==='exam'?{kind:'exam-config',configId:id(`exam:${c.id}:overall`)}:{kind:'tutor',topicId:fields.topicIds[0]!}};
    planned.push(await step(key,'planned_sessions',id(key),async()=>{await db.insert(s.plannedSessions).values({id:content.id,workspaceId:wid,courseId:content.courseId,date:on,content}).onConflictDoNothing();return content;}));
  }
  async function history(key:string,setId:string,offset:number,variant:number,examConfig?:typeof s.examConfigs.$inferSelect,finish:'manual'|'expired'='manual') {
    return step(key,'learning_attempts',id(`attempt:${key}`),()=>transaction(db,async tx=>{
      const [saved]=await tx.select().from(s.learningAttempts).where(and(eq(s.learningAttempts.workspaceId,wid),eq(s.learningAttempts.id,id(`attempt:${key}`))));if(saved)return saved.snapshot;
      const [set]=await tx.select().from(s.learningSets).where(and(eq(s.learningSets.workspaceId,wid),eq(s.learningSets.id,setId)));
      if(!set)throw new Error('Seed set is missing.');
      let items=await setQuestions(tx,wid,setId), actualSet=setId;
      const startedAt=instant(offset,600), completedAt=instant(offset,finish==='expired'&&examConfig?600+examConfig.config.totalMinutes:630);
      let exam: LearningAttempt['exam']=null;
      if(examConfig){
        const initial=buildRun(examConfig.config,bank.filter(q=>q.courseId===set.courseId),{},startedAt.getTime());if(!initial)throw new Error('Seed exam is not startable.');
        const {answers:_answers,...runtime}=initial;exam={...runtime,id:id(key),activatedSectionIds:runtime.configSnapshot.sections.map(s=>s.id),materialVersions:[]};
        actualSet=id(`paper:${key}`);
        await tx.insert(s.learningSets).values({id:actualSet,workspaceId:wid,courseId:set.courseId,name:examConfig.config.name,fingerprint:dataset,purpose:'exam',feedback:'end',hintsAllowed:false});
        const selected=Object.values(initial.sectionQuestions).flat();
        items=selected.map((qid,position)=>({id:id(`${key}:item:${position}`),question:bank.find(q=>q.id===qid)!}));
        await tx.insert(s.setItems).values(items.map((item,position)=>({id:item.id,workspaceId:wid,courseId:set.courseId,setId:actualSet,questionId:item.question.id,position})));
      }
      const runId=id(key), plannedLink=key.startsWith('linked-history:')?planned.find(p=>p.date===date(offset)&&p.courseId===set.courseId&&p.activity==='practice'):undefined;
      const flashcardReview=items.every(i=>i.question.format==='flashcard')?{itemIds:items.map(i=>i.id),firstRatings:Object.fromEntries(items.map(i=>[i.question.id,{kind:'self-rating' as const,rating:'hard' as const}]))}:null;
      await tx.insert(s.learningRuns).values({id:runId,workspaceId:wid,courseId:set.courseId,setId:actualSet,title:key.startsWith('corrected-expiry:')?`Sample corrected expiry: ${examConfig!.config.name}`:examConfig?.config.name??set.name,startedAt,exam,plannedSessionId:plannedLink?.id,sampleDataset:dataset,flashcardReview});
      const questions=items.map((item,i)=>{const response=answer(item.question,(variant+i)%4);if(!validResponse(item.question,response))throw new Error('Invalid fixture answer.');const hinted=!exam&&i===0&&variant===1;return {item,response,hinted,question:item.question,result:toQuestionAttempt(item.question,response,hinted)};});
      await tx.insert(s.runAnswers).values(questions.map(q=>({workspaceId:wid,courseId:set.courseId,runId,setId:actualSet,itemId:q.item.id,response:q.response,hinted:q.hinted,revealed:q.question.format==='flashcard',checked:q.question.format==='flashcard'})));
      const snapshot:LearningAttempt={id:id(`attempt:${key}`),runId,courseId:set.courseId,title:key.startsWith('corrected-expiry:')?`Sample corrected expiry: ${examConfig!.config.name}`:examConfig?.config.name??set.name,sampleDataset:dataset,startedAt:startedAt.toISOString(),completedAt:completedAt.toISOString(),markingVersion:'objective-v1',questions:questions.map(({question,result})=>({question,result})),...attemptTotals(questions.map(q=>q.result)),flashcardReview,exam,...(exam?{finish}:{}),plannedSessionId:plannedLink?.id};
      await tx.insert(s.learningAttempts).values({id:snapshot.id,workspaceId:wid,courseId:set.courseId,runId,setId:actualSet,snapshot,createdAt:completedAt});
      await tx.update(s.learningRuns).set({state:'submitted',completedAt,revision:2}).where(eq(s.learningRuns.id,runId));
      if(plannedLink)await tx.update(s.plannedSessions).set({content:{...plannedLink,status:'completed',completedBy:snapshot.id,completedAt:snapshot.completedAt},revision:2}).where(eq(s.plannedSessions.id,plannedLink.id));
      return snapshot;
    }));
  }
  const histories:LearningAttempt[]=[];
  for(const c of fixtureCourses.slice(0,2)){
    for(const [i,offset] of [-35,-28,-21,-14,-7,-4,-3,-2,-1].entries())histories.push(await history(`history:${c.id}:${i}`,id(`set:${c.id}:${i===4?'cards':'mixed'}`),offset,i%3));
    for(const finish of ['manual','expired'] as const)histories.push(await history(`history:exam:${c.id}:${finish}`,id(`set:${c.id}:focused`),finish==='manual'?-6:-5,1,examRows.find(e=>e.courseId===id(c.id)&&e.config.timing==='overall'),finish));
    const early=histories.find(a=>a.courseId===id(c.id)&&a.finish==='expired'&&a.exam?.deadlineAt&&a.completedAt<a.exam.deadlineAt);
    if(early) await history(`corrected-expiry:${c.id}`,id(`set:${c.id}:focused`),-5,1,examRows.find(e=>e.courseId===id(c.id)&&e.config.timing==='overall'),'expired');
    const key=`resume:${c.id}`;
    await step(key,'learning_runs',id(key),()=>transaction(db,async tx=>{
      const setId=id(`set:${c.id}:mixed`),items=await setQuestions(tx,wid,setId);
      const [existing]=await tx.select().from(s.learningRuns).where(eq(s.learningRuns.id,id(key)));if(existing)return {id:existing.id};
      await tx.insert(s.learningRuns).values({id:id(key),workspaceId:wid,courseId:id(c.id),setId,title:`Sample: continue ${c.name}`,sampleDataset:dataset,position:2,startedAt:instant(-1)});
      await tx.insert(s.runAnswers).values(items.slice(0,2).map((item,i)=>({workspaceId:wid,courseId:id(c.id),setId,runId:id(key),itemId:item.id,response:answer(item.question,i)})));
      return {id:id(key)};
    }));
  }
  const linkedPlan=planned.find(p=>p.date===date(-1)&&p.activity==='practice');
  if(linkedPlan) await history(`linked-history:${linkedPlan.id}`,id(`set:${fixtureCourses.find(c=>id(c.id)===linkedPlan.courseId)!.id}:mixed`),-1,0);
  await step('archived-checklist','materials',id('archived-checklist'),async()=>{
    const c=fixtureCourses[0]!;const saved=await createMaterial(db,wid,id(c.id),{id:id('archived-checklist'),title:'Sample: archived reading checklist',kind:'reading',attribution:'Superseded sample checklist.',format:'md',text:'# Earlier checklist\n\nIdentify the main claim and one supporting detail. A later version adds a limitation and a comparison.'},1048576);
    await db.update(s.materials).set({archived:true}).where(and(eq(s.materials.workspaceId,wid),eq(s.materials.id,saved.id),eq(s.materials.revision,1)));return {id:saved.id};
  });
  const reviewed=histories.find(a=>a.questions.some(q=>q.question.format==='essay'&&q.result.response.kind==='text'))!;
  const written=reviewed.questions.find(q=>q.question.format==='essay'&&q.result.response.kind==='text')!;
  for(const revision of [1,2]) await step(`feedback:${revision}`,'feedback_revisions',id(`feedback:${revision}`),async()=>{
    const grading:WrittenGrading={method:'sample',status:'graded',gradedAt:instant(-1,600+revision).toISOString(),summary:revision===1?'Sample review: the response identifies a claim but needs a specific comparison and a clearer causal explanation.':'Sample second review of the unchanged response: partial credit recognises the stated limitation. A supported comparison is still needed.',points:written.question.rubric!.map((r,i)=>({rubricId:r.id,max:r.marks,awarded:Math.max(0,r.marks-(i===0?3-revision:1)),feedback:i===0?'The claim is identifiable. Link it explicitly to the evidence.':'Use a precise source detail and state why the alternative is weaker.'}))};
    await db.insert(s.feedbackRevisions).values({id:id(`feedback:${revision}`),workspaceId:wid,courseId:reviewed.courseId,attemptId:reviewed.id,questionId:written.question.id,revision,grading,sampleDataset:dataset}).onConflictDoNothing();return {attemptId:reviewed.id,questionId:written.question.id,revision};
  });
  await step('remediation','learning_sets',id('remediation'),()=>createSet(db,wid,reviewed.courseId,{id:id('remediation'),name:'Sample remediation: compare the evidence',questionIds:reviewed.questions.filter(q=>q.result.outcome!=='correct').map(q=>q.question.id),remediatesAttemptId:reviewed.id,feedback:'immediate',hintsAllowed:true}));
  const focus=written.question.source??Array.from(sources.values())[0]!;
  for(const [i,kind] of ['completed','open','archived','interrupted','answer-review'].entries()){
    const key=`tutor:${kind}`;
    await step(key,'tutor_sessions',id(key),async()=>{
      await createSession(db,wid,reviewed.courseId,{id:id(key),title:`Sample: ${kind==='answer-review'?'discuss a saved answer':kind+' source discussion'}`,topicId:written.question.topicId,source:focus,...(kind==='answer-review'?{review:{attemptId:reviewed.id,questionId:written.question.id}}:{})});
      await transaction(db,async tx=>{
        const [current]=await tx.select().from(s.tutorSessions).where(eq(s.tutorSessions.id,id(key))).for('update');
        if(current!.sampleDataset || current!.revision>1){if(current!.revision>1)conflicts.add(key);return;}
        const texts=[['student','How can I distinguish the main claim from the evidence?'],['tutor',`Start with the claim that explains the change. Then identify the observation offered in support. The source distinguishes an economic incentive from the conditions that made it possible. [[1]]`],['student','So a change in conditions does not prove it was the only cause. I should compare another explanation.'],['tutor',`Yes. Name the alternative, identify the evidence both accounts can explain, then explain where their predictions differ. A source can support an interpretation without eliminating all alternatives. [[1]]`],['student','My next answer will state the claim, cite one detail and acknowledge a limitation.'],['tutor',kind==='interrupted'?'A useful way to test that comparison is to look at the timing of the evidence. The first point to examine is':'That gives you a useful structure. Practise without notes next, then revisit the exact passage to check whether your explanation uses the evidence accurately.']];
        await tx.insert(s.tutorMessages).values(texts.map(([role,text],ordinal)=>({id:id(`${key}:${ordinal}`),workspaceId:wid,courseId:reviewed.courseId,sessionId:id(key),ordinal,role:role as 'student'|'tutor',text:text!,state:kind==='interrupted'&&ordinal===5?'interrupted' as const:'complete' as const,operationId:id(`${key}:operation:${ordinal}`),createdAt:instant(-8+i,600+ordinal*3),provenance:{sampleDataset:dataset,imported:false,stage:ordinal<2?'understand' as const:'reason' as const,grounding:'materials' as const,citations:role==='tutor'?[focus]:[]}}))).onConflictDoNothing();
        await tx.update(s.tutorSessions).set({sampleDataset:dataset,stage:'reason',archived:kind==='archived',createdAt:instant(-8+i),updatedAt:instant(-8+i,620),endedAt:['completed','archived'].includes(kind)?instant(-8+i,620):null,completedLearning:['completed','archived'].includes(kind)}).where(eq(s.tutorSessions.id,id(key)));
      });return {id:id(key)};
    });
  }
  for(const [i,offset] of [-14,-7,-2,0].entries()) await step(`check-in:${offset}`,'check_ins',id(`check-in:${offset}`),async()=>{
    const c=fixtureCourses[i%2]!;const content={...checkInInput.parse({courseId:id(c.id),topicId:id(`topic:${fixtureTopics.find(t=>t.courseId===c.id)!.id}`),mood:(['struggling','on-track','less-time','confident'] as const)[i],minutesToday:i===2?20:60,note:['Sample: comparison questions still need work.','Sample: the causal chain is becoming clearer.','Sample: a shorter reading session fits today.','Sample: ready to practise without notes.'][i]}),id:id(`check-in:${offset}`),at:instant(offset,Math.min(600,zonedParts(new Date(),seed!.timezone).minutes)).toISOString()};
    await db.insert(s.checkIns).values({id:content.id,workspaceId:wid,content}).onConflictDoNothing();return content;
  });
  // The real binding and upload services reserve, verify, promote and settle bytes.
  const fileRows=[];
  for(const type of ['md','pdf','docx','pptx'] as const){
    const key=`original:${type}`;
    const result=await step(key,'uploads',id(key),async()=>{
      proxy ??= await getPlatformProxy<BackendBindings>({remoteBindings:true,persist:false});
      const env={...proxy.env,...config} as BackendBindings;
      const bytes=new Uint8Array(readFileSync(`dev/fixtures/originals/source-guide.${type}`));
      const checksum=createHash('sha256').update(bytes).digest('hex');
      for(let retry=0;retry<10;retry++){
      const requestId=id(retry?`${key}:retry:${retry}`:key);
      const [previous]=await db.select().from(s.uploads).where(and(eq(s.uploads.workspaceId,wid),eq(s.uploads.id,requestId)));
      if(previous?.state==='failed') continue;
      if(previous?.state==='pending'&&previous.expiresAt<=new Date()){await finalize(db,env,wid,requestId);continue;}
      const prepared=await initiate(db,env,wid,id(fixtureCourses[0]!.id),{requestId,fileName:`sample-source-guide.${type}`,type,size:bytes.length,checksum,title:`Sample original: source guide (${type.toUpperCase()})`,kind:type==='pptx'?'slides':'reading',attribution:'Authored development fixture.'});
      if(prepared.url){const response=await fetch(prepared.url,{method:'PUT',headers:prepared.headers,body:bytes});if(!response.ok)throw new Error(`Original upload failed with HTTP ${response.status}.`);}
      const saved=await finalize(db,env,wid,requestId);if(saved.state!=='ready')throw new Error(`Original did not finalize: ${saved.state}.`);return saved;
      }
      throw new Error('Repeated upload expiry. Resolve storage availability before retrying.');
    });fileRows.push(result);
  }
  // Uploaded originals convert like any upload. Without DATALAB_API_KEY they record a clear failure.
  for(const row of fileRows){
    if(!row.resultVersionId)continue;
    for(let i=0;i<60;i++){
      const [version]=await db.select({status:s.materialVersions.status,nextPollAt:s.materialVersions.nextPollAt}).from(s.materialVersions).where(eq(s.materialVersions.id,row.resultVersionId));
      if(!version||!['pending','processing'].includes(version.status))break;
      if(!version.nextPollAt||version.nextPollAt<=new Date()){proxy??=await getPlatformProxy<BackendBindings>({remoteBindings:true,persist:false});await advance({...proxy.env,...config} as BackendBindings,row.resultVersionId);}
      else await new Promise(resolve=>setTimeout(resolve,2000));
    }
  }
  await step('read-sample-reminder','reminder_states',id('read-sample-reminder'),async()=>{
    const rows=await notifications(db,wid);const reminder=rows.reminders.find(r=>r.title.startsWith('Sample'));if(!reminder)return {skipped:true};
    await markReminder(db,wid,id('read-sample-reminder'),reminder.key,'read');return {key:reminder.key};
  });
  // A course outlined from its syllabus. The syllabus is a real material, so the seed exercises the read job.
  await step('course:minds','courses',id('minds'),async()=>{
    await createCourse(db,wid,createCourseInput.parse({id:id('minds'),name:'Sample lab: Minds, machines and meaning',description:'Fictional sample course, outlined from its syllabus.'}));
    await transaction(db,async tx=>{
      const [material]=await tx.insert(s.materials).values({id:id('minds-syllabus'),workspaceId:wid,courseId:id('minds'),title:'Sample: PHIL 214 syllabus',kind:'syllabus',attribution:'Fictional sample syllabus.',createFingerprint:dataset}).returning();
      await tx.update(s.courses).set({syllabusMaterialId:material!.id}).where(and(eq(s.courses.workspaceId,wid),eq(s.courses.id,id('minds'))));
      await publishVersion(tx,material!,{requestId:id('minds-syllabus:v1'),fingerprint:dataset,origin:'paste',sourceObjectId:null,format:'md',conversion:{adapter:'markdown',text:readFileSync('dev/fixtures/syllabus.md','utf8'),format:'md'}});
    });
    return {id:id('minds')};
  });
  // Outline jobs run here as they would after an upload: read the syllabus, then map materials to topics.
  for(const courseId of [...fixtureCourses.map(c=>id(c.id)),id('minds')]) await runCourseJobs(config as unknown as BackendBindings,{workspaceId:wid,courseId});
  const proposal=await step('complete-proposal','plan_proposals',id('complete-proposal'),()=>propose(db,wid,{operationId:id('complete-proposal'),weekStart:weekStart(seed!.anchorDate)}));
  const records=await db.select({kind:s.developmentSeedRecords.entityType}).from(s.developmentSeedRecords).where(and(eq(s.developmentSeedRecords.workspaceId,wid),eq(s.developmentSeedRecords.version,dataset)));
  console.log(JSON.stringify({version:dataset,userId:owner.id,workspaceId:wid,email:owner.email,anchor:seed!.anchorDate,timezone:seed!.timezone,legacyImportsPreserved:legacy.length,records:records.reduce<Record<string,number>>((n,r)=>({...n,[r.kind]:(n[r.kind]??0)+1}),{}),conflicts:[...conflicts],courses:fixtureCourses.map(c=>id(c.id)),resume:id(`resume:${fixtureCourses[0]!.id}`),result:reviewed.id,tutor:id('tutor:answer-review'),proposal:proposal.id,originals:await Promise.all(fileRows.map(async r=>({materialId:r.materialId,versionId:r.resultVersionId,status:r.resultVersionId?(await db.select({status:s.materialVersions.status}).from(s.materialVersions).where(eq(s.materialVersions.id,r.resultVersionId)))[0]?.status:null})))}));
} catch(error) {
  // Never print driver query parameters or signed storage URLs.
  console.error(error instanceof Error && !('query' in error) ? error.message : 'Seed failed. Inspect the scoped seed manifest before retrying.');
  process.exitCode=1;
} finally {
  if(lock){await lock.query('select pg_advisory_unlock_all()');lock.release();}
  await proxy?.dispose();await connection.close();
}
