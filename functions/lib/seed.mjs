// Idempotent runtime seed (fixed UUIDs + insertIfAbsent). No migration DML.
// Password hashes are precomputed PBKDF2 constants so cold starts stay fast.
import { rows } from './http.mjs';

const PW = {
  admin: { salt: 't9ObMHgiapDhBrWTZz+dgQ==', hash: 'xGqSGGi0I9MOXfbmBdPxSUwrTxePxnwHKrGwl8BO3tc=', iterations: 600000 },
  teacher: { salt: '0aVRocaLqRqxHPQ0Xrn/Wg==', hash: 'BTQgdbPvAHEsqQKi8rxqnKpegG6Cn+2pGS7by12TP1g=', iterations: 600000 },
  student: { salt: 'dAhqpAU1U9RBm5b05d/C1A==', hash: 'ry9xJFZqE4TSCFDqeEdPa/wl/mguGL79x1oxAmAnYsA=', iterations: 600000 },
};
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const C = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const E = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const Q = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = (n) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CM = (n) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const IDS = { admin: U(1), teacher: U(2), student: U(3), classA: C(1), classB: C(2), examEnglish: E(6) };

const USERS = [
  { id: U(1), name: 'Quản trị ExamWorld', email: 'admin@examworld.dev', pw: PW.admin, role: 'admin', teacher_id: null, xp: 0, streak: 0 },
  { id: U(2), name: 'Cô Minh Anh', email: 'teacher@examworld.dev', pw: PW.teacher, role: 'teacher', teacher_id: null, xp: 0, streak: 0 },
  { id: U(3), name: 'Ha Nguyen Nhat Huy', email: 'student@examworld.dev', pw: PW.student, role: 'student', teacher_id: U(2), xp: 120, streak: 3 },
  { id: U(4), name: 'Nguyễn Văn An', email: 'an@student.examworld.dev', pw: PW.student, role: 'student', teacher_id: U(2), xp: 60, streak: 1 },
  { id: U(5), name: 'Trần Thị Bình', email: 'binh@student.examworld.dev', pw: PW.student, role: 'student', teacher_id: U(2), xp: 95, streak: 2 },
  { id: U(6), name: 'Lê Hoàng Cường', email: 'cuong@student.examworld.dev', pw: PW.student, role: 'student', teacher_id: U(2), xp: 30, streak: 0 },
  { id: U(7), name: 'Phạm Thu Dung', email: 'dung@student.examworld.dev', pw: PW.student, role: 'student', teacher_id: U(2), xp: 150, streak: 4 },
  { id: U(8), name: 'Đỗ Đức Em', email: 'em@student.examworld.dev', pw: PW.student, role: 'student', teacher_id: U(2), xp: 10, streak: 0 },
];

const CLASSES = [
  { id: C(1), name: 'Lớp 10A1', description: 'Lớp Tiếng Anh nâng cao — học sinh khá giỏi.', teacher_id: U(2) },
  { id: C(2), name: 'Lớp 10A2', description: 'Lớp Tiếng Anh cơ bản — củng cố nền tảng.', teacher_id: U(2) },
];
const MEMBERS = [
  [C(1), U(3)], [C(1), U(4)], [C(1), U(5)], [C(1), U(6)],
  [C(2), U(7)], [C(2), U(8)],
];

const opts = (texts) => texts.map((text, i) => {
  const id = String.fromCharCode(65 + i);
  return { id, label: id, text };
});
const TF = opts(['True', 'False']);
const q = (content, type, options, correct_answer, extra = {}) => ({ content, type, options, correct_answer, points: 1, topic: '', explanation: '', ...extra });

