# TODO: Swap stories user (aka email) for user_id
DROP TABLE IF EXISTS stories;
CREATE TABLE stories (
  id          VARCHAR(255)  NOT NULL,
  data        TEXT          NOT NULL,
  type        VARCHAR(255)            DEFAULT NULL,
  user        VARCHAR(255)            DEFAULT NULL,
  created_at  TIMESTAMP     NOT NULL  DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id, user),
  KEY index_stories_on_user (user),
  KEY index_stories_on_type (type),
  KEY index_stories_on_created_at (created_at)
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
  created_at  DATETIME      NOT NULL,

  PRIMARY KEY (url, user_id)
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
