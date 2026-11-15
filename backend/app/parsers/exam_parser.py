"""Tự động nhận diện câu hỏi / đáp án từ file đề thi (TXT, DOCX, PDF, XLSX, ảnh).

Các định dạng được hỗ trợ:
  * Câu hỏi:  "Câu 1.", "Câu 1:", "Question 1)", "1." ...
  * Phương án: mỗi phương án một dòng ("A. ...") hoặc nhiều phương án trên một dòng
    ("A. x   B. y   C. z   D. w").
  * Đáp án nằm trong đề ("Đáp án: B"), trong file đáp án riêng, hoặc ở cuối cùng file
    dưới một tiêu đề "ĐÁP ÁN".
  * File đáp án: "1. A", "1-A", "1A", "Câu 1: A", "1 A 2 B 3 C", bảng ngang
    (hàng "Câu" + hàng "Đáp án"), kèm "Giải thích".
  * DOCX: phương án được gạch chân / tô sáng / chữ đỏ sẽ được hiểu là đáp án đúng.
  * XLSX dạng bảng: cột Câu hỏi | A | B | C | D | Đáp án | Giải thích.
"""

import re
from pathlib import Path
from typing import Any


CORRECT_MARK = "\u2605"  # ★ đánh dấu phương án được tô/gạch chân trong DOCX
OPTION_LABELS = "ABCDEFGH"

QUESTION_RE = re.compile(r"^\s*(?:(?:Câu|Cau|Question)\s+)?(\d+)\s*[.):]\s*(.*)$", re.IGNORECASE)
OPTION_RE = re.compile(r"^\s*(" + CORRECT_MARK + r")?\s*(?:([A-H])\s*[.):]|([a-h])\s*\))\s*(.*)$")
QUESTION_TABLE_RE = re.compile(r"^\s*(?:Câu|Cau|Question)\s+(\d+)\t+(.*)$", re.IGNORECASE)
INSTRUCTION_RE = re.compile(
    r"^\s*(?:Mark\s+the\s+letter|Read\s+the\s+following|Choose\s+(?:the|one)|Circle\s+the|Listen\s+(?:to|and)"
    r"|Task\s+\d+\b|Decide\s+whether|You\s+will\s+(?:hear|listen)|Complete\s+the|Fill\s+in"
    r"|Đọc\s+đoạn|Khoanh\s+tròn|Chọn\s+(?:đáp\s+án|phương\s+án)|Hãy\s+chọn)",
    re.IGNORECASE,
)
END_RE = re.compile(r"THE\s+END|^\W*HẾT\W*$|Thí\s+sinh\s+không\s+được", re.IGNORECASE)
EXAM_CODE_RE = re.compile(r"Mã\s+đề(?:\s+thi)?\s*[:：]?\s*(\d{2,4})", re.IGNORECASE)
ANSWER_RE = re.compile(r"^\s*(?:Đáp\s+án|Dap\s+an|Answer|Ans|ĐA)\s*[:：]\s*(.*)$", re.IGNORECASE)
EXPLANATION_RE = re.compile(
    r"^\s*(?:Giải\s+thích|Giai\s+thich|Explanation|Lời\s+giải|Hướng\s+dẫn\s+giải)\s*[:：]\s*(.*)$", re.IGNORECASE
)
HEADING_RE = re.compile(
    r"^\s*(?:(?:PHẦN|PHAN|PART|SECTION)\s+[IVXLC\d]+\b|ĐỀ\s+THI\b|ĐỀ\s+KIỂM\s+TRA\b|ĐỀ\s+SỐ\b)",
    re.IGNORECASE,
)
ANSWER_SECTION_RE = re.compile(
    r"^\s*(?:BẢNG\s+)?(?:ĐÁP\s*ÁN|DAP\s*AN|ANSWER\s*KEY|ANSWERS?|HƯỚNG\s+DẪN\s+GIẢI|LỜI\s+GIẢI)[^\n:]{0,40}$",
    re.IGNORECASE,
)