// Real user exam: "Thi Giữa Kì Tiếng Anh" (32 questions), part annotations restored.
const LISTEN = 'You will hear a radio interview between a host and Mister Lee, a music teacher, about a school band that plays instruments made from rubbish. Listen and do Task 1 and Task 2. You will listen TWICE.';
const P1 = { part_title: 'PART 1. LISTENING — Task 1', part_instruction: `${LISTEN}\nTask 1. Decide whether the following statements are True (A) or False (B).` };
const P2 = { part_title: 'PART 1. LISTENING — Task 2', part_instruction: 'Task 2. Listen again and choose the best answer (A, B, C or D) for each question about the interview.' };
const P3 = { part_title: 'PART 2. SENTENCE ORDERING', part_instruction: 'Choose the option (A, B, C or D) that best arranges the sentences into a coherent paragraph or conversation.' };
const P4 = { part_title: 'PART 3. CLOSEST MEANING', part_instruction: 'Choose the word or phrase that is CLOSEST in meaning to the underlined word in each sentence.' };
const P5 = { part_title: 'PART 4. LANGUAGE FOCUS', part_instruction: 'Choose the best answer (A, B, C or D) to complete each sentence. Keep the blanks (______) in mind.' };
const P6 = { part_title: 'PART 5. GUIDED CLOZE TEST', part_instruction: 'Read the passage about plastic pollution and choose the best answer for each numbered blank (23)–(27).' };
const P7 = { part_title: 'PART 6. READING COMPREHENSION', part_instruction: 'Read the passage about music streaming and choose the best answer (A, B, C or D) for each question.' };

const CLOZE = 'Plastic pollution is a serious threat (23) ______ our oceans. Many people think plastic bags are useful, (24) ______ every year millions of sea animals die because they eat them. Plastic takes hundreds of years to break down, so the (25) ______ of this problem will last for a long time. Fortunately, there are simple ways to (26) ______ plastic waste, such as bringing reusable bags when we go shopping. If we all join hands, our oceans will be much (27) ______ in the future.';
const READING = "Not long ago, listening to music meant buying a record or a cassette, or waiting for a favourite song to be played on the radio. Today, thanks to streaming services, millions of songs are available at the touch of a button, and listeners can create playlists that match their moods.\nHowever, this convenience has changed the way we experience music. Because it is so easy to skip a song, many people no longer listen to an entire album, and artists often shorten their songs to keep the audience's attention. Some musicians also complain that streaming pays them very little, which makes it difficult for young artists to earn a living.\nDespite these problems, live concerts are more popular than ever. Fans are willing to pay high prices for tickets because nothing can replace the excitement of seeing their idols perform on stage. For this reason, many singers now earn most of their income from tours rather than from record sales.";

