-- @@ -3,7 +3,10 @@ CREATE TABLE stories (
--    id           VARCHAR(255)  NOT NULL,
--    data         TEXT          NOT NULL,
--    user_id      INT           NOT NULL,
-- +  seen_at      DATETIME      NULL,
-- +  durable      BOOLEAN                 DEFAULT 0,
--    created_at   TIMESTAMP     NOT NULL  DEFAULT CURRENT_TIMESTAMP,


ALTER TABLE stories
  ADD COLUMN `seen_at` DATETIME NULL,
  ADD COLUMN `durable` BOOLEAN DEFAULT 0,
  ADD INDEX (durable),
  ADD INDEX (seen_at);
