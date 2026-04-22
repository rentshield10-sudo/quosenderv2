CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  price TEXT,
  bedrooms TEXT,
  contact_phone TEXT,
  default_schedule TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed Starter Templates
INSERT OR IGNORE INTO templates (id, name, body) VALUES
('tmpl-1', 'Template 1 (Initial Outreach)', 'Hi, my name is Moses and we are reaching out to you because you requested information in our {{bedrooms}} apartment in Bloomfield. Please let me know if you would like to schedule a showing appointment. The address is {{address}}. And the price is {{price}}.'),
('tmpl-2', 'Template 2 (Schedule Invitation)', 'We are able to show the unit {{schedule}} at {{address}}, will you join?'),
('tmpl-3', 'Template 3 (Appointment Confirmation)', 'Great! Your appointment is set for {{schedule}}. The address is {{address}}. Please call this number {{contactPhone}} if you do not see anyone in the front.'),
('tmpl-4', 'Template 4 (Day-of Confirmation)', 'Hi! We are reaching out to you to confirm your appointment to view our {{bedrooms}} apartment today at {{time}}. The address is {{address}}. Please let me know if you will be there at {{time}}. Thank you.'),
('tmpl-5', 'Template 5 (Re-engagement)', 'Hi, we just wanted to know if you are still interested in booking a showing for our {{bedrooms}} house for rent in {{address}}. If so, please let me know so we can schedule a showing appointment.'),
('tmpl-6', 'Template 6 (Requirements)', 'Hi!

These are the requirements.

1.5 Month Security
1 Month Rent - Prior to moving in
No Evictions in the past 7 years
Income Requirement is 2.5 the rent
Pet fee $50 dollars on top of rent (under 15 pounds)
Rent is {{price}}.

Please confirm that all requirements are met so we can set up the appointment. Thank you.');

-- Seed Starter Property
INSERT OR IGNORE INTO properties (id, name, address, price, bedrooms, contact_phone, default_schedule) VALUES
('prop-1', '39 Dewey St FLOOR 2', '39 Dewey St FLOOR 2, Bloomfield, NJ 07003', '$2,500/mo', '3-bedroom', '201-231-7775', 'tomorrow Wednesday 5:30PM');
