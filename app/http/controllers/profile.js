/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const
config = require('../../../lib/configuration'),
uuid   = require('node-uuid'),
logger = require('../../../lib/logger'),
mysql  = require('mysql').createClient(config.get('mysql')),
Redis  = require('../../../lib/redis');

/* 
 * Get for index
 */
exports.index = {
  get: function(req, res){
    mysql.query(
      "SELECT name FROM irc_channels", 
      function(err, rows){
        if (err){
          logger.error("Error retrieving IRC Channels in profile.js: " + err);
        }

        for(var i in rows){
          rows[i].displayName = rows[i].name.substr(1);
        }

        mysql.query(
          "SELECT title, url, verified FROM feeds WHERE user_id = ?",
          [req.user.id],
          function(err, feedRows){
            mysql.query(
              "SELECT token FROM watched_tokens WHERE user_id = ?",
              [req.user.id],
              function(err, tokens){
                for(var i in tokens){
                  tokens[i] = tokens[i].token;
                }
                res.render('profile/index', { user: req.user, channels:  rows, feeds: feedRows, watchedTokens: tokens});
              }
            );
          }
        );
      }
    );
  },
  put: function(req, res){
    // Only allow the saving of nick and realName
    req.user.nick = req.body.user.nick;
    req.user.realName = req.body.user.realName;
    req.user.save(function(err){
      if (err){
        logger.error("Error saving user in profile.js:" + err);
        res.send('"ERROR"', {status: 500});
      }
      else{
        res.send('"OK"');
      }
    });
  }
};

exports.watchedTokens = {
  put: function(req, res){
    console.log(req.body);
    var tokens = req.body.tokens;
    var values = [];
    var placeholders = [];
    for (var i in tokens){
      //Validate
      if (tokens[i].match(/^\w[\w\-\_]+$/)){
        values.push(req.user.id)
        values.push(tokens[i]);
        placeholders.push('(?, ?)');
      }
      else {
        res.send('"ERROR"', {status: 500});
        return;
      }
    }

    mysql.query(
      "DELETE FROM watched_tokens WHERE user_id = ?",
      [req.user.id],
      function(err, result){
        if (err)
          logger.error("Error deleting old tokens");

        mysql.query(
          "INSERT INTO watched_tokens (user_id, token) VALUES " + placeholders.join(','),
          values,
          function(err, result){
            if (err)
              logger.error("Error inserting new tokens: " + err);

            res.send('"OK"');
          }
        );
      }
    );
  }
}

/*
 * POST 
 */
exports.nick = {
  post: function(req, resp){
    // Look up the other details from the nick.
    var responseQueue = "irc-resp:" + uuid.v1();
    var redis = Redis.new();
    redis.lpush("irc:whois", JSON.stringify([req.body.user.nick, responseQueue]));
    resp.header('Content-Type', 'application/json');

    // Wait on reponse queue for 10 secs(max)
    redis.brpop(responseQueue, 2, function(err, data){
      redis.quit();

      req.user.nick = req.body.user.nick;

      if (data) {
        var whois = JSON.parse(data[1]);
        
        req.user.realName = whois.realname;
      
        resp.send(JSON.stringify({realName: req.user.realName, networks: whois.channels}));

      }
      else {
        resp.send(JSON.stringify({realName: '', networks: [], error: "No response received."}));
      }

      req.user.save(function(err){
        if (err)
          logger.error(err);
      });
      
    });
  }
};
