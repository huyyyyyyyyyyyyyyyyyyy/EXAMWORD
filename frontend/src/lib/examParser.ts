import type { QuestionOption, QuestionType } from '../types'

export interface ParsedQuestion {
  id: number
  content: string
  type: QuestionType
  options: QuestionOption[]
  points: number
  correctAnswer: string | string[] | null
  explanation: string | null
  partTitle: string
  partInstruction: string
  topic: string
  order: number
}
export interface ParseResult { title: string; questions: ParsedQuestion[]; warnings: string[]; missingAnswers: number }

const CORRECT_MARK = '\u2605'
const OPTION_LABELS = 'ABCDEFGH'
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

const QUESTION_RE = /^\s*(?:(?:Câu|Cau|Question)\s+)?(\d+)\s*[.):]\s*(.*)$/iu
const OPTION_RE = /^\s*(\u2605)?\s*(?:([A-H])\s*[.):]|([a-h])\s*\))\s*(.*)$/i
const QUESTION_TABLE_RE = /^\s*(?:Câu|Cau|Question)\s+(\d+)\t+(.*)$/iu
const INSTRUCTION_RE = /^\s*(?:Mark\s+the\s+letter|Read\s+the\s+following|Choose\s+(?:the|one)|Circle\s+the|Listen\s+(?:to|and)|Task\s+\d+\b|Decide\s+whether|You\s+will\s+(?:hear|listen)|Complete\s+the|Fill\s+in|Đọc\s+đoạn|Khoanh\s+tròn|Chọn\s+(?:đáp\s+án|phương\s+án)|Hãy\s+chọn)/iu
const END_RE = /THE\s+END|^\W*HẾT\W*$|Thí\s+sinh\s+không\s+được/iu
const EXAM_CODE_RE = /Mã\s+đề(?:\s+thi)?\s*[:：]?\s*(\d{2,4})/iu
const ANSWER_RE = /^\s*(?:Đáp\s+án|Dap\s+an|Answer|Ans|ĐA)\s*[:：]\s*(.*)$/iu
const EXPLANATION_RE = /^\s*(?:Giải\s+thích|Giai\s+thich|Explanation|Lời\s+giải|Hướng\s+dẫn\s+giải)\s*[:：]\s*(.*)$/iu
const HEADING_RE = /^\s*(?:(?:PHẦN|PHAN|PART|SECTION)\s+[IVXLC\d]+\b|ĐỀ\s+THI\b|ĐỀ\s+KIỂM\s+TRA\b|ĐỀ\s+SỐ\b)/iu
const ANSWER_SECTION_RE = /^\s*(?:BẢNG\s+)?(?:ĐÁP\s*ÁN|DAP\s*AN|ANSWER\s*KEY|ANSWERS?|HƯỚNG\s+DẪN\s+GIẢI|LỜI\s+GIẢI)[^\n:]{0,40}$/iu

const ANSWER_TOKEN = '(?:[A-Ha-h](?:(?:\\s*[,;/&]\\s*|\\s+)[A-Ha-h](?![A-Za-z0-9]))*|[A-Ha-h]{2,8}|[Tt]|Đúng|Sai|True|False)'
const TOKEN_END = '(?![A-Za-z0-9À-ỹ])'
const PAIR_RE = new RegExp('(?:Câu|Cau|Question|Q)?\\s*(\\d{1,3})\\s*[.):\\-–—=]?\\s*(' + ANSWER_TOKEN + ')' + TOKEN_END, 'giu')
const ENTRY_RE = /^\s*(?:(?:Câu|Cau|Question)\s+)?(\d{1,3})\s*[.):\-–—]\s*(.*)$/iu
const SPACED_ENTRY_RE = /^\s*(\d{1,3})\s+(\S.{0,40})$/
const HEADER_ROW_RE = /^\s*(?:Câu|Cau|STT|Question|No\.?)\s*[\t|]+\s*(\d+(?:\s*[\t|]\s*\d+)*)\s*[\t|]*\s*$/iu
const ANSWER_ROW_RE = /^\s*(?:Đáp\s*án|Dap\s*an|Answer|ĐA)\s*[\t|]+(.+)$/iu
const LEADING_ANSWER_RE = new RegExp('^(' + ANSWER_TOKEN + ')' + TOKEN_END + '\\s*(?:[.):\\-–—]\\s*(.*))?$', 'iu')
const INLINE_OPTION_RE = /(?:(?<=\s)|^)(\u2605?)([A-H])[.)]\s+(?=\S)/g
const BLANK_RE = /\.{3,}|_{3,}|…/
const TRUE_FALSE_WORDS = new Set(['true', 'false', 'đúng', 'sai'])
const TRUE_FALSE_ANSWERS = new Set(['true', 'false', 'đúng', 'sai', 't', 'f'])