# Một đáp án trong file đáp án: "A", "A,C", "AC", "Đúng"...
_ANSWER_TOKEN = r"(?:[A-Ha-h](?:(?:\s*[,;/&]\s*|\s+)[A-Ha-h](?![A-Za-z0-9]))*|[A-Ha-h]{2,8}|[Tt]|Đúng|Sai|True|False)"
_TOKEN_END = r"(?![A-Za-z0-9À-ỹ])"
PAIR_RE = re.compile(
    r"(?:Câu|Cau|Question|Q)?\s*(\d{1,3})\s*[.):\-–—=]?\s*(" + _ANSWER_TOKEN + r")" + _TOKEN_END,
    re.IGNORECASE,
)
ENTRY_RE = re.compile(r"^\s*(?:(?:Câu|Cau|Question)\s+)?(\d{1,3})\s*[.):\-–—]\s*(.*)$", re.IGNORECASE)
SPACED_ENTRY_RE = re.compile(r"^\s*(\d{1,3})\s+(\S.{0,40})$")
HEADER_ROW_RE = re.compile(
    r"^\s*(?:Câu|Cau|STT|Question|No\.?)\s*[\t|]+\s*(\d+(?:\s*[\t|]\s*\d+)*)\s*[\t|]*\s*$", re.IGNORECASE
)
ANSWER_ROW_RE = re.compile(r"^\s*(?:Đáp\s*án|Dap\s*an|Answer|ĐA)\s*[\t|]+(.+)$", re.IGNORECASE)
LEADING_ANSWER_RE = re.compile(
    r"^(" + _ANSWER_TOKEN + r")" + _TOKEN_END + r"\s*(?:[.):\-–—]\s*(.*))?$", re.IGNORECASE
)
INLINE_OPTION_RE = re.compile(r"(?:(?<=\s)|^)(" + CORRECT_MARK + r"?)([A-H])[.)]\s+(?=\S)")
BLANK_RE = re.compile(r"\.{3,}|_{3,}|…")
TRUE_FALSE_WORDS = {"true", "false", "đúng", "sai"}
TRUE_FALSE_ANSWERS = TRUE_FALSE_WORDS | {"t", "f"}


# --------------------------------------------------------------------------- answer key


def _clean_lines(text: str) -> list[str]:
    return text.replace("\r\n", "\n").replace("\r", "\n").split("\n")


def parse_answer_key_full(text: str) -> tuple[dict[int, str], dict[int, str]]:
    """Trả về (đáp án theo số câu, giải thích theo số câu)."""
    answers: dict[int, str] = {}
    explanations: dict[int, str] = {}
    current: int | None = None
    pending_numbers: list[int] = []
    in_explanation = False

    for line in _clean_lines(text):
        stripped = line.strip()
        if not stripped:
            continue

        header = HEADER_ROW_RE.match(line)
        if header:
            pending_numbers = [int(n) for n in re.split(r"[\t|]", header.group(1)) if n.strip().isdigit()]
            continue
        row = ANSWER_ROW_RE.match(line)
        if row and pending_numbers:
            cells = [c.strip() for c in re.split(r"[\t|]", row.group(1)) if c.strip()]
            for number, cell in zip(pending_numbers, cells):
                answers[number] = cell
            pending_numbers = []
            continue

        # Cả dòng chỉ gồm các cặp "số + đáp án": "1. A  2. B  3. C"
        pairs = list(PAIR_RE.finditer(stripped))
        if pairs:
            leftover = PAIR_RE.sub(" ", stripped)
            if not re.sub(r"[\s,;|/\t]+", "", leftover):
                for match in pairs:
                    current = int(match.group(1))
                    answers[current] = match.group(2).strip()
                in_explanation = False
                continue

        entry = ENTRY_RE.match(line)
        if entry:
            current = int(entry.group(1))
            in_explanation = False
            rest = entry.group(2).strip()
            inline = ANSWER_RE.match(rest)
            if inline:
                rest = inline.group(1).strip()
            if rest:
                lead = LEADING_ANSWER_RE.match(rest)
                if lead:
                    answers[current] = lead.group(1).strip()
                    if lead.group(2):
                        explanations[current] = lead.group(2).strip()
                else:
                    answers[current] = rest.lstrip(":- ").strip()
            continue

        spaced = SPACED_ENTRY_RE.match(line)
        if spaced and not in_explanation:
            current = int(spaced.group(1))
            answers[current] = spaced.group(2).strip()
            continue

        if current is None:
            continue
        answer_match = ANSWER_RE.match(line)
        if answer_match:
            answers[current] = answer_match.group(1).strip()
            in_explanation = False
            continue
        explanation_match = EXPLANATION_RE.match(line)
        if explanation_match:
            explanations[current] = explanation_match.group(1).strip()
            in_explanation = True
            continue
        if in_explanation:
            explanations[current] = (explanations.get(current, "") + "\n" + stripped).strip()
    return answers, explanations


