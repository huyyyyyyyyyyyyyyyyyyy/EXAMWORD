import glob, collections, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Cyrillic homoglyphs that were accidentally mixed into Vietnamese (Latin) text.
MAP = {
    0x0406: 'I',   # І
    0x0456: 'i',   # і
    0x0405: 'S',   # Ѕ
    0x0455: 's',   # ѕ
    0x0404: 'E',   # Є
    0x0454: 'e',   # є
    0x0415: 'E',   # Е
    0x0435: 'e',   # е
    0x041E: 'O',   # О
    0x043E: 'o',   # о
    0x0410: 'A',   # А
    0x0430: 'a',   # а
    0x0420: 'P',   # Р
    0x0440: 'p',   # р
    0x0421: 'C',   # С
    0x0441: 'c',   # с
    0x0425: 'X',   # Х
    0x0445: 'x',   # х
    0x0423: 'Y',   # У
    0x0443: 'y',   # у
    0x0422: 'T',   # Т
    0x0442: 't',   # т
    0x041D: 'H',   # Н
    0x043D: 'h',   # н
    0x041C: 'M',   # М
    0x043C: 'm',   # м
    0x0412: 'B',   # В
    0x0432: 'b',   # в
    0x041A: 'K',   # К
    0x043A: 'k',   # к
    0x0417: 'Z',   # З
    0x0437: 'z',   # з
    0x0427: 'Ch',  # Ч
    0x0447: 'ch',  # ч
    0x0428: 'Sh',  # Ш
    0x0448: 'sh',  # ш
    0x042F: 'Ya',  # Я
    0x044F: 'ya',  # я
    0x042E: 'Yu',  # Ю
    0x044E: 'yu',  # ю
    0x0419: 'Y',   # Й
    0x0439: 'y',   # й
    0x042B: 'Y',   # Ы
    0x044B: 'y',   # ы
    0x042C: '',    # Ь
    0x044C: '',    # ь
    0x042A: '',    # Ъ
    0x044A: '',    # ъ
    0x0401: 'E',   # Ё
    0x0451: 'e',   # ё
    0x0407: 'I',   # Ї
    0x0457: 'i',   # ї
    0x0408: 'J',   # Ј
    0x0458: 'j',   # ј
    0x0409: 'Lj',  # Љ
    0x0459: 'lj',  # љ
    0x040A: 'Nj',  # Њ
    0x045A: 'nj',  # њ
    0x040F: 'Dz',  # Џ
    0x045F: 'dz',  # џ
    0x0490: 'G',   # Ґ
    0x0491: 'g',   # ґ
    0x0402: 'Dj',  # Ђ
    0x0452: 'dj',  # ђ
    0x040B: 'C',   # Ћ
    0x045B: 'c',   # ћ
    0x0424: 'F',   # Ф
    0x0444: 'f',   # ф
    0x0411: 'B',   # Б
    0x0431: 'b',   # б
    0x0413: 'G',   # Г
    0x0433: 'g',   # г
    0x0414: 'D',   # Д
    0x0434: 'd',   # д
    0x0416: 'Zh',  # Ж
    0x0436: 'zh',  # ж
    0x0418: 'I',   # И
    0x0438: 'i',   # и
    0x041B: 'L',   # Л
    0x043B: 'l',   # л
    0x041F: 'P',   # П
    0x043F: 'p',   # п
    0x0426: 'Ts',  # Ц
    0x0446: 'ts',  # ц
    0x0429: 'Sch', # Щ
    0x0449: 'sch', # щ
    0x042D: 'E',   # Э
    0x044D: 'e',   # э
}

changed = {}
for f in glob.glob('**/*.tsx', recursive=True) + glob.glob('**/*.ts', recursive=True):
    t = open(f, encoding='utf-8').read()
    found = collections.Counter(ch for ch in t if ord(ch) in MAP)
    if not found:
        continue
    new = ''.join(MAP.get(ord(ch), ch) for ch in t)
    open(f, 'w', encoding='utf-8', newline='').write(new)
    changed[f] = dict(found)

for f, counts in sorted(changed.items()):
    detail = ', '.join(f'U+{ord(c):04X}×{n}' for c, n in counts.items())
    print(f'{f}: {detail}')
print(f'TOTAL FILES FIXED: {len(changed)}')