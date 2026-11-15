// Grading port. Returns true/false, or null for essay (manual review).
const norm = (v) => String(v ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

function normList(v) {
  const arr = Array.isArray(v) ? v : [v];
  return arr.map(norm).filter(Boolean).sort().join('|');
}
const TF_TRUE = new Set(['1', 'true', 'yes', 'đúng', 'dung', 't']);
const TF_FALSE = new Set(['0', 'false', 'no', 'sai', 'f']);
function tfAlias(v) {
  const n = norm(v);
  if (TF_TRUE.has(n)) return 'true';
  if (TF_FALSE.has(n)) return 'false';
  return n;
}
function safeNumber(v) {
  const n = norm(v).replace(',', '.');
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/.test(n)) return null;
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}
// Evaluate a bounded arithmetic expression (digits, + - * / ^ ( ) . spaces, %).
function safeEval(v) {
  const n = norm(v).replace(/,/g, '.').replace(/\^/g, '**').replace(/x/g, '*');
  if (!/^[-+*/%().\d\s]+$/.test(n) || n.length > 120 || !/\d/.test(n)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const x = Function(`"use strict";return (${n});`)();
    return typeof x === 'number' && Number.isFinite(x) ? x : null;
  } catch { return null; }
}
function textEquivalent(a, b) {
  if (norm(a) === norm(b)) return true;
  const na = safeNumber(a), nb = safeNumber(b);
  if (na !== null && nb !== null) return Math.abs(na - nb) < 1e-6;
  const ea = safeEval(a), eb = safeEval(b);
  if (ea !== null && eb !== null) return Math.abs(ea - eb) < 1e-6;
  if (ea !== null && nb !== null) return Math.abs(ea - nb) < 1e-6;
  if (na !== null && eb !== null) return Math.abs(na - eb) < 1e-6;
  return false;
}
export function isEmpty(value) {
  if (value == null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}
function matchObject(value, correct) {
  if (typeof value !== 'object' || value == null || typeof correct !== 'object' || correct == null) return false;
  const keys = Object.keys(correct);
  return keys.every((k) => norm(value[k]) === norm(correct[k]));
}
export function gradeValue(type, correct, value) {
  if (type === 'essay') return null;
  if (isEmpty(value)) return false;
  if (correct == null) return false;
  switch (type) {
    case 'multiple':
      return normList(value) === normList(correct) && normList(value) !== '';
    case 'matching':
      return matchObject(value, correct);
    case 'truefalse':
      return tfAlias(value) === tfAlias(correct);
    case 'fill':
    case 'short': {
      const acceptable = Array.isArray(correct) ? correct : [correct];
      return acceptable.some((c) => textEquivalent(value, c));
    }
    default: {
      // single / order / choice: option-id or text equality.
      if (Array.isArray(correct)) return correct.some((c) => norm(value) === norm(c));
      return norm(value) === norm(correct);
    }
  }
}