const cleanLines = (text: string) => text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

export function parseAnswerKeyFull(text: string): { answers: Map<number, string>; explanations: Map<number, string> } {
  const answers = new Map<number, string>()
  const explanations = new Map<number, string>()
  let current: number | null = null
  let pendingNumbers: number[] = []
  let inExplanation = false
  for (const line of cleanLines(text)) {
    const stripped = line.trim()
    if (!stripped) continue
    const header = HEADER_ROW_RE.exec(line)
    if (header) { pendingNumbers = header[1].split(/[\t|]/).filter(n => /^\d+$/.test(n.trim())).map(n => parseInt(n, 10)); continue }
    const row = ANSWER_ROW_RE.exec(line)
    if (row && pendingNumbers.length) {
      const cells = row[1].split(/[\t|]/).map(c => c.trim()).filter(Boolean)
      pendingNumbers.forEach((num, idx) => { if (cells[idx] !== undefined) answers.set(num, cells[idx]) })
      pendingNumbers = []
      continue
    }
    const pairs = [...stripped.matchAll(PAIR_RE)]
    if (pairs.length) {
      const leftover = stripped.replace(PAIR_RE, ' ')
      if (!leftover.replace(/[\s,;|/\t]+/g, '')) {
        for (const match of pairs) { current = parseInt(match[1], 10); answers.set(current, match[2].trim()) }
        inExplanation = false
        continue
      }
    }
    const entry = ENTRY_RE.exec(line)
    if (entry) {
      current = parseInt(entry[1], 10)
      inExplanation = false
      let rest = entry[2].trim()
      const inline = ANSWER_RE.exec(rest)
      if (inline) rest = inline[1].trim()
      if (rest) {
        const lead = LEADING_ANSWER_RE.exec(rest)
        if (lead) { answers.set(current, lead[1].trim()); if (lead[2]) explanations.set(current, lead[2].trim()) }
        else answers.set(current, rest.replace(/^[:\- ]+/, '').trim())
      }
      continue
    }
    const spaced = SPACED_ENTRY_RE.exec(line)
    if (spaced && !inExplanation) { current = parseInt(spaced[1], 10); answers.set(current, spaced[2].trim()); continue }
    if (current === null) continue
    const answerMatch = ANSWER_RE.exec(line)
    if (answerMatch) { answers.set(current, answerMatch[1].trim()); inExplanation = false; continue }
    const explanationMatch = EXPLANATION_RE.exec(line)
    if (explanationMatch) { explanations.set(current, explanationMatch[1].trim()); inExplanation = true; continue }
    if (inExplanation) explanations.set(current, ((explanations.get(current) || '') + '\n' + stripped).trim())
  }
  return { answers, explanations }
}

function answerValue(raw: string, labels: Set<string>): string | string[] {
  raw = raw.trim().replace(/\.+$/, '').trim()
  const parts = raw.split(/[,;/&]|\s+/).map(part => part.trim()).filter(Boolean)
  if (parts.length > 1 && parts.every(part => labels.has(part.toUpperCase()))) return [...new Set(parts.map(part => part.toUpperCase()))].sort()
  if (labels.has(raw.toUpperCase())) return raw.toUpperCase()
  const compact = raw.toUpperCase().replace(/ /g, '')
  if (compact.length > 1 && labels.size && new Set(compact).size === compact.length && [...compact].every(ch => labels.has(ch))) return [...compact].sort()
  return raw
}