const ENGLISH_QUESTIONS = [
  q("Mister Lee's band plays instruments made from rubbish.", 'truefalse', TF, 'B', P1),
  q('The band started with a hundred plastic bottles.', 'truefalse', TF, 'A', P1),
  q('The money raised at the concert was given to a recycling centre.', 'truefalse', TF, 'B', P1),
  q("Mister Lee believes that music can help change people's attitudes to the environment.", 'truefalse', TF, 'A', P1),
  q('What do the students use to make the instruments?', 'single', opts(['Rubbish such as bottles and tins', 'New pieces of wood', 'Metal from old cars', 'Glass from broken windows']), 'A', P2),
  q('How much plastic waste did the school produce every week two years ago?', 'single', opts(['about five kilograms', 'about fifty kilograms', 'about one hundred kilograms', 'about five hundred kilograms']), 'C', P2),
  q('What is the band going to do next?', 'single', opts(['Perform abroad', 'Make an album about nature', 'Build a new school', 'Plant trees in the city']), 'B', P2),
  q("What is Mister Lee's main message?", 'single', opts(['Young people should avoid plastic completely.', 'Concerts are the best way to earn money.', 'Music can inspire people to care for the environment.', 'Instruments made from rubbish are better than new ones.']), 'C', P2),
  q('a. In addition, using public transport or bicycles instead of private cars can cut down air pollution significantly.\nb. Although modern life is convenient, it puts a lot of pressure on our environment.\nc. Therefore, every citizen should take simple actions to protect the planet.\nd. For example, factories release smoke and waste, and households produce a huge amount of rubbish every day.\ne. By working together, we can leave a cleaner and greener Earth for future generations.', 'single', opts(['b – d – c – a – e', 'b – c – d – a – e', 'd – b – c – a – e', 'b – d – a – c – e']), 'D', P3),
  q("a. Not exactly. It's a mix of folk melodies and electronic beats, which is why it sounds so fresh.\nb. I'm not sure. Is it a kind of pop music?\nc. Have you ever listened to the new song by that Vietnamese band?\nd. That sounds interesting. I'll download it tonight and tell you what I think.", 'single', opts(['c – a – b – d', 'b – c – a – d', 'c – b – a – d', 'c – b – d – a']), 'C', P3),
  q('Industrial waste can contaminate drinking water.', 'single', opts(['pollute', 'purify', 'store', 'reduce']), 'A', P4),
  q('Her performance was impressive, and everyone applauded.', 'single', opts(['disappointing', 'remarkable', 'successful', 'wonderful']), 'B', P4),
  q('The river is too polluted ______ in.', 'single', opts(['swim', 'swimming', 'to swim', 'swims']), 'C', P5),
  q('We would rather ______ our bicycles than go to school by car.', 'single', opts(['riding', 'to ride', 'ride', 'rode']), 'C', P5),
  q('You should cut down ______ plastic bags to protect the environment.', 'single', opts(['on', 'at', 'of', 'in']), 'A', P5),
  q('Scientists warn people ______ the dangers of global warming.', 'single', opts(['at', 'about', 'for', 'to']), 'B', P5),
  q('Burning too much coal and oil can cause air ______.', 'single', opts(['pollution', 'recycling', 'protection', 'reduction']), 'A', P5),
  q("I can't remember the ______ of this song, but I love its melody.", 'single', opts(['lyrics', 'rhythm', 'composer', 'stage']), 'A', P5),
  q('The concert was a great ______; thousands of fans came to enjoy it.', 'single', opts(['successful', 'succeed', 'success', 'successfully']), 'C', P5),
  q('A lot of money ______ on music festivals in Vietnam every year.', 'single', opts(['spends', 'is spent', 'are spent', 'spend']), 'B', P5),
  q('Look at those dark clouds! The outdoor concert ______.', 'single', opts(['is going to cancel', 'is going to be cancelled', 'going to be cancelled', 'are going to be cancelled']), 'B', P5),
  q('Do you want to listen to pop music, ______ would you prefer jazz?', 'single', opts(['so', 'but', 'or', 'and']), 'C', P5),
  q(`${CLOZE}\n\nChỗ trống (23)`, 'single', opts(['for', 'to', 'at', 'with']), 'B', P6),
  q(`${CLOZE}\n\nChỗ trống (24)`, 'single', opts(['but', 'so', 'or', 'because']), 'B', P6),
  q(`${CLOZE}\n\nChỗ trống (25)`, 'single', opts(['effects', 'cures', 'benefits', 'rewards']), 'A', P6),
  q(`${CLOZE}\n\nChỗ trống (26)`, 'single', opts(['reduce', 'spread', 'receive', 'replace']), 'A', P6),
  q(`${CLOZE}\n\nChỗ trống (27)`, 'single', opts(['clean', 'cleaning', 'cleaner', 'cleanliness']), 'C', P6),
  q(`${READING}\n\nWhat is the best title for the passage?`, 'single', opts(['The Best Streaming Services for Teenagers', 'Why Live Concerts Are Too Expensive', 'The History of Radio and Cassettes', 'How Technology Has Changed the Way We Enjoy Music']), 'D', P7),
  q(`${READING}\n\nWhich of the following is mentioned as a result of the ease of skipping songs?`, 'single', opts(['Artists often make their songs shorter.', 'Albums have become more expensive.', 'Fans have stopped going to concerts.', 'Radio stations have closed.']), 'A', P7),
  q(`${READING}\n\nThe word “their” in paragraph 3 refers to ______.`, 'single', opts(['singers', 'fans', 'tickets', 'concerts']), 'B', P7),
  q(`${READING}\n\nWhich of the following is NOT true according to the passage?`, 'single', opts(['Streaming lets listeners make playlists to suit their moods.', 'Some musicians believe streaming does not pay them enough.', 'Concert tickets are cheaper than they used to be.', 'Many singers earn more from tours than from record sales.']), 'C', P7),
  q(`${READING}\n\nIt can be inferred from the passage that ______.`, 'single', opts(['streaming has completely replaced live music', 'easier access to music has both advantages and disadvantages', 'people no longer enjoy listening to albums', 'traditional music formats are making a comeback']), 'B', P7),
];

