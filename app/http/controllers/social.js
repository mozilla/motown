/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const
config = require('../../../lib/configuration'),
mysql  = require('mysql').createClient(config.get('mysql')),
redis  = require('../../../lib/redis').pub,
logger = require('../../../lib/logger');

/*
 * GET home page.
 */
exports.sidebar = function(req, res){
  res.render('social/sidebar', { user: req.user, layout: false });
};

exports.worker = function(req, res){
  res.header('Content-Type', 'application/javascript');
  res.render('social/worker.js.ejs', { user: req.user, baseUrl: config.get("public_url"), wsUrl: config.get("public_ws_url"), layout: false });
};

exports.manifest = function(req, res){
  res.header('Content-Type', 'application/javascript');
  res.render('social/manifest.json.ejs', { baseUrl: config.get("public_url"), providerSuffix: config.get("social_provider")['name_suffix'], layout: false });
};

exports.mentions = function(req, res){
  mysql.query('SELECT * FROM stories WHERE user_id = ? AND durable = ? ORDER BY seen_at, published_at limit 200', [req.user.id, true], function(err, rows){
    if (err){
      logger.error('Erorr getting stories');
    }
    var mentions = [];
    for (var i in rows){
      var story = JSON.parse(rows[i].data);
      story.seen_at = rows[i].seen_at;
      mentions.push(story);
    }
    res.render('social/mentions', {user: req.user, mentions: mentions, layout: false});
  });
};

exports.markMentionAsViewed = function(req, res){
  if (req.user){
    mysql.query(
      "UPDATE stories SET seen_at = NOW() WHERE user_id = ? and id = ?",
      [req.user.id, req.body.id],
      function(err, result){
        if (err){
          logger.error('Error marking story as read: ' + err);
        }
        redis.publish('notifications.mention.read', req.user.id, function(err){
          if (err)
            logger.error(err);
        });
      }
    );
  }
  res.send('OK');
};
