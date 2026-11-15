export function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function formatDuration(seconds = 0) {
  const minutes = Math.floor(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút` : `${minutes} phút`
}

export function timeAgo(value?: string | null) {
  if (!value) return ''
  const diff = Math.max(0, Date.now() - new Date(value).getTime())
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Vừa xong'
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ngày trước`
  return formatDate(value)
}

export const subjectMeta: Record<string, { color: string; soft: string; short: string }> = {
  'Tiếng Anh': { color: '#8171E8', soft: '#EEEAFE', short: 'EN' },
  'Toán học': { color: '#67A9ED', soft: '#E9F3FE', short: 'M' },
  'Vật lý': { color: '#F09B62', soft: '#FFF0E5', short: 'P' },
  'Hóa học': { color: '#47C99A', soft: '#E6F8F2', short: 'C' },
  'Sinh học': { color: '#65B77A', soft: '#EBF7ED', short: 'B' },
  'Lịch sử': { color: '#D68B65', soft: '#FAEFE8', short: 'H' },
  'Địa lý': { color: '#4FBCC9', soft: '#E7F7F9', short: 'G' },
  'Ngữ văn': { color: '#D879A1', soft: '#FBEAF1', short: 'L' },
  'Tin học': { color: '#6484D8', soft: '#EAF0FC', short: 'IT' },
}

export const getSubjectMeta = (subject: string) => subjectMeta[subject] || { color: '#8171E8', soft: '#EEEAFE', short: subject.slice(0, 2).toUpperCase() }

const errorMessages: Record<string, string> = {
  email_taken: 'Email này đã được sử dụng.',
  invalid_email: 'Email không hợp lệ.',
  invalid_password: 'Mật khẩu cần tối thiểu 8 ký tự.',
  invalid_name: 'Vui lòng nhập tên hợp lệ.',
  invalid_input: 'Dữ liệu nhập vào chưa hợp lệ.',
  rate_limited: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau giây lát.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  not_found: 'Không tìm thấy dữ liệu.',
  login_required: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  exam_has_attempts: 'Đề đã có lượt làm bài nên không thể sửa câu hỏi.',
  questions_required: 'Đề thi cần có ít nhất một câu hỏi.',
  service_unavailable: 'Máy chủ đang bận. Vui lòng thử lại.',
  comments_unavailable: 'Bình luận chỉ mở với đề thi công khai đã xuất bản.',
  invalid_comment: 'Nội dung bình luận không được để trống.',
  comment_rate_limited: 'Bạn bình luận quá nhanh. Vui lòng chờ vài giây.',
  attempt_limit_reached: 'Bạn đã sử dụng hết số lượt làm bài của đề này.',
  audio_english_only: 'Chỉ đề Tiếng Anh mới hỗ trợ tải lên bài nghe.',
  invalid_upload: 'Tệp tải lên không hợp lệ hoặc vượt quá dung lượng cho phép.',
  upload_pending: 'Tệp đang được xử lý. Vui lòng chờ trong giây lát.',
  cannot_moderate_self: 'Bạn không thể tự xử lý tài khoản của chính mình.',
  invalid_message: 'Tin nhắn không được để trống.',
  invalid_recipient: 'Người nhận không hợp lệ.',
  conversation_closed: 'Cuộc trò chuyện đã đóng.',
  invalid_profile: 'Vui lòng nhập môn hỗ trợ và giới thiệu kinh nghiệm.',
  tutor_profile_required: 'Bạn cần tạo và bật hồ sơ gia sư trước khi nhận yêu cầu.',
  tutor_unavailable: 'Gia sư này hiện không nhận yêu cầu mới.',
  request_unavailable: 'Yêu cầu đã được nhận hoặc không còn khả dụng.',
  invalid_course: 'Vui lòng nhập đủ thông tin và nội dung khóa học.',
  invalid_price: 'Mức giá không hợp lệ.',
  invalid_live: 'Vui lòng kiểm tra chủ đề và lịch phát.',
  invalid_stream_url: 'Liên kết phát phải dùng HTTPS và không chứa thông tin đăng nhập.',
  stream_url_required: 'Cần thêm liên kết phát HTTPS trước khi bắt đầu.',
  course_payment_required: 'Bạn cần thanh toán khóa học trước khi đăng ký buổi live này.',
  course_unavailable: 'Khóa học hiện chưa mở đăng ký.',
  invalid_bank_account: 'Kiểm tra tên ngân hàng, số tài khoản 6–25 chữ số và họ tên chủ tài khoản.',
  teacher_bank_required: 'Bạn cần khai báo ngân hàng (tên ngân hàng, họ tên chủ tài khoản, số tài khoản) trong mục Đơn & doanh thu trước khi bán khóa học có phí.',
  invalid_announcement: 'Vui lòng nhập tiêu đề và nội dung thông báo.',
  payout_reference_required: 'Vui lòng nhập mã giao dịch chi cho giáo viên.',
  invalid_order_state: 'Trạng thái đơn đã thay đổi. Vui lòng tải lại trang.',
  attempt_closed: 'Bài làm đã được nộp và không thể thay đổi.',
  attempt_expired: 'Bài làm đã hết thời gian quy định.',
}

export function friendlyError(reason: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.') {
  const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
  return errorMessages[message] || message || fallback
}