const MATH_QUESTIONS = [
  q('Phương trình 2x + 6 = 0 có nghiệm là:', 'single', opts(['x = 3', 'x = -3', 'x = 2', 'x = -2']), 'B', { topic: 'Phương trình', part_title: 'PHẦN 1. TRẮC NGHIỆM', part_instruction: 'Chọn đáp án đúng nhất (A, B, C hoặc D) cho mỗi câu hỏi sau.' }),
  q('Phương trình nào sau đây là phương trình bậc nhất một ẩn?', 'single', opts(['x² + 1 = 0', '0x + 3 = 0', '2x - 5 = 0', '1/x = 2']), 'C', { topic: 'Phương trình' }),
  q('Nghiệm của phương trình 3x - 9 = 0 là x = ______.', 'fill', null, ['3'], { topic: 'Phương trình', part_title: 'PHẦN 2. TỰ LUẬN NGẮN', part_instruction: 'Điền đáp án vào chỗ trống. Có thể nhập số hoặc biểu thức đơn giản.' }),
  q('Giải phương trình 5x + 10 = 0 ta được x = ______.', 'fill', null, ['-2'], { topic: 'Phương trình' }),
  q('Tập nghiệm của phương trình (x - 1)(x + 2) = 0 là:', 'single', opts(['S = {1; -2}', 'S = {-1; 2}', 'S = {1; 2}', 'S = {-1; -2}']), 'A', { topic: 'Phương trình tích' }),
];
const READING_QUESTIONS = [
  q('Choose the word whose underlined part differs in pronunciation: ', 'single', opts(['cats', 'dogs', 'books', 'maps']), 'B', { topic: 'Pronunciation', part_title: 'PART 1. PRONUNCIATION', part_instruction: 'Choose the word whose underlined part is pronounced differently from the others.' }),
  q('She ______ to school every day.', 'single', opts(['go', 'goes', 'going', 'gone']), 'B', { topic: 'Grammar', part_title: 'PART 2. GRAMMAR', part_instruction: 'Choose the best answer to complete each sentence.' }),
  q('I am interested ______ learning English.', 'single', opts(['on', 'in', 'at', 'for']), 'B', { topic: 'Grammar' }),
  q('Write 2–3 sentences about your favourite subject and why you like it.', 'essay', null, null, { topic: 'Writing', part_title: 'PART 3. WRITING', part_instruction: 'Write a short paragraph (2–3 sentences). Your teacher will review your answer.' }),
];
const GEO_QUESTIONS = [
  q('Châu Á là châu lục có diện tích như thế nào?', 'single', opts(['Lớn nhất thế giới', 'Nhỏ nhất thế giới', 'Thứ hai thế giới', 'Thứ ba thế giới']), 'A', { topic: 'Châu Á', part_title: 'PHẦN 1. TRẮC NGHIỆM', part_instruction: 'Chọn đáp án đúng nhất về vị trí và đặc điểm châu Á.' }),
  q('Đỉnh núi cao nhất thế giới nằm ở châu lục nào?', 'single', opts(['Châu Âu', 'Châu Á', 'Châu Mĩ', 'Châu Phi']), 'B', { topic: 'Châu Á' }),
  q('Việt Nam nằm trong khu vực nào của châu Á?', 'single', opts(['Đông Á', 'Nam Á', 'Đông Nam Á', 'Tây Á']), 'C', { topic: 'Châu Á' }),
];

