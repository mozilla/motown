DROP TABLE IF EXISTS stories;
CREATE TABLE stories (
  id           VARCHAR(255)  NOT NULL,
  data         TEXT          NOT NULL,
  user_id      INT           NOT NULL,
  published_at DATETIME     NOT NULL,
  created_at   TIMESTAMP     NOT NULL  DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id, user_id),
  KEY index_stories_on_user_id    (user_id),
  KEY index_stories_on_published_at (published_at)
  ) ENGINE=InnoDB;

DROP TABLE IF EXISTS networks;
CREATE TABLE networks (
  channel         VARCHAR(255)  NOT NULL,
  user_id         INT           NOT NULL,
  status          VARCHAR(255)  NULL,
  bot_update_id   CHAR(36)      NULL,

  PRIMARY KEY (channel, user_id),
  KEY index_networks_on_bot_update_id (bot_update_id)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS feeds;
CREATE TABLE feeds (
  url         VARCHAR(255)  NOT NULL,
  user_id     INT           NOT NULL,
  title       VARCHAR(255)  NULL,
  verified    BOOLEAN               DEFAULT 0,
  type        VARCHAR(255)  NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (url, user_id)
  KEY index_feeds_on_url (url)
  KEY index_feeds_on_verified (verified);
) ENGINE=InnoDB;

DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id          INT           NOT NULL AUTO_INCREMENT,
  email       VARCHAR(255)  NOT NULL,
  nick        VARCHAR(255)  NULL,
  real_name   VARCHAR(255)  NULL,


  created_at  DATETIME      NOT NULL,
  updated_at  DATETIME      NOT NULL,


  PRIMARY KEY (id),
  KEY index_userss_on_created_at (created_at)
) ENGINE=InnoDB;