export function splitAnswerSection(text: string): [string, string] {
  const lines = cleanLines(text)
  const firstQuestion = lines.findIndex(line => QUESTION_RE.test(line))
  if (firstQuestion < 0) return [text, '']
  for (let index = firstQuestion + 1; index < lines.length; index += 1) {
    if (ANSWER_SECTION_RE.test(lines[index]) && !QUESTION_RE.test(lines[index])) {
      const tail = lines.slice(index + 1).join('\n')
      if (parseAnswerKeyFull(tail).answers.size) return [lines.slice(0, index).join('\n'), tail]
    }
  }
  return [text, '']
}

export function splitInlineOptions(line: string): string[] {
  const matches = [...line.matchAll(INLINE_OPTION_RE)]
  for (let i = 0; i < matches.length; i += 1) {
    const first = matches[i]
    if (first[2] !== 'A' && line.slice(0, first.index).trim()) continue
    const run = [first]
    for (let j = i + 1; j < matches.length; j += 1) {
      const next = matches[j]
      if (next[2].charCodeAt(0) === run[run.length - 1][2].charCodeAt(0) + 1) run.push(next)
    }
    if (run.length >= 2) {
      const pieces: string[] = []
      const head = line.slice(0, run[0].index).replace(/\s+$/, '')
      if (head) pieces.push(head)
      for (let j = 0; j < run.length; j += 1) {
        const end = j + 1 < run.length ? run[j + 1].index : line.length
        pieces.push(line.slice(run[j].index, end).trim())
      }
      return pieces
    }
  }
  return [line]
}

interface CurrentQuestion {
  content: string[]
  options: QuestionOption[]
  rawAnswer: string
  explanation: string[]
  marked: string[]
  passage: string
  partTitle: string
  partInstruction: string
}

function detectKind(current: CurrentQuestion, correct: string | string[] | null): QuestionType {
  const options = current.options
  if (Array.isArray(correct) && options.length) return 'multiple'
  if (options.length && options.every(item => TRUE_FALSE_WORDS.has(item.text.trim().toLowerCase()))) return 'truefalse'
  if (options.length) return 'single'
  if (BLANK_RE.test(current.content.join('\n'))) return 'fill'
  return 'short'
}