const SCIENCE_QUESTIONS = {
  physics: [
    q('Một vật chuyển động thẳng đều đi được 120 m trong 30 s. Tốc độ của vật là:', 'single', opts(['3 m/s', '4 m/s', '6 m/s', '8 m/s']), 'B', { topic: 'Chuyển động', part_title: 'PHẦN 1. CƠ HỌC', part_instruction: 'Chọn đáp án đúng và ghi rõ đơn vị khi cần.' }),
    q('Đơn vị đo lực trong hệ SI là:', 'single', opts(['Jun', 'Oát', 'Niutơn', 'Pascal']), 'C', { topic: 'Lực' }),
    q('Khi tăng độ cao, trọng lượng của một vật thay đổi như thế nào?', 'single', opts(['Luôn tăng', 'Giảm nhẹ', 'Không đổi tuyệt đối', 'Bằng 0 ngay lập tức']), 'B', { topic: 'Trọng lực' }),
    q('Công thức tính công cơ học khi lực cùng hướng chuyển động là:', 'single', opts(['A = F/s', 'A = F.s', 'A = m/F', 'A = s/F']), 'B', { topic: 'Công cơ học' }),
  ],
  chemistry: [
    q('Kí hiệu hóa học của nguyên tố oxi là:', 'single', opts(['O', 'Ox', 'O2', 'Os']), 'A', { topic: 'Nguyên tố hóa học', part_title: 'PHẦN 1. HÓA VÔ CƠ', part_instruction: 'Chọn một đáp án đúng cho mỗi câu.' }),
    q('pH của dung dịch trung tính ở 25°C là:', 'single', opts(['0', '1', '7', '14']), 'C', { topic: 'Axit–bazơ' }),
    q('Chất nào sau đây là oxit axit?', 'single', opts(['CO2', 'CaO', 'Na2O', 'FeO']), 'A', { topic: 'Oxit' }),
    q('Tổng hệ số tối giản khi cân bằng H2 + O2 → H2O là:', 'single', opts(['3', '4', '5', '6']), 'C', { topic: 'Phương trình hóa học', explanation: '2H2 + O2 → 2H2O có tổng hệ số 2 + 1 + 2 = 5.' }),
  ],
  biology: [
    q('Bào quan được xem là “nhà máy năng lượng” của tế bào là:', 'single', opts(['Ribôxôm', 'Ti thể', 'Lục lạp', 'Không bào']), 'B', { topic: 'Tế bào', part_title: 'PHẦN 1. SINH HỌC TẾ BÀO', part_instruction: 'Chọn đáp án đúng nhất.' }),
    q('Quá trình quang hợp chủ yếu diễn ra tại:', 'single', opts(['Nhân tế bào', 'Màng tế bào', 'Lục lạp', 'Ti thể']), 'C', { topic: 'Quang hợp' }),
    q('Đơn phân cấu tạo nên prôtêin là:', 'single', opts(['Axit amin', 'Glucôzơ', 'Nuclêôtit', 'Axit béo']), 'A', { topic: 'Đại phân tử' }),
    q('Mạch bổ sung với đoạn ADN 5’-ATGC-3’ theo nguyên tắc bổ sung là:', 'single', opts(['3’-TACG-5’', '3’-AUGC-5’', '5’-TACG-3’', '3’-ATGC-5’']), 'A', { topic: 'Di truyền phân tử' }),
  ],
  history: [
    q('Chiến thắng Điện Biên Phủ diễn ra vào năm nào?', 'single', opts(['1945', '1954', '1968', '1975']), 'B', { topic: 'Lịch sử Việt Nam', part_title: 'PHẦN 1. VIỆT NAM 1945–1975', part_instruction: 'Chọn đáp án đúng dựa trên mốc lịch sử và sự kiện.' }),
    q('Bản Tuyên ngôn Độc lập được Chủ tịch Hồ Chí Minh đọc tại quảng trường nào?', 'single', opts(['Ba Đình', 'Nghĩa Lộ', 'Pác Bó', 'Tân Trào']), 'A', { topic: 'Cách mạng tháng Tám' }),
    q('Hiệp định Giơnevơ về Đông Dương được kí kết vào năm:', 'single', opts(['1946', '1954', '1963', '1973']), 'B', { topic: 'Chiến tranh Đông Dương' }),
    q('Ngày 30/4/1975 gắn với sự kiện lịch sử nào?', 'single', opts(['Thành lập Đảng', 'Giải phóng hoàn toàn miền Nam', 'Ký Hiệp định Paris', 'Tổng tuyển cử đầu tiên']), 'B', { topic: 'Thống nhất đất nước' }),
  ],
  literature: [
    q('Tác phẩm “Chiếc lược ngà” gắn với nhân vật nào?', 'single', opts(['Chí Phèo', 'Ông Sáu', 'Lão Hạc', 'Anh thanh niên']), 'B', { topic: 'Văn học hiện thực', part_title: 'PHẦN 1. VĂN HỌC VIỆT NAM', part_instruction: 'Đọc kĩ yêu cầu và chọn đáp án đúng.' }),
    q('Thể thơ chính của bài “Sang thu” là:', 'single', opts(['Lục bát', 'Thất ngôn bát cú', 'Song thất lục bát', 'Tự do']), 'B', { topic: 'Thơ Đường luật' }),
    q('Biện pháp tu từ trong câu “Dải lụa đào ướt át” là:', 'single', opts(['So sánh', 'Nhân hóa', 'Hoán dụ', 'Ẩn dụ']), 'D', { topic: 'Tu từ', explanation: '“Dải lụa đào” là hình ảnh ẩn dụ chỉ dải hoa đào mềm mại, rực rỡ.' }),
    q('Viết một đoạn văn khoảng 150 chữ trình bày suy nghĩ về trách nhiệm của thế hệ trẻ với cộng đồng.', 'essay', null, null, { topic: 'Nghị luận xã hội', part_title: 'PHẦN 2. TỰ LUẬN', part_instruction: 'Bài làm có mở đoạn, thân đoạn, kết đoạn; dẫn chứng phù hợp và lập luận rõ ràng.' }),
  ],
  informatics: [
    q('Thiết bị nào sau đây là thiết bị đầu vào?', 'single', opts(['Máy in', 'Màn hình', 'Bàn phím', 'Loa']), 'C', { topic: 'Phần cứng', part_title: 'PHẦN 1. TIN HỌC CƠ BẢN', part_instruction: 'Chọn đáp án đúng nhất.' }),
    q('Hệ nhị phân sử dụng hai chữ số nào?', 'single', opts(['0 và 1', '1 và 2', '0 và 9', 'A và B']), 'A', { topic: 'Hệ đếm' }),
    q('Trong Python, câu lệnh nào dùng để in nội dung ra màn hình?', 'single', opts(['input()', 'print()', 'len()', 'type()']), 'B', { topic: 'Lập trình Python' }),
    q('Thuật toán sắp xếp nào liên tục đổi chỗ hai phần tử kề nhau nếu sai thứ tự?', 'single', opts(['Nổi bọt', 'Tìm kiếm nhị phân', 'Đệ quy', 'Tham lam']), 'A', { topic: 'Thuật toán' }),
  ],
  geography: GEO_QUESTIONS,
};