def parse_answer_key(text: str) -> dict[int, str]:
    return parse_answer_key_full(text)[0]


def _answer_value(raw: str, option_labels: set[str]) -> str | list[str]:
    raw = raw.strip().rstrip(".").strip()
    parts = [part.strip() for part in re.split(r"[,;/&]|\s+", raw) if part.strip()]
    if len(parts) > 1 and all(part.upper() in option_labels for part in parts):
        return sorted({part.upper() for part in parts})
    if raw.upper() in option_labels:
        return raw.upper()
    compact = raw.upper().replace(" ", "")
    if (
        len(compact) > 1
        and option_labels
        and len(set(compact)) == len(compact)
        and all(ch in option_labels for ch in compact)
    ):
        return sorted(compact)
    return raw


def split_answer_section(text: str) -> tuple[str, str]:
    """Nếu cuối file đề có phần 'ĐÁP ÁN' thì tách riêng để làm file đáp án."""
    lines = _clean_lines(text)
    first_question = next((i for i, line in enumerate(lines) if QUESTION_RE.match(line)), None)
    if first_question is None:
        return text, ""
    for index in range(first_question + 1, len(lines)):
        if ANSWER_SECTION_RE.match(lines[index]) and not QUESTION_RE.match(lines[index]):
            tail = "\n".join(lines[index + 1 :])
            if parse_answer_key(tail):
                return "\n".join(lines[:index]), tail
    return text, ""


# --------------------------------------------------------------------------- exam body


def split_inline_options(line: str) -> list[str]:
    """Tách 'A. x B. y C. z D. w' trên cùng một dòng thành nhiều dòng."""
    matches = list(INLINE_OPTION_RE.finditer(line))
    for i, first in enumerate(matches):
        # Chuỗi phương án bắt đầu từ A, hoặc là dòng chỉ có "C. ...  D. ..." (nhãn đứng đầu dòng)
        if first.group(2) != "A" and line[: first.start()].strip():
            continue
        run = [first]
        for nxt in matches[i + 1 :]:
            if ord(nxt.group(2)) == ord(run[-1].group(2)) + 1:
                run.append(nxt)
        if len(run) >= 2:
            pieces: list[str] = []
            head = line[: run[0].start()].rstrip()
            if head:
                pieces.append(head)
            for j, match in enumerate(run):
                end = run[j + 1].start() if j + 1 < len(run) else len(line)
                pieces.append(line[match.start() : end].strip())
            return pieces
    return [line]


def _detect_kind(current: dict[str, Any], correct: Any) -> str:
    options = current["options"]
    if isinstance(correct, list) and options:
        return "multiple"
    if options and all(item["text"].strip().casefold() in TRUE_FALSE_WORDS for item in options):
        return "truefalse"
    if options:
        return "single"
    if BLANK_RE.search(current["content"]):
        return "fill"
    return "short"


