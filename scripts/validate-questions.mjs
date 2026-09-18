import fs from 'node:fs';
import { URL } from 'node:url';

const path = new URL('../src/data/questions.json', import.meta.url);
const questions = JSON.parse(fs.readFileSync(path, 'utf8'));
const errors = [];
const ids = new Set();
const categories = new Map();

for (const [index, question] of questions.entries()) {
  const label = `question ${index + 1}`;
  if (!question.id || ids.has(question.id)) errors.push(`${label}: duplicate or missing id`);
  ids.add(question.id);
  if (!question.category || !question.prompt || !question.hint || !question.fact) errors.push(`${label}: missing copy`);
  if (!Number.isFinite(question.answerSeconds) || question.answerSeconds <= 0) errors.push(`${label}: answerSeconds must be positive`);
  const min = question.acceptedMinSeconds ?? question.answerSeconds;
  const max = question.acceptedMaxSeconds ?? question.answerSeconds;
  if (min <= 0 || max < min) errors.push(`${label}: invalid accepted range`);
  try { new URL(question.sourceUrl); } catch { errors.push(`${label}: invalid sourceUrl`); }
  categories.set(question.category, (categories.get(question.category) ?? 0) + 1);
}

if (questions.length !== 100) errors.push(`expected exactly 100 questions, found ${questions.length}`);
for (const [category, count] of categories) if (count > 15) errors.push(`${category}: exceeds the 15-question category cap`);
if (categories.size < 10) errors.push(`expected at least 10 categories, found ${categories.size}`);

if (errors.length) {
  console.error(errors.map((error) => `✗ ${error}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${questions.length} questions across ${categories.size} categories`);
