ALTER TABLE intake_submissions ADD COLUMN alert_sent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE intake_submissions ADD COLUMN alert_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE intake_submissions ADD COLUMN alert_after INTEGER NOT NULL DEFAULT 0;
