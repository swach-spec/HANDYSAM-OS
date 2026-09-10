create extension if not exists "pgcrypto";

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  description text,
  status text default 'active',
  created_at timestamptz default now()
);
create unique index if not exists businesses_name_key on businesses(name);

insert into businesses (name, type, description) values
('Personal','personal','Personal life, habits, diary, health and finance'),
('Meide Holding','holding','Strategic holding company layer'),
('HandySam','business','Fabrication, medical gas installations and engineering services'),
('Tavira','business','Herbal skincare tea brand'),
('Kenya Plate','business','Grocery store, meal planning and food commerce'),
('STEM School','education','Weekend and holiday technical skills school')
on conflict (name) do nothing;

create table if not exists profiles (
  id uuid primary key,
  full_name text,
  role text default 'admin',
  phone text,
  created_at timestamptz default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  transaction_date date not null default current_date,
  type text not null check (type in ('income','expense')),
  category text not null,
  amount numeric(12,2) not null,
  payment_method text,
  paid_by text,
  paid_to text,
  description text,
  receipt_url text,
  created_at timestamptz default now()
);

create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  debt_type text not null check (debt_type in ('i_owe','owed_to_me')),
  person_or_company text not null,
  original_amount numeric(12,2) not null,
  amount_paid numeric(12,2) default 0,
  balance numeric(12,2) generated always as (original_amount - amount_paid) stored,
  due_date date,
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  status text default 'active' check (status in ('active','partially_paid','cleared','overdue')),
  notes text,
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  title text not null,
  description text,
  status text default 'todo' check (status in ('backlog','todo','in_progress','waiting','done')),
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  due_date date,
  reminder_time timestamptz,
  created_at timestamptz default now()
);

create table if not exists diary_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  business_id uuid references businesses(id) on delete set null,
  morning_reflection text,
  evening_reflection text,
  energy_score int check (energy_score between 1 and 10),
  focus_score int check (focus_score between 1 and 10),
  discipline_score int check (discipline_score between 1 and 10),
  mood_score int check (mood_score between 1 and 10),
  lesson_learned text,
  tomorrow_plan text,
  created_at timestamptz default now()
);

create table if not exists coach_conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  user_message text not null,
  coach_response text,
  extracted_intent text,
  extracted_data jsonb,
  saved_as_record boolean default false,
  created_at timestamptz default now()
);