def parse_exam_text(text: str, answer_text: str = "") -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    if not answer_text:
        text, answer_text = split_answer_section(text)
    exam_code, key_code = EXAM_CODE_RE.search(text), EXAM_CODE_RE.search(answer_text)
    if exam_code and key_code and exam_code.group(1) != key_code.group(1):
        warnings.insert(
            0,
            f"Mã đề không khớp: file đề là {exam_code.group(1)} nhưng file đáp án là {key_code.group(1)}. "
            "Hãy dùng đúng file đáp án của đề này.",
        )
    answer_key, key_explanations = parse_answer_key_full(answer_text) if answer_text else ({}, {})
    lines = _clean_lines(text)
    parsed: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    section = "content"
    source_number = 0
    seen_numbers: set[int] = set()

    def finish() -> None:
        nonlocal current
        if current is None:
            return
        stem = "\n".join(current["content"]).strip()
        passage = current.pop("passage", "")
        if passage:
            stem = stem or f"Chỗ trống ({source_number})"
            current["content"] = f"{passage}\n\n{stem}"
        else:
            current["content"] = stem
        if not current["content"]:
            warnings.append(f"Câu {source_number} không có nội dung nên đã bị bỏ qua.")
            current = None
            return
        labels = {item["label"] for item in current["options"]}
        marked = current.pop("marked")
        if labels and marked and set(marked) == labels:
            warnings.append(f"Câu {source_number}: mọi phương án đều được tô/gạch chân nên bỏ qua dấu đánh dấu.")
            marked = []
        key_raw = answer_key.get(source_number, "")
        inline_raw = current.pop("rawAnswer", "")
        raw_answer = key_raw or inline_raw
        correct_answer: Any = None
        synthetic_tf = False
        if not current["options"] and raw_answer.strip().casefold() in TRUE_FALSE_ANSWERS:
            current["options"] = [
                {"id": "A", "label": "A", "text": "True"},
                {"id": "B", "label": "B", "text": "False"},
            ]
            labels = {"A", "B"}
            synthetic_tf = True
            correct_answer = "A" if raw_answer.strip().casefold() in {"t", "true", "đúng"} else "B"
        elif raw_answer:
            correct_answer = _answer_value(raw_answer, labels)
        elif marked:
            correct_answer = marked if len(marked) > 1 else marked[0]
        if key_raw and inline_raw and key_raw.strip().upper() != inline_raw.strip().upper():
            warnings.append(
                f"Câu {source_number}: đáp án trong đề ({inline_raw}) khác file đáp án ({key_raw}); dùng file đáp án."
            )
        kind = _detect_kind(current, correct_answer)
        if (
            kind == "truefalse"
            and not synthetic_tf
            and isinstance(correct_answer, str)
            and correct_answer.casefold() in TRUE_FALSE_ANSWERS
        ):
            is_true = correct_answer.casefold() in {"true", "đúng", "t"}
            accepted = {"true", "đúng"} if is_true else {"false", "sai"}
            for item in current["options"]:
                if item["text"].strip().casefold() in accepted:
                    correct_answer = item["label"]
                    break
        if kind in {"short", "fill"} and isinstance(correct_answer, str) and "|" in correct_answer:
            correct_answer = [part.strip() for part in correct_answer.split("|") if part.strip()]
        if kind in {"single", "multiple", "truefalse"}:
            values = correct_answer if isinstance(correct_answer, list) else [correct_answer]
            if correct_answer is not None and not all(value in labels for value in values):
                warnings.append(f"Câu {source_number}: đáp án “{raw_answer or correct_answer}” không khớp phương án nào.")
                correct_answer = None
            if len(current["options"]) < 2:
                warnings.append(f"Câu {source_number}: có ít hơn 2 phương án, hãy kiểm tra lại.")
        explanation = "\n".join(current["explanation"]).strip() or key_explanations.get(source_number) or None
        parsed.append(
            {
                "id": len(parsed) + 1,
                "content": current["content"],
                "type": kind,
                "options": current["options"],
                "points": 1,
                "topic": "",
                "order": len(parsed) + 1,
                "audioUrl": None,
                "imageUrl": None,
                "correctAnswer": correct_answer,
                "explanation": explanation,
            }
        )
        if correct_answer is None:
            warnings.append(f"Câu {source_number} chưa có đáp án.")
        current = None

    def feed(piece: str) -> None:
        nonlocal section
        if current is None:
            return
        option_match = OPTION_RE.match(piece)
        answer_match = ANSWER_RE.match(piece)
        explanation_match = EXPLANATION_RE.match(piece)
        if option_match:
            label = (option_match.group(2) or option_match.group(3)).upper()
            current["options"].append({"id": label, "label": label, "text": option_match.group(4).strip()})
            if option_match.group(1):
                current["marked"].append(label)
            section = "options"
        elif answer_match:
            current["rawAnswer"] = answer_match.group(1).strip()
            section = "answer"
        elif explanation_match:
            current["explanation"] = [explanation_match.group(1).strip()]
            section = "explanation"
        elif section == "explanation":
            current["explanation"].append(piece)
        elif section == "content":
            current["content"].append(piece)
        elif section == "options" and piece.strip() and current["options"]:
            current["options"][-1]["text"] += "\n" + piece.rstrip()

    passage_lines: list[str] = []
    armed = False  # chỉ gom đoạn văn sau khi gặp tiêu đề PART / yêu cầu đề bài

    for line in lines:
        question_match = QUESTION_RE.match(line) or QUESTION_TABLE_RE.match(line)
        if question_match:
            finish()
            source_number = int(question_match.group(1))
            if source_number in seen_numbers:
                warnings.append(f"Số câu {source_number} xuất hiện nhiều lần; đáp án có thể bị gán nhầm.")
            seen_numbers.add(source_number)
            current = {
                "content": [],
                "options": [],
                "rawAnswer": "",
                "explanation": [],
                "marked": [],
                "passage": "\n".join(passage_lines),
            }
            section = "content"
            for piece in split_inline_options(question_match.group(2).strip()):
                feed(piece)
            continue
        if END_RE.search(line):
            finish()
            passage_lines, armed = [], False
            continue
        if HEADING_RE.match(line) or INSTRUCTION_RE.match(line):
            finish()
            passage_lines, armed = [], True
            continue
        if current is None:
            stripped = line.strip()
            if armed and len(stripped) >= 40 and line.count("\t") < 2:
                passage_lines.append(stripped)
            continue
        for piece in split_inline_options(line):
            feed(piece)
    finish()
    if not parsed:
        warnings.append(
            "Không nhận diện được câu hỏi nào. Mỗi câu cần bắt đầu bằng “Câu 1.” (hoặc “1.”). "
            "Nếu file Word dùng số thứ tự tự động, hãy gõ số câu bằng tay hoặc xuất ra PDF."
        )
    unused_answers = set(answer_key) - seen_numbers
    if unused_answers:
        warnings.append("Đáp án không có câu hỏi tương ứng: " + ", ".join(map(str, sorted(unused_answers))))
    return parsed, warnings