export function parseExamText(input: string, answerText = ''): { questions: ParsedQuestion[]; warnings: string[] } {
  const warnings: string[] = []
  let text = input
  if (!answerText) [text, answerText] = splitAnswerSection(text)
  const examCode = EXAM_CODE_RE.exec(text)
  const keyCode = EXAM_CODE_RE.exec(answerText)
  if (examCode && keyCode && examCode[1] !== keyCode[1]) warnings.unshift(`Mã đề không khớp: file đề là ${examCode[1]} nhưng file đáp án là ${keyCode[1]}. Hãy dùng đúng file đáp án của đề này.`)
  const { answers: answerKey, explanations: keyExplanations } = answerText ? parseAnswerKeyFull(answerText) : { answers: new Map<number, string>(), explanations: new Map<number, string>() }
  const lines = cleanLines(text)
  const parsed: ParsedQuestion[] = []
  let current: CurrentQuestion | null = null
  let section: 'content' | 'options' | 'answer' | 'explanation' = 'content'
  let sourceNumber = 0
  const seenNumbers = new Set<number>()
  let partTitle = ''
  let partInstruction: string[] = []
  let passageLines: string[] = []
  let armed = false

  const finish = () => {
    if (!current) return
    let stem = current.content.join('\n').trim()
    const passage = current.passage
    if (passage) { stem = stem || `Chỗ trống (${sourceNumber})`; current.content = [`${passage}\n\n${stem}`] }
    const content = current.content.join('\n').trim()
    if (!content) { warnings.push(`Câu ${sourceNumber} không có nội dung nên đã bị bỏ qua.`); current = null; return }
    const labels = new Set(current.options.map(item => item.label))
    let marked = current.marked
    if (labels.size && marked.length && marked.length === labels.size && marked.every(label => labels.has(label))) {
      warnings.push(`Câu ${sourceNumber}: mọi phương án đều được tô/gạch chân nên bỏ qua dấu đánh dấu.`)
      marked = []
    }
    const keyRaw = answerKey.get(sourceNumber) || ''
    const inlineRaw = current.rawAnswer
    const rawAnswer = keyRaw || inlineRaw
    let correctAnswer: string | string[] | null = null
    let syntheticTf = false
    if (!current.options.length && TRUE_FALSE_ANSWERS.has(rawAnswer.trim().toLowerCase())) {
      current.options = [{ id: 'A', label: 'A', text: 'True' }, { id: 'B', label: 'B', text: 'False' }]
      labels.add('A'); labels.add('B')
      syntheticTf = true
      correctAnswer = ['t', 'true', 'đúng'].includes(rawAnswer.trim().toLowerCase()) ? 'A' : 'B'
    } else if (rawAnswer) {
      correctAnswer = answerValue(rawAnswer, labels)
    } else if (marked.length) {
      correctAnswer = marked.length > 1 ? marked : marked[0]
    }
    if (keyRaw && inlineRaw && keyRaw.trim().toUpperCase() !== inlineRaw.trim().toUpperCase()) warnings.push(`Câu ${sourceNumber}: đáp án trong đề (${inlineRaw}) khác file đáp án (${keyRaw}); dùng file đáp án.`)
    const kind = detectKind(current, correctAnswer)
    if (kind === 'truefalse' && !syntheticTf && typeof correctAnswer === 'string' && TRUE_FALSE_ANSWERS.has(correctAnswer.toLowerCase())) {
      const isTrue = ['true', 'đúng', 't'].includes(correctAnswer.toLowerCase())
      const accepted = isTrue ? new Set(['true', 'đúng']) : new Set(['false', 'sai'])
      for (const item of current.options) { if (accepted.has(item.text.trim().toLowerCase())) { correctAnswer = item.label; break } }
    }
    if ((kind === 'short' || kind === 'fill') && typeof correctAnswer === 'string' && correctAnswer.includes('|')) correctAnswer = correctAnswer.split('|').map(part => part.trim()).filter(Boolean)
    if (['single', 'multiple', 'truefalse'].includes(kind)) {
      const values = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer]
      if (correctAnswer !== null && !values.every(value => value !== null && labels.has(value))) {
        warnings.push(`Câu ${sourceNumber}: đáp án “${rawAnswer || correctAnswer}” không khớp phương án nào.`)
        correctAnswer = null
      }
      if (current.options.length < 2) warnings.push(`Câu ${sourceNumber}: có ít hơn 2 phương án, hãy kiểm tra lại.`)
    }
    const explanation = current.explanation.join('\n').trim() || keyExplanations.get(sourceNumber) || null
    parsed.push({
      id: parsed.length + 1, content, type: kind, options: current.options, points: 1, topic: '', order: parsed.length + 1,
      correctAnswer, explanation, partTitle: current.partTitle, partInstruction: current.partInstruction,
    })
    if (correctAnswer === null) warnings.push(`Câu ${sourceNumber} chưa có đáp án.`)
    current = null
  }

  const feed = (piece: string) => {
    if (!current) return
    const optionMatch = OPTION_RE.exec(piece)
    const answerMatch = ANSWER_RE.exec(piece)
    const explanationMatch = EXPLANATION_RE.exec(piece)
    if (optionMatch) {
      const label = (optionMatch[2] || optionMatch[3]).toUpperCase()
      current.options.push({ id: label, label, text: optionMatch[4].trim() })
      if (optionMatch[1]) current.marked.push(label)
      section = 'options'
    } else if (answerMatch) {
      current.rawAnswer = answerMatch[1].trim()
      section = 'answer'
    } else if (explanationMatch) {
      current.explanation = [explanationMatch[1].trim()]
      section = 'explanation'
    } else if (section === 'explanation') {
      current.explanation.push(piece)
    } else if (section === 'content') {
      current.content.push(piece)
    } else if (section === 'options' && piece.trim() && current.options.length) {
      current.options[current.options.length - 1].text += '\n' + piece.replace(/\s+$/, '')
    }
  }

  for (const line of lines) {
    const questionMatch = QUESTION_RE.exec(line) || QUESTION_TABLE_RE.exec(line)
    if (questionMatch) {
      finish()
      sourceNumber = parseInt(questionMatch[1], 10)
      if (seenNumbers.has(sourceNumber)) warnings.push(`Số câu ${sourceNumber} xuất hiện nhiều lần; đáp án có thể bị gán nhầm.`)
      seenNumbers.add(sourceNumber)
      current = { content: [], options: [], rawAnswer: '', explanation: [], marked: [], passage: passageLines.join('\n'), partTitle, partInstruction: partInstruction.join('\n') }
      section = 'content'
      for (const piece of splitInlineOptions(questionMatch[2].trim())) feed(piece)
      continue
    }
    if (END_RE.test(line)) { finish(); passageLines = []; armed = false; continue }
    if (HEADING_RE.test(line)) { finish(); partTitle = line.trim(); partInstruction = []; passageLines = []; armed = true; continue }
    if (INSTRUCTION_RE.test(line)) { finish(); partInstruction.push(line.trim()); passageLines = []; armed = true; continue }
    if (!current) {
      const stripped = line.trim()
      if (armed && stripped.length >= 40 && (line.match(/\t/g) || []).length < 2) passageLines.push(stripped)
      continue
    }
    for (const piece of splitInlineOptions(line)) feed(piece)
  }
  finish()
  if (!parsed.length) warnings.push('Không nhận diện được câu hỏi nào. Mỗi câu cần bắt đầu bằng “Câu 1.” (hoặc “1.”). Nếu file Word dùng số thứ tự tự động, hãy gõ số câu bằng tay hoặc xuất ra PDF.')
  const unused = [...answerKey.keys()].filter(num => !seenNumbers.has(num)).sort((a, b) => a - b)
  if (unused.length) warnings.push('Đáp án không có câu hỏi tương ứng: ' + unused.join(', '))
  return { questions: parsed, warnings }
}

