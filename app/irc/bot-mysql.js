/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var
config      = require('../../lib/configuration'),
mysql       = require('mysql').createClient(config.get('mysql')),
BotUtils    = require('./bot-utils'),
logger      = require('../../lib/logger');

module.exports = {
  clearNetworks: function(callback){
    mysql.query("DELETE FROM networks", function(){
      if (typeof(callback) == 'function'){
        callback();
      }
    });
  },

  insertNetworkUpdate: function(networks, nick, status, botUpdateId, callback){
    if (typeof(networks) == 'string'){
      networks = [networks];
    }
    if (networks.length > 0){


      mysql.query(
        "SELECT \
          users.id, \
          users.real_name as realName, \
          CONCAT('http://www.gravatar.com/avatar/', MD5(users.email)) as gravatar \
        FROM \
          users \
        WHERE \
           users.nick = ? limit 1", 
        [nick], 
        function(err, rows){

          if (err)
            logger.error(err);

          if (rows.length == 1){
            var row = rows[0];
            
            var placeholders = [];
            var values = [];

            for (var i in networks){
              placeholders.push("(?, ?, ?, ?)");
              values.push(BotUtils.normalizeIrcName(networks[i]));
              values.push(row.id);
              values.push(status);
              values.push(botUpdateId);
            }
            mysql.query(
              "REPLACE INTO networks (channel, user_id, status, bot_update_id) VALUES " + placeholders.join(', '),
              values,
              function(err){
                if (err)
                  logger.error(err);

                // Delete a previous network update.
                mysql.query("DELETE FROM networks where user_id = ? and bot_update_id <> ?", [row.id, botUpdateId]);

                if (typeof(callback) == 'function'){
                  callback({
                    'id': row.id,
                    'realName': row.realName,
                    'gravatar': row.gravatar,
                    'nick': nick,
                    'status': status,
                    'networks': networks
                  });
                }
              }
            );
          }
          else {
            logger.verbose('User not found for nick: ' + nick);
            if (typeof(callback) == 'function'){
              callback();
            }
          }
        }
      );
    }
    else {
      logger.error("Nick: " + nick + " wasn't in any chans");
    }
  },

  markUserAsOffline: function(nick, callback){
    mysql.query(
      "SELECT id FROM users WHERE nick = ? limit 1",
      [nick],
      function(error, rows){
        if (error){
          logger.error("Error finding user id: " + error);
          // We don't exec the callback.
          return;
        }
        
        // If we have a user for that nick, otherwise we don't care.
        if (rows[0] && rows[0].id){
          mysql.query(
            "DELETE FROM networks WHERE networks.user_id = ?",
            [nick],
            function(error){
              if (typeof(callback) == 'function'){
                callback(rows[0].id);
              }
            }
          );
        }
        else {
          if (typeof(callback) == 'function'){
            callback();
          }
        }
      }
    );
  }
}