# --------------------------------------------------------------------------- file readers


def _docx_option_marked(paragraph: Any) -> bool:
    """Phương án có nhãn (A., B....) được gạch chân, tô sáng hoặc chữ đỏ."""
    try:
        for run in paragraph.runs:
            if not run.text.strip():
                continue
            font = run.font
            color = None
            if font.color is not None and font.color.rgb is not None:
                color = str(font.color.rgb).upper()
            return bool(font.underline or font.highlight_color is not None or color in {"FF0000", "C00000", "E60000"})
    except (AttributeError, ValueError):
        return False
    return False


def _docx_text(path: Path) -> str:
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    document = Document(str(path))
    blocks: list[str] = []
    for child in document.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            paragraph = Paragraph(child, document)
            text = paragraph.text
            match = OPTION_RE.match(text)
            if match and not match.group(1) and _docx_option_marked(paragraph):
                text = CORRECT_MARK + text.lstrip()
            blocks.append(text)
        elif tag == "tbl":
            table = Table(child, document)
            for row in table.rows:
                seen: set[int] = set()
                cells: list[str] = []
                for cell in row.cells:
                    if id(cell._tc) in seen:  # ô gộp
                        continue
                    seen.add(id(cell._tc))
                    cells.append(cell.text.strip().replace("\n", " "))
                blocks.append("\t".join(cells))
    return "\n".join(blocks)