export function sheetToText(rows: string[][]): string {
  let headerIndex: number | null = null
  const columns: Record<string, number> = {}
  for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
    const lowered = rows[index].map(cell => cell.trim().toLowerCase())
    const questionCol = lowered.findIndex(cell => ['câu hỏi', 'cau hoi', 'question', 'nội dung', 'noi dung'].includes(cell))
    if (questionCol < 0) continue
    headerIndex = index
    columns.question = questionCol
    lowered.forEach((cell, i) => {
      if (cell.length === 1 && OPTION_LABELS.includes(cell.toUpperCase())) columns[cell.toUpperCase()] = i
      else if (['đáp án', 'dap an', 'answer'].includes(cell)) columns.answer = i
      else if (['giải thích', 'giai thich', 'explanation'].includes(cell)) columns.explanation = i
    })
    break
  }
  if (headerIndex === null) return rows.map(row => row.join('\t')).join('\n')
  const out: string[] = []
  let number = 0
  for (const row of rows.slice(headerIndex + 1)) {
    const cell = (name: string) => { const col = columns[name]; return col !== undefined && col < row.length ? row[col].trim() : '' }
    const question = cell('question')
    if (!question) continue
    number += 1
    out.push(`Câu ${number}. ${question}`)
    for (const label of OPTION_LABELS) if (cell(label)) out.push(`${label}. ${cell(label)}`)
    if (cell('answer')) out.push(`Đáp án: ${cell('answer')}`)
    if (cell('explanation')) out.push(`Giải thích: ${cell('explanation')}`)
  }
  return out.join('\n')
}

function attr(el: Element | undefined, name: string): string {
  if (!el) return ''
  return el.getAttributeNS(W_NS, name) || el.getAttribute(`w:${name}`) || ''
}
const localChildren = (el: Element, local: string) => Array.from(el.children).filter(child => child.localName === local)

function runText(run: Element): { text: string; marked: boolean } {
  const rPr = localChildren(run, 'rPr')[0]
  let underline = false
  let highlight = false
  let red = false
  if (rPr) {
    const u = localChildren(rPr, 'u')[0]
    underline = Boolean(u) && (attr(u, 'val') || 'single') !== 'none'
    highlight = localChildren(rPr, 'highlight').length > 0
    red = ['FF0000', 'C00000', 'E60000'].includes(attr(localChildren(rPr, 'color')[0], 'val').toUpperCase())
  }
  let text = ''
  for (const node of Array.from(run.children)) {
    if (node.localName === 't') text += node.textContent || ''
    else if (node.localName === 'tab') text += '\t'
    else if (node.localName === 'br') text += '\n'
  }
  if (underline && text.length > 0 && /^\s+$/.test(text)) text = '_'.repeat(Math.max(text.replace(/\t/g, '    ').length, 4))
  return { text, marked: underline || highlight || red }
}