const EXAMS = [
  { id: E(6), title: 'Kiểm tra giữa kì Tiếng Anh 10', description: 'Bài kiểm tra tổng hợp nghe hiểu, sắp xếp câu, từ vựng, ngữ pháp, điền khuyết và đọc hiểu.', subject: 'Tiếng Anh', grade: 'Lớp 10', duration_minutes: 45, status: 'published', difficulty: 'medium', owner_id: U(2), visibility: 'restricted', mode: 'test', max_attempts: 1, anti_cheat: true, max_violations: 3, questions: ENGLISH_QUESTIONS, classes: [C(1), C(2)] },
  { id: E(1), title: 'Phương trình bậc nhất một ẩn', description: 'Luyện tập phương trình bậc nhất, phương trình tích và cách giải.', subject: 'Toán học', grade: 'Lớp 8', duration_minutes: 20, status: 'published', difficulty: 'easy', owner_id: U(2), visibility: 'public', questions: MATH_QUESTIONS, classes: [] },
  { id: E(3), title: 'English Reading & Writing', description: 'Rèn luyện phát âm, ngữ pháp và viết đoạn ngắn theo chủ đề quen thuộc.', subject: 'Tiếng Anh', grade: 'Lớp 7', duration_minutes: 25, status: 'published', difficulty: 'medium', owner_id: U(1), visibility: 'public', questions: READING_QUESTIONS, classes: [] },
  { id: E(5), title: 'Địa lý: Thiên nhiên châu Á', description: 'Ôn tập vị trí, địa hình và các khu vực địa lý của châu Á.', subject: 'Địa lý', grade: 'Lớp 8', duration_minutes: 15, status: 'published', difficulty: 'easy', owner_id: U(2), visibility: 'public', questions: SCIENCE_QUESTIONS.geography, classes: [] },
  { id: E(7), title: 'Vật lý: Chuyển động và cơ năng', description: 'Bài luyện tập vận dụng công thức tốc độ, lực và công cơ học.', subject: 'Vật lý', grade: 'Lớp 10', duration_minutes: 20, status: 'published', difficulty: 'medium', owner_id: U(2), visibility: 'public', questions: SCIENCE_QUESTIONS.physics, classes: [] },
  { id: E(8), title: 'Hóa học: Chất và phản ứng', description: 'Củng cố nguyên tố, oxit, pH và cân bằng phương trình hóa học.', subject: 'Hóa học', grade: 'Lớp 10', duration_minutes: 20, status: 'published', difficulty: 'medium', owner_id: U(2), visibility: 'public', questions: SCIENCE_QUESTIONS.chemistry, classes: [] },
  { id: E(9), title: 'Sinh học: Tế bào và di truyền', description: 'Ôn tập cấu trúc tế bào, quang hợp, prôtêin và nguyên tắc bổ sung.', subject: 'Sinh học', grade: 'Lớp 10', duration_minutes: 20, status: 'published', difficulty: 'medium', owner_id: U(2), visibility: 'public', questions: SCIENCE_QUESTIONS.biology, classes: [] },
  { id: E(10), title: 'Lịch sử: Việt Nam 1945–1975', description: 'Hệ thống các mốc và sự kiện trọng tâm trong giai đoạn xây dựng, bảo vệ và thống nhất đất nước.', subject: 'Lịch sử', grade: 'Lớp 12', duration_minutes: 20, status: 'published', difficulty: 'medium', owner_id: U(2), visibility: 'public', questions: SCIENCE_QUESTIONS.history, classes: [] },
  { id: E(11), title: 'Ngữ văn: Đọc hiểu và nghị luận', description: 'Kết hợp kiến thức văn học với bài viết nghị luận xã hội có giáo viên đánh giá.', subject: 'Ngữ văn', grade: 'Lớp 9', duration_minutes: 35, status: 'published', difficulty: 'medium', owner_id: U(2), visibility: 'public', questions: SCIENCE_QUESTIONS.literature, classes: [] },
  { id: E(12), title: 'Tin học: Dữ liệu và thuật toán', description: 'Luyện tập phần cứng, hệ nhị phân, Python và tư duy thuật toán.', subject: 'Tin học', grade: 'Lớp 10', duration_minutes: 20, status: 'published', difficulty: 'easy', owner_id: U(2), visibility: 'public', questions: SCIENCE_QUESTIONS.informatics, classes: [] },
];