def _sheet_to_text(rows: list[list[str]]) -> str:
    """Bảng Excel có cột 'Câu hỏi', A..H, 'Đáp án' -> văn bản chuẩn."""
    header_index = None
    columns: dict[str, int] = {}
    for index, row in enumerate(rows[:10]):
        lowered = [cell.strip().casefold() for cell in row]
        question_col = next(
            (i for i, c in enumerate(lowered) if c in {"câu hỏi", "cau hoi", "question", "nội dung", "noi dung"}), None
        )
        if question_col is None:
            continue
        header_index = index
        columns["question"] = question_col
        for i, c in enumerate(lowered):
            if len(c) == 1 and c.upper() in OPTION_LABELS:
                columns[c.upper()] = i
            elif c in {"đáp án", "dap an", "answer"}:
                columns["answer"] = i
            elif c in {"giải thích", "giai thich", "explanation"}:
                columns["explanation"] = i
        break
    if header_index is None:
        return "\n".join("\t".join(row) for row in rows)
    out: list[str] = []
    number = 0
    for row in rows[header_index + 1 :]:

        def cell(name: str) -> str:
            col = columns.get(name)
            return row[col].strip() if col is not None and col < len(row) else ""

        question = cell("question")
        if not question:
            continue
        number += 1
        out.append(f"Câu {number}. {question}")
        for label in OPTION_LABELS:
            if cell(label):
                out.append(f"{label}. {cell(label)}")
        if cell("answer"):
            out.append(f"Đáp án: {cell('answer')}")
        if cell("explanation"):
            out.append(f"Giải thích: {cell('explanation')}")
    return "\n".join(out)


def extract_text(path: Path) -> tuple[str, list[str]]:
    suffix = path.suffix.lower()
    warnings: list[str] = []
    if suffix == ".txt":
        raw = path.read_bytes()
        for encoding in ("utf-8-sig", "utf-16", "cp1258", "cp1252"):
            try:
                return raw.decode(encoding), warnings
            except UnicodeError:
                continue
        return raw.decode("utf-8", errors="replace"), warnings
    if suffix == ".docx":
        return _docx_text(path), warnings
    if suffix == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        if not text.strip():
            warnings.append("PDF không có lớp chữ (có thể là bản scan). Hãy xuất PDF từ Word hoặc tải ảnh để dùng OCR.")
        return text, warnings
    if suffix == ".xlsx":
        from openpyxl import load_workbook

        workbook = load_workbook(str(path), read_only=True, data_only=True)
        chunks = []
        for sheet in workbook.worksheets:
            rows = [["" if cell is None else str(cell) for cell in row] for row in sheet.iter_rows(values_only=True)]
            chunks.append(_sheet_to_text(rows))
        workbook.close()
        return "\n".join(chunks), warnings
    if suffix in {".png", ".jpg", ".jpeg"}:
        try:
            import pytesseract
            from PIL import Image

            pytesseract.get_tesseract_version()
            image = Image.open(path)
            try:
                return pytesseract.image_to_string(image, lang="vie+eng"), warnings
            except pytesseract.TesseractError:
                return pytesseract.image_to_string(image), warnings
        except (ImportError, RuntimeError, OSError) as exc:
            warnings.append(f"Chưa dùng được OCR, hãy cài Tesseract để đọc ảnh. {exc}")
            return "", warnings
    raise ValueError("Unsupported document format")
