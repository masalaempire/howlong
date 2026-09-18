import fs from 'node:fs';
import { URL } from 'node:url';

const source = JSON.parse(fs.readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8'));
const sql = source.map((question) => {
  const esc = (value) => String(value).replaceAll("'", "''");
  const min = Math.round((question.acceptedMinSeconds ?? question.answerSeconds) * 1000);
  const max = Math.round((question.acceptedMaxSeconds ?? question.answerSeconds) * 1000);
  const answer = Math.round(question.answerSeconds * 1000);
  return `('${esc(question.id)}','${esc(question.category)}','${esc(question.prompt)}','${esc(question.hint)}',${answer},${min},${max},'${esc(question.displayAnswer)}','${esc(question.fact)}','Reference source','${esc(question.sourceUrl)}','2026-09-18',${question.difficulty},'active')`;
}).join(',\n');
const output = `-- Generated from src/data/questions.json. Run npm run generate:seed after content edits.\ninsert into public.questions (id, category, prompt, hint, answer_ms, accepted_min_ms, accepted_max_ms, display_answer, fact, source_label, source_url, source_accessed_at, difficulty, status) values\n${sql}\non conflict (id) do update set category=excluded.category, prompt=excluded.prompt, hint=excluded.hint, answer_ms=excluded.answer_ms, accepted_min_ms=excluded.accepted_min_ms, accepted_max_ms=excluded.accepted_max_ms, display_answer=excluded.display_answer, fact=excluded.fact, source_label=excluded.source_label, source_url=excluded.source_url, source_accessed_at=excluded.source_accessed_at, difficulty=excluded.difficulty, status=excluded.status;\n`;
fs.writeFileSync(new URL('../supabase/seed.sql', import.meta.url), output);
console.log(`Wrote ${source.length} question rows to supabase/seed.sql`);