const ACHIEVEMENTS = [
  { id: A(1), title: 'Khởi động', description: 'Đạt 50 XP đầu tiên.', icon: 'zap', xp_threshold: 50 },
  { id: A(2), title: 'Chăm chỉ', description: 'Đạt 100 XP.', icon: 'flame', xp_threshold: 100 },
  { id: A(3), title: 'Học giả', description: 'Đạt 200 XP.', icon: 'book-open', xp_threshold: 200 },
  { id: A(4), title: 'Bậc thầy', description: 'Đạt 500 XP.', icon: 'trophy', xp_threshold: 500 },
];

const COMMENTS = [
  { id: CM(1), exam_id: E(1), user_id: U(5), content: 'Câu phương trình tích hay quá, mình nhớ mãi nghiệm là {1; -2}. Cảm ơn cô!' },
  { id: CM(2), exam_id: E(1), user_id: U(4), content: 'Ai giải thích giúp mình vì sao 0x + 3 = 0 không phải phương trình bậc nhất không?' },
  { id: CM(3), exam_id: E(1), user_id: U(2), content: 'Vì hệ số a = 0 nên không còn là bậc nhất một ẩn nữa nhé. Đề này luyện rất chắc phần đó.' },
  { id: CM(4), exam_id: E(3), user_id: U(7), content: 'Phần writing gợi mở hay, mình viết được 3 câu về môn Toán rồi.' },
  { id: CM(5), exam_id: E(3), user_id: U(3), content: 'Câu phát âm "dogs" khác các từ còn lại ở đuôi /z/, dễ nhầm lắm mọi người lưu ý nhé.' },
];