function paragraphText(paragraph: Element): string {
  const runs = Array.from(paragraph.getElementsByTagNameNS(W_NS, 'r'))
  let text = ''
  let firstMarked = false
  let firstNonEmptySeen = false
  for (const run of runs) {
    const { text: runStr, marked } = runText(run)
    text += runStr
    if (!firstNonEmptySeen && runStr.trim()) { firstMarked = marked; firstNonEmptySeen = true }
  }
  const match = OPTION_RE.exec(text)
  if (match && !match[1] && firstMarked) text = CORRECT_MARK + text.replace(/^\s+/, '')
  return text
}

async function extractDocx(file: File): Promise<{ text: string; warnings: string[] }> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) return { text: '', warnings: ['Không đọc được nội dung file Word.'] }
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0]
  if (!body) return { text: '', warnings: ['File Word không có nội dung văn bản.'] }
  const blocks: string[] = []
  for (const child of Array.from(body.children)) {
    if (child.localName === 'p') {
      blocks.push(paragraphText(child))
    } else if (child.localName === 'tbl') {
      for (const row of Array.from(child.getElementsByTagNameNS(W_NS, 'tr'))) {
        const cells: string[] = []
        const seen = new Set<Element>()
        for (const tc of Array.from(row.getElementsByTagNameNS(W_NS, 'tc'))) {
          if (seen.has(tc)) continue
          seen.add(tc)
          cells.push(Array.from(tc.getElementsByTagNameNS(W_NS, 'p')).map(p => paragraphText(p)).join(' ').trim())
        }
        blocks.push(cells.join('\t'))
      }
    }
  }
  return { text: blocks.join('\n'), warnings: [] }
}

async function extractXlsx(file: File): Promise<{ text: string; warnings: string[] }> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const chunks: string[] = []
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '' })
    chunks.push(sheetToText(rows.map(row => row.map(cell => String(cell ?? '')))))
  }
  return { text: chunks.join('\n'), warnings: [] }
}

async function extractPdf(file: File): Promise<{ text: string; warnings: string[] }> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const pdf = await loadingTask.promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    let pageText = ''
    for (const item of content.items) {
      if ('str' in item) { pageText += item.str; pageText += item.hasEOL ? '\n' : ' ' }
    }
    pages.push(pageText)
  }
  const text = pages.join('\n')
  const warnings = text.trim() ? [] : ['PDF không có lớp chữ (có thể là bản scan). Hãy xuất PDF từ Word hoặc dùng file TXT.']
  await loadingTask.destroy()
  return { text, warnings }
}

export async function extractDocumentText(file: File): Promise<{ text: string; warnings: string[] }> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) return extractDocx(file)
  if (name.endsWith('.pdf')) return extractPdf(file)
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return extractXlsx(file)
  if (/\.(png|jpe?g|gif|webp)$/.test(name)) return { text: '', warnings: ['Ảnh cần OCR chưa được hỗ trợ trên trình duyệt. Hãy xuất đề ra Word, PDF hoặc TXT.'] }
  return { text: await file.text(), warnings: [] }
}

function guessTitle(text: string, filename: string): string {
  const lines = cleanLines(text).map(line => line.trim()).filter(Boolean)
  const candidate = lines.find(line => /ĐỀ|EXAM|TEST|KIỂM TRA/i.test(line)) || lines[0] || ''
  return (candidate || filename.replace(/\.[^.]+$/, '')).slice(0, 200)
}

export async function parseExamFiles(examFile: File, answerFile?: File | null): Promise<ParseResult> {
  const warnings: string[] = []
  const examExtract = await extractDocumentText(examFile)
  warnings.push(...examExtract.warnings)
  let answerText = ''
  if (answerFile) { const answerExtract = await extractDocumentText(answerFile); warnings.push(...answerExtract.warnings); answerText = answerExtract.text }
  const { questions, warnings: parseWarnings } = parseExamText(examExtract.text, answerText)
  warnings.push(...parseWarnings)
  const missingAnswers = questions.filter(question => question.correctAnswer === null || (Array.isArray(question.correctAnswer) && !question.correctAnswer.length)).length
  return { title: guessTitle(examExtract.text, examFile.name), questions, warnings, missingAnswers }
}