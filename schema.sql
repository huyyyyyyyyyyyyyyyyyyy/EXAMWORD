CREATE TABLE app.users (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  password_iterations integer NOT NULL,
  role text NOT NULL,
  teacher_id uuid,
  active boolean NOT NULL,
  xp integer NOT NULL,
  streak integer NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE app.sessions (
  token_digest text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE app.auth_limiter (
  key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL
);

CREATE TABLE app.password_reset_tokens (
  token_digest text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE app.classes (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  teacher_id uuid NOT NULL,
  archived boolean NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE app.class_members (
  membership_key text PRIMARY KEY,
  class_id uuid NOT NULL,
  student_id uuid NOT NULL,
  active boolean NOT NULL,
  added_at timestamptz NOT NULL
);

CREATE TABLE app.exams (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  subject text NOT NULL,
  grade text NOT NULL,
  duration_minutes integer NOT NULL,
  status text NOT NULL,
  difficulty text NOT NULL,
  owner_id uuid NOT NULL,
  visibility text NOT NULL,
  mode text NOT NULL,
  max_attempts integer NOT NULL,
  anti_cheat boolean NOT NULL,
  max_violations integer NOT NULL,
  audio_object_path text,
  total_points integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE app.exam_classes (
  exam_class_key text PRIMARY KEY,
  exam_id uuid NOT NULL,
  class_id uuid NOT NULL,
  active boolean NOT NULL
);

CREATE TABLE app.questions (
  id uuid PRIMARY KEY,
  exam_id uuid NOT NULL,
  content text NOT NULL,
  type text NOT NULL,
  options jsonb,
  correct_answer jsonb,
  explanation text NOT NULL,
  points integer NOT NULL,
  topic text NOT NULL,
  part_title text NOT NULL,
  part_instruction text NOT NULL,
  order_index integer NOT NULL,
  active boolean NOT NULL,
  audio_object_path text,
  image_url text,
  image_object_path text
);

CREATE TABLE app.attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  exam_id uuid NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  score integer NOT NULL,
  max_score integer NOT NULL,
  percentage integer NOT NULL,
  time_spent integer NOT NULL,
  correct_count integer NOT NULL,
  incorrect_count integer NOT NULL,
  unanswered integer NOT NULL,
  violations integer NOT NULL,
  violation_log jsonb NOT NULL
);

CREATE TABLE app.answers (
  answer_key text PRIMARY KEY,
  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  value jsonb,
  flagged boolean NOT NULL,
  is_correct boolean,
  points_awarded integer NOT NULL
);

CREATE TABLE app.achievements (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  xp_threshold integer NOT NULL
);

CREATE TABLE app.user_achievements (
  user_achievement_key text PRIMARY KEY,
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL,
  unlocked_at timestamptz NOT NULL
);

CREATE TABLE app.comments (
  id uuid PRIMARY KEY,
  exam_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  active boolean NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX classes_teacher_idx ON app.classes (teacher_id);
CREATE INDEX class_members_student_idx ON app.class_members (student_id);
CREATE INDEX exams_owner_idx ON app.exams (owner_id, status);
CREATE INDEX exam_classes_class_idx ON app.exam_classes (class_id);
CREATE INDEX questions_exam_idx ON app.questions (exam_id, order_index);
CREATE INDEX attempts_user_idx ON app.attempts (user_id, started_at);
CREATE INDEX attempts_exam_idx ON app.attempts (exam_id);
CREATE INDEX answers_attempt_idx ON app.answers (attempt_id);
CREATE INDEX users_teacher_idx ON app.users (teacher_id);
CREATE INDEX comments_exam_idx ON app.comments (exam_id, created_at);

CREATE TABLE app.threads (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  title text NOT NULL,
  lookup_key text UNIQUE,
  class_id uuid,
  live_id uuid,
  created_by uuid NOT NULL,
  active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE app.thread_members (
  member_key text PRIMARY KEY,
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL,
  last_read_at timestamptz NOT NULL,
  active boolean NOT NULL
);

CREATE TABLE app.messages (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  active boolean NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE app.notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  link text NOT NULL,
  read_at timestamptz,
  active boolean NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE app.tutor_profiles (
  user_id uuid PRIMARY KEY,
  subjects jsonb NOT NULL,
  bio text NOT NULL,
  hourly_price integer NOT NULL,
  available boolean NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE app.tutor_requests (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL,
  teacher_id uuid,
  subject text NOT NULL,
  question text NOT NULL,
  status text NOT NULL,
  thread_id uuid,
  created_at timestamptz NOT NULL,
  accepted_at timestamptz,
  closed_at timestamptz
);

CREATE TABLE app.live_rooms (
  id uuid PRIMARY KEY,
  teacher_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  subject text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  status text NOT NULL,
  stream_url text,
  course_id uuid,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE app.live_registrations (
  registration_key text PRIMARY KEY,
  live_id uuid NOT NULL,
  student_id uuid NOT NULL,
  active boolean NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE app.courses (
  id uuid PRIMARY KEY,
  teacher_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  content text NOT NULL,
  subject text NOT NULL,
  grade text NOT NULL,
  price integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE app.course_orders (
  id uuid PRIMARY KEY,
  order_key text NOT NULL UNIQUE,
  course_id uuid NOT NULL,
  student_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  gross_amount integer NOT NULL,
  platform_fee integer NOT NULL,
  teacher_amount integer NOT NULL,
  reference text NOT NULL UNIQUE,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  paid_at timestamptz,
  payout_status text NOT NULL,
  payout_at timestamptz,
  payout_reference text NOT NULL
);

CREATE TABLE app.payment_events (
  id uuid PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  transaction_id text NOT NULL UNIQUE,
  order_id uuid NOT NULL,
  reference text NOT NULL,
  amount integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE app.teacher_bank_accounts (
  user_id uuid PRIMARY KEY,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE app.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX threads_member_updated_idx ON app.threads (updated_at);
CREATE INDEX thread_members_user_idx ON app.thread_members (user_id, active);
CREATE INDEX messages_thread_idx ON app.messages (thread_id, created_at);
CREATE INDEX notifications_user_idx ON app.notifications (user_id, created_at);
CREATE INDEX tutor_requests_student_idx ON app.tutor_requests (student_id, created_at);
CREATE INDEX tutor_requests_teacher_idx ON app.tutor_requests (teacher_id, status);
CREATE INDEX live_rooms_teacher_idx ON app.live_rooms (teacher_id, scheduled_at);
CREATE INDEX live_registrations_student_idx ON app.live_registrations (student_id, active);
CREATE INDEX courses_teacher_idx ON app.courses (teacher_id, status);
CREATE INDEX course_orders_student_idx ON app.course_orders (student_id, created_at);
CREATE INDEX course_orders_teacher_idx ON app.course_orders (teacher_id, status);
CREATE INDEX payment_events_order_idx ON app.payment_events (order_id, created_at);

CREATE TABLE app.teacher_follows (
  follow_key text PRIMARY KEY,
  teacher_id uuid NOT NULL,
  student_id uuid NOT NULL,
  active boolean NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX teacher_follows_teacher_idx ON app.teacher_follows (teacher_id, active);
CREATE INDEX teacher_follows_student_idx ON app.teacher_follows (student_id, active);

CREATE TABLE app.live_signals (
  id uuid PRIMARY KEY,
  live_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE INDEX live_signals_recipient_idx ON app.live_signals (recipient_id, live_id, created_at);