let seedPromise = null;
export function ensureSeed(db, options = {}) {
  if (!seedPromise) seedPromise = runSeed(db, options).catch((e) => { seedPromise = null; throw e; });
  return seedPromise;
}
async function put(db, table, row, conflict) {
  rows(await db.from(table).insertIfAbsent(row, { onConflict: conflict }).select('*'));
}
async function runSeed(db, { demoAccounts = false } = {}) {
  const existing = rows(await db.from('users').select('id').eq('id', U(1)).limit(1));
  if (existing.length) return; // already seeded
  const now = new Date().toISOString();
  for (const u of USERS) {
    await put(db, 'users', { id: u.id, name: u.name, email: u.email, password_salt: u.pw.salt, password_hash: u.pw.hash, password_iterations: u.pw.iterations, role: u.role, teacher_id: u.teacher_id, active: demoAccounts, xp: u.xp, streak: u.streak, created_at: now }, 'id');
  }
  for (const c of CLASSES) await put(db, 'classes', { ...c, archived: false, created_at: now }, 'id');
  for (const [class_id, student_id] of MEMBERS) await put(db, 'class_members', { membership_key: `${class_id}:${student_id}`, class_id, student_id, active: true, added_at: now }, 'membership_key');
  for (const a of ACHIEVEMENTS) await put(db, 'achievements', a, 'id');
  let qn = 0;
  for (const ex of EXAMS) {
    const total = ex.questions.reduce((s, x) => s + (x.points || 1), 0);
    await put(db, 'exams', { id: ex.id, title: ex.title, description: ex.description, subject: ex.subject, grade: ex.grade, duration_minutes: ex.duration_minutes, status: ex.status, difficulty: ex.difficulty, owner_id: ex.owner_id, visibility: ex.visibility, mode: ex.mode ?? 'practice', max_attempts: ex.max_attempts ?? 0, anti_cheat: ex.anti_cheat === true, max_violations: ex.max_violations ?? 3, audio_object_path: null, total_points: total, created_at: now, updated_at: now }, 'id');
    for (const class_id of ex.classes) await put(db, 'exam_classes', { exam_class_key: `${ex.id}:${class_id}`, exam_id: ex.id, class_id, active: true }, 'exam_class_key');
    let order = 0;
    for (const question of ex.questions) {
      order += 1; qn += 1;
      await put(db, 'questions', {
        id: Q(qn), exam_id: ex.id, content: question.content, type: question.type,
        options: question.options, correct_answer: question.correct_answer, explanation: question.explanation || '',
        points: question.points || 1, topic: question.topic || '', part_title: question.part_title || '', part_instruction: question.part_instruction || '',
        order_index: order, active: true, audio_object_path: null, image_url: null, image_object_path: null,
      }, 'id');
    }
  }
  let ci = 0;
  if (demoAccounts) for (const cm of COMMENTS) {
    ci += 1;
    await put(db, 'comments', { ...cm, active: true, created_at: new Date(Date.now() - ci * 3600 * 1000).toISOString() }, 'id');
  }
}